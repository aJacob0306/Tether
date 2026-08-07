"""Authentication and session persistence.

Ports the session handling from the Electron `src/main.js`. The saved session keeps
the same JSON shape Electron wrote, so `session.json` is interchangeable between the
two companions.
"""

from __future__ import annotations

from typing import Any

import httpx
from supabase import Client
from supabase_auth.errors import AuthRetryableError

from . import paths
from .config import SESSION_FILE, Config


class AuthError(RuntimeError):
    """Raised when an action needs a signed-in user and there isn't one."""


class SessionUnavailableError(AuthError):
    """Raised when a saved session could not be checked because Supabase was unreachable."""


# Failures of these kinds mean "we could not ask", not "the token is bad", so the saved
# session must survive them. Otherwise a flaky connection silently signs the user out.
_UNREACHABLE_ERRORS = (httpx.HTTPError, AuthRetryableError, OSError)


def _as_dict(session: Any) -> dict[str, Any]:
    return session.model_dump(mode="json")


class AuthStore:
    def __init__(self, supabase: Client, config: Config) -> None:
        self._supabase = supabase
        self._config = config
        self._session: dict[str, Any] | None = None

    @property
    def session(self) -> dict[str, Any] | None:
        return self._session

    def public_session(self) -> dict[str, str] | None:
        """The subset of session data that is safe to show in a UI."""
        user = (self._session or {}).get("user")
        if not user:
            return None
        return {"email": user.get("email"), "user_id": user.get("id")}

    def set_session(self, session: dict[str, Any] | None) -> None:
        if session and session.get("access_token") and session.get("refresh_token"):
            self._supabase.auth.set_session(session["access_token"], session["refresh_token"])
            self._session = session
            paths.write_json(SESSION_FILE, session)
            return

        self._session = None
        try:
            self._supabase.auth.sign_out()
        except Exception:
            # Signing out without a live session is not an error worth surfacing.
            pass
        paths.remove_json(SESSION_FILE)

    def load_saved_session(self) -> dict[str, Any] | None:
        saved = paths.read_json(SESSION_FILE)
        if not saved or not saved.get("access_token") or not saved.get("refresh_token"):
            return None

        try:
            response = self._supabase.auth.set_session(
                saved["access_token"], saved["refresh_token"]
            )
        except _UNREACHABLE_ERRORS as error:
            raise SessionUnavailableError(
                f"Could not reach Supabase to restore your session: {error}"
            ) from error
        except Exception:
            paths.remove_json(SESSION_FILE)
            return None

        if not response.session:
            paths.remove_json(SESSION_FILE)
            return None

        self._session = _as_dict(response.session)
        paths.write_json(SESSION_FILE, self._session)
        return self._session

    def ensure_session(self) -> dict[str, Any]:
        if not self._session:
            self.load_saved_session()

        if not (self._session or {}).get("user", {}).get("id"):
            raise AuthError("Sign in first.")

        # get_session refreshes the access token when it is close to expiring.
        current = self._supabase.auth.get_session()
        if current:
            self._session = _as_dict(current)
            paths.write_json(SESSION_FILE, self._session)

        assert self._session is not None
        return self._session

    def sign_in(self, email: str, password: str) -> dict[str, Any]:
        self._config.assert_configured()
        response = self._supabase.auth.sign_in_with_password(
            {"email": email.strip(), "password": password}
        )
        if not response.session:
            raise AuthError("Sign in failed.")

        session = _as_dict(response.session)
        self.set_session(session)
        return session

    def sign_out(self) -> None:
        self.set_session(None)

    def user_id(self) -> str:
        return self.ensure_session()["user"]["id"]

    def access_token(self) -> str:
        return self.ensure_session()["access_token"]
