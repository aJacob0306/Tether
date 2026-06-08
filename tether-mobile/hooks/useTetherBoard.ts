import { useCallback, useEffect, useRef, useState } from "react";
import { deriveStatus, getLocalDayWindow, type LocalDayWindow } from "../lib/status";
import {
  supabase,
  type ActiveTab,
  type DailyMemberLog,
  type MemberActivity,
  type OpenWorkSession,
  type Tether,
  type WorkSession,
} from "../lib/supabase";
import {
  fetchTether,
  fetchTetherBoard,
  fetchTetherDailyMemberLogs,
  fetchTetherDailyWorkTotal,
} from "../lib/tethers";

type TetherBoardState = {
  tether: Tether | null;
  members: MemberActivity[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  dailyWorkMs: number;
  dailyMemberLogs: DailyMemberLog[];
  localDayWindow: LocalDayWindow;
};

function openSessionFromRow(row: WorkSession | null | undefined): OpenWorkSession | null {
  if (!row || row.ended_at) return null;

  return {
    started_at: row.started_at,
    updated_at: row.updated_at ?? row.started_at,
    domain: row.domain,
    url: row.url,
    title: row.title,
  };
}

function memberWithActivity(
  member: MemberActivity,
  activeTab: ActiveTab | null,
  openSession: OpenWorkSession | null,
): MemberActivity {
  return {
    ...member,
    activeTab,
    openSession,
    status: deriveStatus(activeTab?.updated_at, openSession?.updated_at),
  };
}

export function useTetherBoard(tetherId: string | undefined) {
  const [state, setState] = useState<TetherBoardState>({
    tether: null,
    members: [],
    loading: true,
    refreshing: false,
    error: "",
    dailyWorkMs: 0,
    dailyMemberLogs: [],
    localDayWindow: getLocalDayWindow(),
  });
  const localDayStartRef = useRef(state.localDayWindow.dayStart.getTime());

  const loadBoard = useCallback(async () => {
    if (!tetherId) return;

    const localDayWindow = getLocalDayWindow();
    const [tether, members, dailyWorkMs, dailyMemberLogs] = await Promise.all([
      fetchTether(tetherId),
      fetchTetherBoard(tetherId),
      fetchTetherDailyWorkTotal(tetherId, localDayWindow.dayStart, localDayWindow.dayEnd),
      fetchTetherDailyMemberLogs(tetherId, localDayWindow.dayStart, localDayWindow.dayEnd),
    ]);

    localDayStartRef.current = localDayWindow.dayStart.getTime();

    setState((prev) => ({
      ...prev,
      tether,
      members,
      dailyWorkMs,
      dailyMemberLogs,
      localDayWindow,
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
              nextMembers[memberIndex] = memberWithActivity(member, null, member.openSession);
            } else {
              const activeTab = payload.new as ActiveTab;
              nextMembers[memberIndex] = memberWithActivity(
                member,
                activeTab,
                member.openSession,
              );
            }

            return { ...prev, members: nextMembers };
          });

          if (!cancelled) {
            loadBoard().catch(() => {});
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_sessions",
        },
        (payload) => {
          setState((prev) => {
            const row =
              payload.eventType === "DELETE"
                ? (payload.old as WorkSession)
                : (payload.new as WorkSession);

            const memberIndex = prev.members.findIndex((member) => member.user_id === row.user_id);
            if (memberIndex === -1) return prev;

            const nextMembers = [...prev.members];
            const member = nextMembers[memberIndex];

            let openSession = member.openSession;

            if (payload.eventType === "DELETE") {
              openSession = null;
            } else if (row.ended_at) {
              openSession = null;
            } else {
              openSession = openSessionFromRow(row);
            }

            nextMembers[memberIndex] = memberWithActivity(
              member,
              member.activeTab,
              openSession,
            );

            return { ...prev, members: nextMembers };
          });

          if (!cancelled) {
            loadBoard().catch(() => {});
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          loadBoard().catch(() => {});
        }
      });

    const pollInterval = setInterval(() => {
      loadBoard().catch(() => {});
    }, 30_000);

    const statusInterval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        members: prev.members.map((member) => ({
          ...member,
          status: deriveStatus(member.activeTab?.updated_at, member.openSession?.updated_at),
        })),
      }));
    }, 30_000);

    const dayBoundaryInterval = setInterval(() => {
      const currentDayStart = getLocalDayWindow().dayStart.getTime();
      if (localDayStartRef.current !== currentDayStart) {
        loadBoard().catch(() => {});
      }
    }, 60_000);

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      clearInterval(statusInterval);
      clearInterval(dayBoundaryInterval);
      supabase.removeChannel(channel);
    };
  }, [loadBoard, tetherId]);

  return { ...state, refresh };
}
