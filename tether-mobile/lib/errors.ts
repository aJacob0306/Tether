export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: string }).message);

    if (
      message.includes("Could not find the table") ||
      (message.includes("relation") && message.includes("tethers"))
    ) {
      return "Database not set up. Run supabase/migrations/002_tethers.sql in the Supabase SQL Editor.";
    }

    if (message.includes("get_tether_board") && message.includes("session_started_at")) {
      return "Board API out of date. Run supabase/migrations/008_tether_board_sessions.sql in Supabase.";
    }

    if (message.includes("get_tether_daily_work_total")) {
      return "Daily work timer not set up. Run supabase/migrations/011_tether_daily_work_total.sql in Supabase.";
    }

    if (message.includes("get_tether_daily_member_logs")) {
      return "Detailed log not set up. Run supabase/migrations/012_tether_daily_member_logs.sql in Supabase.";
    }

    if (message.includes("tether_allowed_targets") || message.includes("get_my_allowed_targets")) {
      return "Allowlist not set up. Run supabase/migrations/013_tether_allowed_targets.sql in Supabase.";
    }

    if (message.includes("work_sessions")) {
      return "Work sessions not set up. Run supabase/migrations/007_work_sessions.sql and 008_tether_board_sessions.sql in Supabase.";
    }

    if (message.includes("row-level security") || message.includes("permission denied")) {
      return `${message} If this persists, run 003_tether_creator_select.sql in Supabase.`;
    }

    return message;
  }

  return fallback;
}
