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
};

export type WorkStatus = "working" | "idle" | "offline";

export type MemberActivity = {
  user_id: string;
  display_name: string;
  activeTab: ActiveTab | null;
  status: WorkStatus;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
