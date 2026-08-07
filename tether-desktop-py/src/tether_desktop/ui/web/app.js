"use strict";

/**
 * Front end for the desktop companion.
 *
 * All state lives in Python. This file renders whatever `render(state)` is handed and
 * forwards button presses over the pywebview bridge, so the window stays a thin shell.
 */

const el = (id) => document.getElementById(id);

const nodes = {
  heroTitle: el("hero-title"),
  heroSubtitle: el("hero-subtitle"),
  signInCard: el("sign-in-card"),
  signedInCard: el("signed-in-card"),
  email: el("email"),
  password: el("password"),
  signInButton: el("sign-in-button"),
  syncButton: el("sync-button"),
  signOutButton: el("sign-out-button"),
  avatar: el("avatar"),
  signedInEmail: el("signed-in-email"),
  deviceName: el("device-name"),
  status: el("status"),
  discoveryPill: el("discovery-pill"),
  discoveryCount: el("discovery-count"),
  trackingPill: el("tracking-pill"),
  trackingStatus: el("tracking-status"),
  trackingTarget: el("tracking-target"),
  trackingIcon: el("tracking-icon"),
  trackingTargetName: el("tracking-target-name"),
};

const buttons = [nodes.signInButton, nodes.syncButton, nodes.signOutButton];

function setBusy(button, busy) {
  buttons.forEach((b) => {
    b.disabled = busy;
    b.dataset.busy = String(busy && b === button);
  });
}

/** Python is the single source of truth; this only paints. */
function render(state) {
  const signedIn = Boolean(state.email);

  nodes.signInCard.classList.toggle("hidden", signedIn);
  nodes.signedInCard.classList.toggle("hidden", !signedIn);

  nodes.heroTitle.textContent = signedIn ? "Tracking your work" : "Discover installed apps";
  nodes.heroSubtitle.textContent = signedIn
    ? "This computer is registered. Allowlisted apps you focus are shared with your tether peers."
    : "Sign in with your Tether account to register this computer and upload installed apps for mobile tether setup.";

  if (signedIn) {
    nodes.signedInEmail.textContent = state.email;
    nodes.avatar.textContent = state.email.trim().charAt(0) || "?";
    nodes.deviceName.textContent = state.device_name
      ? `Registered as ${state.device_name}`
      : "Device will register on next sync.";
  }

  nodes.status.textContent = state.status || "";
  nodes.status.classList.toggle("status-text--error", Boolean(state.status_is_error));

  const hasCount = typeof state.synced_count === "number";
  nodes.discoveryPill.classList.toggle("hidden", !hasCount);
  if (hasCount) {
    nodes.discoveryCount.textContent = `${state.synced_count} apps`;
  }

  renderTracking(state);
}

function renderTracking(state) {
  nodes.trackingStatus.textContent = state.tracking || "";

  const tone = state.tracking_tone || "offline";
  nodes.trackingPill.className = `pill pill--${tone}`;
  nodes.trackingPill.querySelector(".pill__label").textContent = {
    working: "Working",
    idle: "Idle",
    busy: "Syncing",
    offline: "Offline",
  }[tone];

  // Only claim an app while actually working; the persisted state remembers the last
  // target across idle periods, and showing it beside an "Idle" pill reads as a bug.
  const target = tone === "working" ? state.tracking_target : null;
  nodes.trackingTarget.classList.toggle("hidden", !target);
  if (target) {
    nodes.trackingTargetName.textContent = target.label;
    if (target.icon) {
      nodes.trackingIcon.src = target.icon;
      nodes.trackingIcon.classList.remove("hidden");
    } else {
      nodes.trackingIcon.classList.add("hidden");
    }
  }
}

// -- actions ---------------------------------------------------------------

async function call(button, method, ...args) {
  setBusy(button, true);
  try {
    render(await window.pywebview.api[method](...args));
  } catch (error) {
    // The bridge only rejects if Python itself failed; expected failures come back
    // inside the state as a status message.
    nodes.status.textContent = String(error);
    nodes.status.classList.add("status-text--error");
  } finally {
    setBusy(button, false);
  }
}

nodes.signInCard.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = nodes.email.value.trim();
  const password = nodes.password.value;
  if (!email || !password) {
    nodes.status.textContent = "Enter your email and password.";
    nodes.status.classList.add("status-text--error");
    return;
  }
  nodes.password.value = "";
  call(nodes.signInButton, "sign_in", email, password);
});

nodes.syncButton.addEventListener("click", () => call(nodes.syncButton, "sync"));
nodes.signOutButton.addEventListener("click", () => call(nodes.signOutButton, "sign_out"));

// Python pushes tracker updates here from its polling thread.
window.tetherPush = render;

window.addEventListener("pywebviewready", async () => {
  render(await window.pywebview.api.initial_state());
  nodes.email.focus();
});
