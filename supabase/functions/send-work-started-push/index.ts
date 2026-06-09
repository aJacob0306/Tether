import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PeerTokenRow = {
  expo_push_token: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing auth" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Function is missing Supabase env vars" }, 500);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const domain = typeof body.domain === "string" ? body.domain.trim() : "";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();

    const displayName = profile?.display_name?.trim() || "Someone";

    const { data: peerTokens, error: tokensError } = await supabaseAdmin.rpc(
      "get_peer_push_tokens",
      { p_user_id: user.id },
    );

    if (tokensError) {
      throw tokensError;
    }

    const tokens = ((peerTokens ?? []) as PeerTokenRow[])
      .map((row) => row.expo_push_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return jsonResponse({ ok: true, sent: 0 });
    }

    const messageBody = domain
      ? `${displayName} started working on ${domain} — don't fall behind!`
      : `${displayName} started working — don't fall behind!`;

    const messages = tokens.map((token) => ({
      to: token,
      sound: "default",
      title: "Tether",
      body: messageBody,
      data: { type: "work_started", user_id: user.id, domain },
    }));

    const pushResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const pushResult = await pushResponse.json().catch(() => null);

    if (!pushResponse.ok) {
      return jsonResponse(
        { error: "Expo push failed", details: pushResult },
        502,
      );
    }

    return jsonResponse({ ok: true, sent: tokens.length, pushResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
