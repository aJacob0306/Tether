import { clearAllowlistCache, getAllowlist, refreshAllowlist } from "./lib/allowlist.js";
import {
  checkSupabaseReachable,
  getSession,
  signIn,
  signOut,
} from "./lib/api.js";
import { closeOpenWorkSession } from "./lib/sessions.js";
import { syncActiveTab } from "./lib/sync.js";

const signedOutView = document.getElementById("signed-out-view");
const signedInView = document.getElementById("signed-in-view");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const signInBtn = document.getElementById("sign-in-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const userEmail = document.getElementById("user-email");
const statusEl = document.getElementById("status");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

async function loadAllowlistStatus() {
  try {
    const allowlist = await getAllowlist();
    const domainCount = allowlist.domains.length;
    const appCount = allowlist.apps.length;

    if (!domainCount && !appCount) {
      setStatus(
        "No allowlist yet. Add allowed websites in the mobile app under Rules.",
        true,
      );
      return;
    }

    const parts = [];
    if (domainCount) parts.push(`${domainCount} website${domainCount === 1 ? "" : "s"}`);
    if (appCount) parts.push(`${appCount} app${appCount === 1 ? "" : "s"}`);
    setStatus(`Allowlist loaded: ${parts.join(", ")}. Only matching tabs sync.`);
  } catch (error) {
    setStatus(`Could not load allowlist: ${error.message}`, true);
  }
}

function showSignedIn(email) {
  signedOutView.style.display = "none";
  signedInView.style.display = "block";
  userEmail.textContent = email;
  loadAllowlistStatus();
}

function showSignedOut() {
  signedOutView.style.display = "block";
  signedInView.style.display = "none";
  userEmail.textContent = "";
  setStatus("");
}

async function init() {
  try {
    const reachable = await checkSupabaseReachable();
    if (!reachable) {
      setStatus(
        "Cannot reach Supabase. Check config.js URL/key (Dashboard → Project Settings → API) and that the project is active.",
        true,
      );
    }

    const session = await getSession();
    if (session?.user?.email) {
      showSignedIn(session.user.email);
    } else {
      showSignedOut();
    }
  } catch {
    setStatus("Add Supabase credentials to config.js first.", true);
    signInBtn.disabled = true;
  }
}

signInBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setStatus("Enter your email and password.", true);
    return;
  }

  signInBtn.disabled = true;
  setStatus("Signing in...");

  try {
    const session = await signIn(email, password);
    passwordInput.value = "";
    showSignedIn(session.user.email);

    try {
      await refreshAllowlist({ force: true });
      const result = await syncActiveTab();
      if (result.synced) {
        setStatus(`Synced: ${result.title || result.url}`);
      } else if (!result.hasAllowlist) {
        setStatus("Signed in. Add allowed websites in the mobile app under Rules.", true);
      } else if (!result.allowed) {
        setStatus("This tab is not on your tether allowlist.", true);
      } else {
        setStatus("This tab cannot be synced.", true);
      }
    } catch (syncError) {
      setStatus(`Signed in, but sync failed: ${syncError.message}`, true);
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    signInBtn.disabled = false;
  }
});

signOutBtn.addEventListener("click", async () => {
  await closeOpenWorkSession().catch(() => {});
  await clearAllowlistCache();
  await signOut();
  showSignedOut();
});

document.getElementById("sync-now-btn").addEventListener("click", async () => {
  const syncBtn = document.getElementById("sync-now-btn");
  syncBtn.disabled = true;
  setStatus("Syncing...");

  try {
    await refreshAllowlist({ force: true });
    const result = await syncActiveTab();
    if (result.synced) {
      setStatus(`Synced: ${result.title || result.url}`);
    } else if (!result.hasAllowlist) {
      setStatus("Add allowed websites in the mobile app under Rules.", true);
    } else if (!result.allowed) {
      setStatus("This tab is not on your tether allowlist.", true);
    } else {
      setStatus("This tab cannot be synced.", true);
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    syncBtn.disabled = false;
  }
});

init();
