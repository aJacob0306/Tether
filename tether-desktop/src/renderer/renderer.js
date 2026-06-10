const signInForm = document.querySelector("#sign-in-form");
const signedInCard = document.querySelector("#signed-in-card");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const signInButton = document.querySelector("#sign-in-button");
const syncButton = document.querySelector("#sync-button");
const signOutButton = document.querySelector("#sign-out-button");
const signedInEmail = document.querySelector("#signed-in-email");
const deviceName = document.querySelector("#device-name");
const statusText = document.querySelector("#status");
const trackingStatusText = document.querySelector("#tracking-status");

function setBusy(isBusy, label = "Working...") {
  signInButton.disabled = isBusy;
  syncButton.disabled = isBusy;
  if (isBusy) statusText.textContent = label;
}

function setStatus(message) {
  statusText.textContent = message;
}

function setTrackingStatus(message) {
  trackingStatusText.textContent = message;
}

function renderSignedOut() {
  signInForm.classList.remove("hidden");
  signedInCard.classList.add("hidden");
  signedInEmail.textContent = "";
  deviceName.textContent = "";
  setTrackingStatus("Sign in to start tracking allowlisted apps.");
}

function renderSignedIn({ session, device }) {
  signInForm.classList.add("hidden");
  signedInCard.classList.remove("hidden");
  signedInEmail.textContent = session?.email ?? "Signed in";
  deviceName.textContent = device?.display_name
    ? `Registered device: ${device.display_name}`
    : "Device will register on next sync.";
}

function describeSyncResult(sync) {
  const detected = sync.detectedCount ?? 0;
  const uploaded = sync.uploadedCount ?? detected;
  const timestamp = sync.syncedAt ? new Date(sync.syncedAt).toLocaleString() : "now";
  return `Synced ${uploaded} app${uploaded === 1 ? "" : "s"} (${detected} detected) at ${timestamp}.`;
}

async function loadStatus() {
  try {
    const status = await window.tetherDesktop.getStatus();
    if (status.session) {
      renderSignedIn(status);
      setStatus("Ready to refresh detected apps.");
      setTrackingStatus(
        status.tracking?.targetLabel
          ? `Tracking ${status.tracking.targetLabel}.`
          : "Watching for allowlisted desktop apps.",
      );
      return;
    }

    renderSignedOut();
    setStatus("Sign in to register this Mac and upload installed apps.");
  } catch (error) {
    renderSignedOut();
    setStatus(error.message || "Could not load status.");
  }
}

signInForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setStatus("Enter your email and password.");
    return;
  }

  setBusy(true, "Signing in, registering this Mac, and scanning apps...");
  try {
    const result = await window.tetherDesktop.signIn({ email, password });
    passwordInput.value = "";
    renderSignedIn(result);
    setStatus(describeSyncResult(result.sync));
    setTrackingStatus("Watching for allowlisted desktop apps.");
  } catch (error) {
    renderSignedOut();
    setStatus(error.message || "Sign in failed.");
  } finally {
    setBusy(false);
  }
});

syncButton.addEventListener("click", async () => {
  setBusy(true, "Scanning /Applications and ~/Applications...");
  try {
    const sync = await window.tetherDesktop.syncApps();
    setStatus(describeSyncResult(sync));
  } catch (error) {
    setStatus(error.message || "App sync failed.");
  } finally {
    setBusy(false);
  }
});

signOutButton.addEventListener("click", async () => {
  setBusy(true, "Signing out...");
  try {
    await window.tetherDesktop.signOut();
    renderSignedOut();
    setStatus("Signed out.");
  } catch (error) {
    setStatus(error.message || "Sign out failed.");
  } finally {
    setBusy(false);
  }
});

window.tetherDesktop.onTrackingStatus(({ message }) => {
  if (message) setTrackingStatus(message);
});

loadStatus();
