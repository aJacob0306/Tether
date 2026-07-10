import { getErrorMessage } from "./errors";
import {
  getLocalDayWindow,
  getLocalWeekBounds,
  getLocalWeekDayWindows,
  type LocalWeekDayWindow,
} from "./status";
import {
  supabase,
  type AllowedTargetType,
  type DailyTopDomain,
  type WeeklyWorkDay,
} from "./supabase";

export type PersonalTetherTotal = {
  tetherId: string;
  tetherName: string;
  workMs: number;
};

export type PersonalLog = {
  lifetimeWorkMs: number;
  todayWorkMs: number;
  streakDays: number;
  topTargets: DailyTopDomain[];
  weeklyWorkDays: WeeklyWorkDay[];
  tetherTotals: PersonalTetherTotal[];
};

type PersonalLogRpc = {
  lifetime_work_ms?: number | string | null;
  today_work_ms?: number | string | null;
  streak_days?: number | string | null;
  top_targets?: unknown;
  week_days?: unknown;
  tether_totals?: unknown;
};

function parseTopTargets(value: unknown): DailyTopDomain[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as {
        domain?: unknown;
        target_type?: unknown;
        work_ms?: unknown;
      };
      if (typeof item.domain !== "string") return null;

      const target: DailyTopDomain = {
        domain: item.domain,
        workMs: Number(item.work_ms ?? 0),
      };

      if (item.target_type === "app" || item.target_type === "domain") {
        target.targetType = item.target_type as AllowedTargetType;
      }

      return target;
    })
    .filter((row): row is DailyTopDomain => row != null);
}

function parseWeekDays(
  value: unknown,
  weekWindows: LocalWeekDayWindow[],
): WeeklyWorkDay[] {
  const workByKey = new Map<string, number>();

  if (Array.isArray(value)) {
    value.forEach((row) => {
      if (!row || typeof row !== "object") return;
      const item = row as { day_start?: unknown; work_ms?: unknown };
      if (typeof item.day_start !== "string") return;
      workByKey.set(new Date(item.day_start).toISOString(), Number(item.work_ms ?? 0));
    });
  }

  return weekWindows.map((day) => ({
    ...day,
    workMs: workByKey.get(day.key) ?? 0,
  }));
}

function parseTetherTotals(value: unknown): PersonalTetherTotal[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as {
        tether_id?: unknown;
        tether_name?: unknown;
        work_ms?: unknown;
      };
      if (typeof item.tether_id !== "string" || typeof item.tether_name !== "string") {
        return null;
      }

      return {
        tetherId: item.tether_id,
        tetherName: item.tether_name,
        workMs: Number(item.work_ms ?? 0),
      };
    })
    .filter((row): row is PersonalTetherTotal => row != null);
}

export async function fetchMyPersonalLog(now = new Date()): Promise<PersonalLog> {
  const dayWindow = getLocalDayWindow(now);
  const { weekStart, weekEnd } = getLocalWeekBounds(now);
  const weekWindows = getLocalWeekDayWindows(now);

  const { data, error } = await supabase.rpc("get_my_personal_log", {
    p_day_start: dayWindow.dayStart.toISOString(),
    p_day_end: dayWindow.dayEnd.toISOString(),
    p_week_start: weekStart.toISOString(),
    p_week_end: weekEnd.toISOString(),
  });

  if (error) {
    throw new Error(getErrorMessage(error, "Failed to load personal log."));
  }

  const payload = (data ?? {}) as PersonalLogRpc;

  return {
    lifetimeWorkMs: Number(payload.lifetime_work_ms ?? 0),
    todayWorkMs: Number(payload.today_work_ms ?? 0),
    streakDays: Number(payload.streak_days ?? 0),
    topTargets: parseTopTargets(payload.top_targets),
    weeklyWorkDays: parseWeekDays(payload.week_days, weekWindows),
    tetherTotals: parseTetherTotals(payload.tether_totals),
  };
}
