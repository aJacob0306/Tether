import httpx
import pytest
from supabase_auth.errors import AuthRetryableError

from tether_desktop import paths
from tether_desktop.auth import AuthError, AuthStore, SessionUnavailableError
from tether_desktop.config import SESSION_FILE, Config

CONFIG = Config("https://x.supabase.co", "key", True)
SAVED = {
    "access_token": "access",
    "refresh_token": "refresh",
    "user": {"id": "user-1", "email": "a@b.c"},
}


class FakeAuthApi:
    def __init__(self, on_set_session=None):
        self.on_set_session = on_set_session
        self.signed_out = False

    def set_session(self, access_token, refresh_token):
        if self.on_set_session:
            return self.on_set_session(access_token, refresh_token)
        raise AssertionError("unexpected set_session")

    def sign_out(self, options=None):
        self.signed_out = True

    def get_session(self):
        return None


class FakeSupabase:
    def __init__(self, auth):
        self.auth = auth


def store(on_set_session=None):
    return AuthStore(FakeSupabase(FakeAuthApi(on_set_session)), CONFIG)


class TestLoadSavedSession:
    def test_returns_none_without_a_saved_file(self):
        assert store().load_saved_session() is None

    def test_ignores_a_partial_session_file(self):
        paths.write_json(SESSION_FILE, {"access_token": "only"})
        assert store().load_saved_session() is None

    @pytest.mark.parametrize(
        "error",
        [
            httpx.ConnectError("no route"),
            httpx.ProxyError("403 Forbidden"),
            httpx.ReadTimeout("slow"),
            AuthRetryableError("retry me", 503),
            OSError("network down"),
        ],
    )
    def test_keeps_the_saved_session_when_supabase_is_unreachable(self, error):
        """A flaky connection must not silently sign the user out."""
        paths.write_json(SESSION_FILE, SAVED)

        def boom(_a, _r):
            raise error

        with pytest.raises(SessionUnavailableError):
            store(boom).load_saved_session()

        assert paths.read_json(SESSION_FILE) == SAVED

    def test_discards_the_saved_session_when_the_token_is_rejected(self):
        paths.write_json(SESSION_FILE, SAVED)

        def rejected(_a, _r):
            raise ValueError("invalid refresh token")

        assert store(rejected).load_saved_session() is None
        assert paths.read_json(SESSION_FILE) is None


class TestEnsureSession:
    def test_requires_sign_in(self):
        with pytest.raises(AuthError, match="Sign in first."):
            store().ensure_session()

    def test_unreachable_supabase_propagates_rather_than_looking_signed_out(self):
        paths.write_json(SESSION_FILE, SAVED)

        def boom(_a, _r):
            raise httpx.ConnectError("no route")

        with pytest.raises(SessionUnavailableError):
            store(boom).ensure_session()


class TestPublicSession:
    def test_is_none_when_signed_out(self):
        assert store().public_session() is None

    def test_exposes_only_email_and_id(self):
        instance = store()
        instance._session = {"user": {"id": "user-1", "email": "a@b.c"}, "access_token": "secret"}

        public = instance.public_session()

        assert public == {"email": "a@b.c", "user_id": "user-1"}
        assert "access_token" not in public


class TestSignOut:
    def test_clears_state_and_removes_the_file(self):
        paths.write_json(SESSION_FILE, SAVED)
        instance = store()
        instance._session = dict(SAVED)

        instance.sign_out()

        assert instance.session is None
        assert paths.read_json(SESSION_FILE) is None
        assert instance._supabase.auth.signed_out
