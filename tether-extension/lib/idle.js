export const IDLE_DETECTION_SECONDS = 2 * 60;
export const IDLE_GRACE_MS = 30 * 1000;
export const STALE_SESSION_MS = 15 * 60 * 1000;

export function queryIdleState() {
  return new Promise((resolve) => {
    if (!chrome.idle?.queryState) {
      resolve("active");
      return;
    }

    chrome.idle.queryState(IDLE_DETECTION_SECONDS, resolve);
  });
}

export function isIdleState(state) {
  return state === "idle" || state === "locked";
}

export function idleSessionEndedAt(sessionStartedAtIso) {
  const idleStartedAt = Date.now() - IDLE_DETECTION_SECONDS * 1000;
  const endedAt = Math.min(Date.now(), idleStartedAt + IDLE_GRACE_MS);

  if (sessionStartedAtIso) {
    const sessionStartedAt = new Date(sessionStartedAtIso).getTime();
    if (Number.isFinite(sessionStartedAt)) {
      return new Date(Math.max(sessionStartedAt, endedAt)).toISOString();
    }
  }

  return new Date(endedAt).toISOString();
}
