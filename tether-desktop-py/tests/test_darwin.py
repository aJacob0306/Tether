import plistlib
import sys

import pytest

pytestmark = pytest.mark.skipif(sys.platform != "darwin", reason="macOS adapter")

darwin = pytest.importorskip("tether_desktop.platforms.darwin")


def make_bundle(root, name, plist=None, icon_name=None):
    bundle = root / f"{name}.app"
    contents = bundle / "Contents"
    contents.mkdir(parents=True)
    if plist is not None:
        (contents / "Info.plist").write_bytes(plistlib.dumps(plist))
    if icon_name:
        resources = contents / "Resources"
        resources.mkdir()
        (resources / icon_name).write_bytes(b"not really an icns")
    return bundle


class TestFindAppBundles:
    def test_finds_nested_bundles_but_does_not_descend_into_them(self, tmp_path):
        make_bundle(tmp_path, "Top")
        nested = tmp_path / "Folder" / "Deeper"
        nested.mkdir(parents=True)
        make_bundle(nested, "Nested")
        # A helper bundle inside another bundle should not be reported separately.
        make_bundle(tmp_path / "Top.app" / "Contents", "Helper")

        found = darwin._find_app_bundles(tmp_path)

        assert sorted(p.name for p in found) == ["Nested.app", "Top.app"]

    def test_respects_max_depth(self, tmp_path):
        deep = tmp_path / "a" / "b" / "c" / "d" / "e"
        deep.mkdir(parents=True)
        make_bundle(deep, "TooDeep")

        assert darwin._find_app_bundles(tmp_path) == []

    def test_missing_directory_is_not_an_error(self, tmp_path):
        assert darwin._find_app_bundles(tmp_path / "nope") == []

    def test_follows_symlinked_bundles(self, tmp_path):
        real = tmp_path / "real"
        real.mkdir()
        make_bundle(real, "Linked")
        visible = tmp_path / "visible"
        visible.mkdir()
        (visible / "Linked.app").symlink_to(real / "Linked.app")

        assert [p.name for p in darwin._find_app_bundles(visible)] == ["Linked.app"]

    def test_result_is_sorted(self, tmp_path):
        for name in ["Zebra", "apple", "Mango"]:
            make_bundle(tmp_path, name)

        found = [p.name for p in darwin._find_app_bundles(tmp_path)]

        assert found == sorted(found)


class TestReadInfoPlist:
    def test_reads_xml_plist(self, tmp_path):
        bundle = make_bundle(tmp_path, "App", {"CFBundleIdentifier": "com.example.app"})
        assert darwin._read_info_plist(bundle)["CFBundleIdentifier"] == "com.example.app"

    def test_reads_binary_plist(self, tmp_path):
        bundle = make_bundle(tmp_path, "App")
        (bundle / "Contents" / "Info.plist").write_bytes(
            plistlib.dumps({"CFBundleIdentifier": "com.example.binary"}, fmt=plistlib.FMT_BINARY)
        )
        assert darwin._read_info_plist(bundle)["CFBundleIdentifier"] == "com.example.binary"

    def test_reads_plist_containing_binary_data(self, tmp_path):
        """plutil -convert json fails on <data> entries; plistlib does not."""
        bundle = make_bundle(
            tmp_path, "App", {"CFBundleIdentifier": "com.example.data", "Blob": b"\x00\x01\x02"}
        )
        assert darwin._read_info_plist(bundle)["CFBundleIdentifier"] == "com.example.data"

    def test_missing_or_corrupt_plist_yields_empty_dict(self, tmp_path):
        assert darwin._read_info_plist(make_bundle(tmp_path, "NoPlist")) == {}
        bundle = make_bundle(tmp_path, "Corrupt")
        (bundle / "Contents" / "Info.plist").write_bytes(b"<<<not a plist")
        assert darwin._read_info_plist(bundle) == {}


