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

function showSignedIn(email) {
  signedOutView.style.display = "none";
  signedInView.style.display = "block";
  userEmail.textContent = email;
  setStatus("Active tab sync is running.");
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
      const result = await syncActiveTab();
      setStatus(`Synced: ${result.title || result.url}`);
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
  await signOut();
  showSignedOut();
});

document.getElementById("sync-now-btn").addEventListener("click", async () => {
  const syncBtn = document.getElementById("sync-now-btn");
  syncBtn.disabled = true;
  setStatus("Syncing...");

  try {
    const result = await syncActiveTab();
    setStatus(`Synced: ${result.title || result.url}`);
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    syncBtn.disabled = false;
  }
});

init();
