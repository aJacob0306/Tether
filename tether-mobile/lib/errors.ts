export function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message: string }).message);

    if (
      message.includes("Could not find the table") ||
      (message.includes("relation") && message.includes("tethers"))
    ) {
      return "Database not set up. Run supabase/migrations/002_tethers.sql in the Supabase SQL Editor.";
    }

    if (message.includes("row-level security") || message.includes("permission denied")) {
      return `${message} If this persists, run 003_tether_creator_select.sql in Supabase.`;
    }

    return message;
  }

  return fallback;
}
