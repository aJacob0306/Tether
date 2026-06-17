import { useCallback, useEffect, useRef, useState } from "react";
import {
  deriveStatus,
  getLocalDayWindow,
  getLocalWeekBounds,
  getLocalWeekDayWindows,
  isSameLocalDay,
  type LocalDayWindow,
} from "../lib/status";
import {
  supabase,
  type ActiveTab,
  type DailyMemberLog,
  type MemberActivity,
  type OpenWorkSession,
  type Tether,
  type WeeklyWorkDay,
  type WorkSession,
} from "../lib/supabase";
import {
  fetchTether,
  fetchTetherBoard,
  fetchTetherDailyMemberLogs,
  fetchTetherLifetimeWorkTotal,
  fetchTetherWeeklyWorkTotals,
} from "../lib/tethers";

type TetherBoardState = {
  tether: Tether | null;
  members: MemberActivity[];
  loading: boolean;
  refreshing: boolean;
  error: string;
  dailyWorkMs: number;
  lifetimeWorkMs: number;
  weeklyWorkDays: WeeklyWorkDay[];
  logMemberLogs: DailyMemberLog[];
  logDayWindow: LocalDayWindow;
  logDayLoading: boolean;
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
    target_type: row.target_type ?? "domain",
    target_value: row.target_value ?? row.domain,
    target_display_name: row.target_display_name ?? row.target_value ?? row.domain,
    bundle_identifier: row.bundle_identifier ?? null,
    platform: row.platform ?? null,
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
  const initialDayWindow = getLocalDayWindow();
  const [state, setState] = useState<TetherBoardState>({
    tether: null,
    members: [],
    loading: true,
    refreshing: false,
    error: "",
    dailyWorkMs: 0,
    lifetimeWorkMs: 0,
    weeklyWorkDays: [],
    logMemberLogs: [],
    logDayWindow: initialDayWindow,
    logDayLoading: false,
    localDayWindow: initialDayWindow,
  });
  const localDayStartRef = useRef(initialDayWindow.dayStart.getTime());
  const logDayWindowRef = useRef(initialDayWindow);

  const loadLogDay = useCallback(
    async (dayWindow: LocalDayWindow) => {
      if (!tetherId) return;

      logDayWindowRef.current = dayWindow;
      setState((prev) => ({ ...prev, logDayLoading: true }));

      try {
        const logMemberLogs = await fetchTetherDailyMemberLogs(
          tetherId,
          dayWindow.dayStart,
          dayWindow.dayEnd,
        );
        setState((prev) => ({
          ...prev,
          logMemberLogs,
          logDayWindow: dayWindow,
          logDayLoading: false,
        }));
      } catch {
        setState((prev) => ({ ...prev, logDayLoading: false }));
      }
    },
    [tetherId],
  );

  const loadBoard = useCallback(async () => {
    if (!tetherId) return;

    const localDayWindow = getLocalDayWindow();
    const localWeekDays = getLocalWeekDayWindows();
    const logDayWindow = logDayWindowRef.current;
    const [tether, members, weeklyWorkDays, lifetimeWorkMs, logMemberLogs] = await Promise.all([
      fetchTether(tetherId),
      fetchTetherBoard(tetherId),
      fetchTetherWeeklyWorkTotals(tetherId, localWeekDays),
      fetchTetherLifetimeWorkTotal(tetherId),
      fetchTetherDailyMemberLogs(tetherId, logDayWindow.dayStart, logDayWindow.dayEnd),
    ]);
    const dailyWorkMs =
      weeklyWorkDays.find((day) => day.key === localDayWindow.dayStart.toISOString())?.workMs ?? 0;

    localDayStartRef.current = localDayWindow.dayStart.getTime();

    setState((prev) => ({
      ...prev,
      tether,
      members,
      dailyWorkMs,
      lifetimeWorkMs,
      weeklyWorkDays,
      logMemberLogs,
      localDayWindow,
      error: "",
    }));
  }, [tetherId]);

  const shiftLogDay = useCallback(
    (delta: -1 | 1) => {
      if (!tetherId) return;

      const { weekStart } = getLocalWeekBounds();
      const todayWindow = getLocalDayWindow();
      const prevWindow = logDayWindowRef.current;
      const nextStart = new Date(prevWindow.dayStart);
      nextStart.setDate(nextStart.getDate() + delta);
      const nextWindow = getLocalDayWindow(nextStart);

      if (nextWindow.dayStart.getTime() < weekStart.getTime()) return;
      if (nextWindow.dayStart.getTime() > todayWindow.dayStart.getTime()) return;

      setState((prev) => ({ ...prev, logDayWindow: nextWindow, logDayLoading: true }));
      loadLogDay(nextWindow);
    },
    [loadLogDay, tetherId],
  );

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
      const currentDayWindow = getLocalDayWindow();
      const currentDayStart = currentDayWindow.dayStart.getTime();
      if (localDayStartRef.current !== currentDayStart) {
        const previousTodayStart = localDayStartRef.current;
        localDayStartRef.current = currentDayStart;

        setState((prev) => {
          const wasViewingToday = prev.logDayWindow.dayStart.getTime() === previousTodayStart;
          const nextLogDayWindow = wasViewingToday ? currentDayWindow : prev.logDayWindow;
          logDayWindowRef.current = nextLogDayWindow;
          return {
            ...prev,
            logDayWindow: nextLogDayWindow,
            localDayWindow: currentDayWindow,
          };
        });

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

  const { weekStart } = getLocalWeekBounds();
  const canGoPreviousLogDay = state.logDayWindow.dayStart.getTime() > weekStart.getTime();
  const canGoNextLogDay = !isSameLocalDay(state.logDayWindow.dayStart, new Date());

  return {
    ...state,
    refresh,
    shiftLogDay,
    canGoPreviousLogDay,
    canGoNextLogDay,
  };
}
