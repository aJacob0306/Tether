import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { fetchMyPersonalLog, type PersonalLog } from "../lib/personal-log";
import { getLocalDayWindow } from "../lib/status";

type PersonalLogState = {
  log: PersonalLog | null;
  loading: boolean;
  refreshing: boolean;
  error: string;
  localDayStart: Date;
};

const EMPTY_LOG: PersonalLog = {
  lifetimeWorkMs: 0,
  todayWorkMs: 0,
  streakDays: 0,
  topTargets: [],
  weeklyWorkDays: [],
  tetherTotals: [],
};

export function usePersonalLog() {
  const [state, setState] = useState<PersonalLogState>({
    log: null,
    loading: true,
    refreshing: false,
    error: "",
    localDayStart: getLocalDayWindow().dayStart,
  });

  const load = useCallback(async () => {
    const dayWindow = getLocalDayWindow();
    const log = await fetchMyPersonalLog();
    setState((prev) => ({
      ...prev,
      log,
      error: "",
      localDayStart: dayWindow.dayStart,
    }));
  }, []);

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, refreshing: true, error: "" }));
    try {
      await load();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : "Failed to refresh personal log.",
      }));
    } finally {
      setState((prev) => ({ ...prev, refreshing: false }));
    }
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      setState((prev) => ({ ...prev, loading: true, error: "" }));
      load()
        .catch((error) => {
          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              error:
                error instanceof Error ? error.message : "Failed to load personal log.",
            }));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setState((prev) => ({ ...prev, loading: false }));
          }
        });

      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  return {
    log: state.log ?? EMPTY_LOG,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    localDayStart: state.localDayStart,
    refresh,
  };
}
