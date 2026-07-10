export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: string }).message);

    if (message.includes("detected_tools") || message.includes("devices")) {
      return "Desktop discovery not set up. Run supabase/migrations/015_desktop_discovery.sql in Supabase.";
    }

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

    if (message.includes("get_my_personal_log")) {
      return "Personal log not set up. Run supabase/migrations/022_personal_log.sql in Supabase.";
    }

    if (
      message.includes("leave_tether") ||
      message.includes("delete_tether")
    ) {
      return "Leave/delete not set up. Run supabase/migrations/024_leave_delete_tether.sql in Supabase.";
    }

    if (
      message.includes("active_tether") ||
      message.includes("ensure_my_active_tether") ||
      message.includes("set_my_active_tether") ||
      message.includes("find_my_allowlist_conflicts")
    ) {
      return "Active tether not set up. Run supabase/migrations/023_active_tether_attribution.sql in Supabase.";
    }

    if (message.includes("tether_allowed_targets") || message.includes("get_my_allowed_targets")) {
      return "Allowlist not set up. Run supabase/migrations/013_tether_allowed_targets.sql in Supabase.";
    }

    if (message.includes("push_tokens") || message.includes("register_push_token")) {
      return "Push notifications not set up. Run supabase/migrations/014_push_notifications.sql in Supabase.";
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
