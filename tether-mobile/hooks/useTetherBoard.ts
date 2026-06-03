import { useCallback, useEffect, useState } from "react";
import { deriveStatus } from "../lib/status";
import { supabase, type ActiveTab, type MemberActivity, type Tether } from "../lib/supabase";
import { fetchTether, fetchTetherBoard } from "../lib/tethers";

type TetherBoardState = {
  tether: Tether | null;
  members: MemberActivity[];
  loading: boolean;
  refreshing: boolean;
  error: string;
};

export function useTetherBoard(tetherId: string | undefined) {
  const [state, setState] = useState<TetherBoardState>({
    tether: null,
    members: [],
    loading: true,
    refreshing: false,
    error: "",
  });

  const loadBoard = useCallback(async () => {
    if (!tetherId) return;

    const [tether, members] = await Promise.all([
      fetchTether(tetherId),
      fetchTetherBoard(tetherId),
    ]);

    setState((prev) => ({
      ...prev,
      tether,
      members,
      error: "",
    }));
  }, [tetherId]);

  const refresh = useCallback(async () => {
    if (!tetherId) return;

    setState((prev) => ({ ...prev, refreshing: true, error: "" }));

    try {
      await loadBoard();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to refresh.",
      }));
    } finally {
      setState((prev) => ({ ...prev, refreshing: false }));
    }
  }, [loadBoard, tetherId]);

  useEffect(() => {
    if (!tetherId) return;

    let cancelled = false;

    setState((prev) => ({ ...prev, loading: true, error: "" }));

    loadBoard()
      .catch((error) => {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Failed to load tether.",
          }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false }));
        }
      });

    const channel = supabase
      .channel(`tether-board-${tetherId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "active_tabs",
        },
        (payload) => {
          setState((prev) => {
            const userId =
              payload.eventType === "DELETE"
                ? (payload.old as ActiveTab).user_id
                : (payload.new as ActiveTab).user_id;

            const memberIndex = prev.members.findIndex((member) => member.user_id === userId);
            if (memberIndex === -1) return prev;

            const nextMembers = [...prev.members];
            const member = nextMembers[memberIndex];

            if (payload.eventType === "DELETE") {
              nextMembers[memberIndex] = {
                ...member,
                activeTab: null,
                status: "offline",
              };
            } else {
              const activeTab = payload.new as ActiveTab;
              nextMembers[memberIndex] = {
                ...member,
                activeTab,
                status: deriveStatus(activeTab.updated_at),
              };
            }

            return { ...prev, members: nextMembers };
          });
        },
      )
      .subscribe();

    const statusInterval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        members: prev.members.map((member) => ({
          ...member,
          status: deriveStatus(member.activeTab?.updated_at),
        })),
      }));
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(statusInterval);
      supabase.removeChannel(channel);
    };
  }, [loadBoard, tetherId]);

  return { ...state, refresh };
}
