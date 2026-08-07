import pytest

from tether_desktop import paths


@pytest.fixture(autouse=True)
def isolated_data_dir(tmp_path, monkeypatch):
    """Keep tests away from the real ~/Library/Application Support state files."""
    monkeypatch.setattr(paths, "data_dir", lambda: tmp_path)
    return tmp_path