class TestNormalizeAppBundle:
    def test_prefers_display_name_then_falls_back(self, tmp_path):
        bundle = tmp_path / "OnDisk.app"
        assert darwin._normalize_app_bundle(bundle, {"CFBundleDisplayName": "Pretty"})["value"] == "Pretty"
        assert darwin._normalize_app_bundle(bundle, {"CFBundleName": "Named"})["value"] == "Named"
        assert darwin._normalize_app_bundle(bundle, {"CFBundleExecutable": "exe"})["value"] == "exe"
        assert darwin._normalize_app_bundle(bundle, {})["value"] == "OnDisk"

    def test_tool_key_uses_bundle_id_when_present(self, tmp_path):
        bundle = tmp_path / "App.app"
        keyed = darwin._normalize_app_bundle(bundle, {"CFBundleIdentifier": "com.example.app"})
        assert keyed["tool_key"] == "bundle:com.example.app"
        assert keyed["bundle_identifier"] == "com.example.app"

    def test_tool_key_falls_back_to_path(self, tmp_path):
        unkeyed = darwin._normalize_app_bundle(tmp_path / "App.app", {})
        assert unkeyed["tool_key"] == f"path:{tmp_path / 'App.app'}"
        assert unkeyed["bundle_identifier"] is None

    def test_version_prefers_short_version_string(self, tmp_path):
        bundle = tmp_path / "App.app"
        both = {"CFBundleShortVersionString": "1.2", "CFBundleVersion": "99"}
        assert darwin._normalize_app_bundle(bundle, both)["metadata"]["version"] == "1.2"
        assert darwin._normalize_app_bundle(bundle, {"CFBundleVersion": "99"})["metadata"]["version"] == "99"

    def test_shape_matches_detected_tools_columns(self, tmp_path):
        detected = darwin._normalize_app_bundle(tmp_path / "App.app", {"CFBundleIdentifier": "x"})
        assert set(detected) == {
            "tool_type", "value", "display_name", "tool_key",
            "bundle_identifier", "install_path", "platform", "metadata",
        }
        assert detected["tool_type"] == "app"
        assert detected["platform"] == "macos"


class TestIconDataUrl:
    def test_returns_none_without_an_icon_entry(self, tmp_path):
        assert darwin._icon_data_url(make_bundle(tmp_path, "App"), {}) is None

    def test_returns_none_when_the_icon_file_is_missing(self, tmp_path):
        bundle = make_bundle(tmp_path, "App")
        assert darwin._icon_data_url(bundle, {"CFBundleIconFile": "Missing"}) is None

    def test_returns_none_for_an_unreadable_icon(self, tmp_path):
        bundle = make_bundle(tmp_path, "App", {}, icon_name="AppIcon.icns")
        assert darwin._icon_data_url(bundle, {"CFBundleIconFile": "AppIcon"}) is None

    def test_resolves_icon_name_with_and_without_the_extension(self, tmp_path):
        with_ext = make_bundle(tmp_path / "a", "App", {}, icon_name="AppIcon.icns")
        assert darwin._resolve_icon_path(with_ext, {"CFBundleIconFile": "AppIcon"}) is not None
        assert darwin._resolve_icon_path(with_ext, {"CFBundleIconFile": "AppIcon.icns"}) is not None

    def test_encodes_a_real_image_as_a_png_data_url(self, tmp_path):
        import base64
        import io

        from PIL import Image

        bundle = make_bundle(tmp_path, "App")
        resources = bundle / "Contents" / "Resources"
        resources.mkdir()
        Image.new("RGBA", (512, 512), (255, 0, 0, 255)).save(resources / "AppIcon.png")

        data_url = darwin._icon_data_url(bundle, {"CFBundleIconFile": "AppIcon.png"})

        assert data_url is not None
        # tether-mobile checks for this exact prefix before rendering the icon.
        assert data_url.startswith("data:image/png;base64,")
        decoded = Image.open(io.BytesIO(base64.b64decode(data_url.split(",", 1)[1])))
        assert decoded.size == (64, 64)
