"""Create and extract-verify the one-folder ProfileSets distribution (Python 3.10+)."""
import argparse
import hashlib
import json
import re
import shutil
import stat
import zipfile
from pathlib import Path, PurePosixPath

EXCLUDE = {"node_modules", ".git", "__pycache__", ".vencord"}
REQUIRED = ["index.tsx", "styles.css", "README.md", "components/draftEditor.tsx", "utils/profile.ts", "utils/storage.ts", "dev-tools/test.mjs", "dev-tools/paths.mjs", "dev-tools/ui/adapter.jsx", "dev-tools/ui/check.mjs", "dev-tools/ui/package-lock.json", "dev-tools/verify.yml"]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def check_paths(root):
    for name in REQUIRED:
        assert (root / name).is_file(), f"Missing required file: {name}"
    for path in [root / "index.tsx", *root.glob("components/*.tsx"), *root.glob("utils/*.ts")]:
        source = path.read_text(encoding="utf-8")
        for ref in re.findall(r'(?:from\s*|import\s*|require\(\s*)[\"\'](\.[^\"\']+)[\"\']', source):
            target = path.parent / ref
            choices = [target, *[Path(str(target) + suffix) for suffix in (".ts", ".tsx", ".css")], target / "index.ts", target / "index.tsx"]
            assert any(candidate.is_file() for candidate in choices), f"Broken import in {path.name}: {ref}"
    for path in root.glob("*.md"):
        for ref in re.findall(r'\]\(([^)]+)\)', path.read_text(encoding="utf-8")):
            if "://" not in ref and not ref.startswith("#"):
                assert (path.parent / ref.split("#")[0]).exists(), f"Broken document link: {ref}"


def build(source, output, extraction):
    source, output, extraction = source.resolve(), output.resolve(), extraction.resolve()
    assert source.name == "ProfileSets", "The source folder must be named ProfileSets"
    check_paths(source)
    files = {}
    for path in sorted(source.rglob("*")):
        relative = path.relative_to(source)
        if any(part in EXCLUDE for part in relative.parts) or path.suffix in {".zip", ".pyc"}:
            continue
        assert not path.is_symlink(), f"Symlinks cannot be packaged: {relative}"
        if path.is_file() and relative.as_posix() != "MANIFEST.sha256":
            files["ProfileSets/" + relative.as_posix()] = path.read_bytes()
    assert len(files) == len({name.casefold() for name in files}), "Case-colliding filenames"
    manifest = "".join(f"{sha256(data)}  {name.removeprefix('ProfileSets/')}\n" for name, data in files.items()).encode()
    files["ProfileSets/MANIFEST.sha256"] = manifest
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("ProfileSets/", b"")
        for name, data in files.items():
            archive.writestr(name, data)
    if extraction.exists():
        assert not any(extraction.iterdir()), "Use an empty extraction directory"
    extraction.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None, "ZIP CRC failure"
        assert {PurePosixPath(name).parts[0] for name in archive.namelist()} == {"ProfileSets"}
        for info in archive.infolist():
            parts = PurePosixPath(info.filename).parts
            assert ".." not in parts and not info.filename.startswith("/")
            assert not stat.S_ISLNK(info.external_attr >> 16)
        archive.extractall(extraction)
    for name, data in files.items():
        assert (extraction / name).read_bytes() == data, f"Extracted file mismatch: {name}"
    root = extraction / "ProfileSets"
    check_paths(root)
    assert set(root.rglob("*")) >= {root / name.removeprefix("ProfileSets/") for name in files}
    report = {"archive": output.name, "root": "ProfileSets/", "file_count": len(files), "sha256": sha256(output.read_bytes()), "crc": "passed", "extraction_byte_comparison": "passed", "runtime_imports": "passed", "document_links": "passed"}
    print(json.dumps(report, indent=2))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--extract-dir", type=Path, required=True)
    args = parser.parse_args()
    build(args.source, args.output, args.extract_dir)
