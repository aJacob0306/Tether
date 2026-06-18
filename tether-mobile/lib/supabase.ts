import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to .env",
  );
}

export type ActiveTab = {
  user_id: string;
  url: string;
  title: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
};

export type Tether = {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  created_at: string;
};

export type TetherMember = {
  tether_id: string;
  user_id: string;
  joined_at: string;
  can_manage_allowlist: boolean;
};

export type WorkStatus = "working" | "idle" | "offline";

export type OpenWorkSession = {
  started_at: string;
  updated_at: string;
  domain: string;
  url: string;
  title: string;
  target_type: AllowedTargetType;
  target_value: string | null;
  target_display_name: string | null;
  bundle_identifier: string | null;
  platform: string | null;
};

export type WorkSession = OpenWorkSession & {
  id: string;
  user_id: string;
  ended_at: string | null;
};

export type MemberActivity = {
  user_id: string;
  display_name: string;
  activeTab: ActiveTab | null;
  openSession: OpenWorkSession | null;
  status: WorkStatus;
};

export type DailyTopDomain = {
  domain: string;
  workMs: number;
  targetType?: AllowedTargetType;
};

export type DailyMemberLog = {
  user_id: string;
  display_name: string;
  totalWorkMs: number;
  topDomains: DailyTopDomain[];
};

export type WeeklyWorkDay = {
  key: string;
  label: string;
  dayStart: Date;
  dayEnd: Date;
  workMs: number;
};

export type AllowedTargetType = "app" | "domain";

export type AllowedTarget = {
  id: string;
  tether_id: string;
  target_type: AllowedTargetType;
  value: string;
  detected_tool_id: string | null;
  display_name: string | null;
  bundle_identifier: string | null;
  platform: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type DetectedTool = {
  id: string;
  user_id: string;
  device_id: string;
  tool_type: AllowedTargetType;
  value: string;
  display_name: string;
  tool_key: string;
  bundle_identifier: string | null;
  install_path: string | null;
  platform: string;
  metadata: Record<string, unknown>;
  is_available: boolean;
  detected_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
