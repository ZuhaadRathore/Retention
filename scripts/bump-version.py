#!/usr/bin/env python3
"""
Version bumping script for Flash-AI.
Updates version in package.json, Cargo.toml, tauri.conf.json, and pyproject.toml.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Literal


VERSION_PATTERN = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$")


def parse_version(version_str: str) -> tuple[int, int, int, str | None]:
    """Parse a semantic version string."""
    match = VERSION_PATTERN.match(version_str)
    if not match:
        raise ValueError(f"Invalid version format: {version_str}")

    major, minor, patch, prerelease = match.groups()
    return int(major), int(minor), int(patch), prerelease


def format_version(major: int, minor: int, patch: int, prerelease: str | None = None) -> str:
    """Format version components into a string."""
    version = f"{major}.{minor}.{patch}"
    if prerelease:
        version += f"-{prerelease}"
    return version


def bump_version(
    version_str: str,
    bump_type: Literal["major", "minor", "patch"],
    prerelease: str | None = None
) -> str:
    """Bump a version string according to the specified type."""
    major, minor, patch, _ = parse_version(version_str)

    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    elif bump_type == "patch":
        patch += 1

    return format_version(major, minor, patch, prerelease)


def update_package_json(file_path: Path, new_version: str) -> None:
    """Update version in package.json."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    old_version = data.get("version", "unknown")
    data["version"] = new_version

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"✓ Updated {file_path.name}: {old_version} → {new_version}")


def update_cargo_toml(file_path: Path, new_version: str) -> None:
    """Update version in Cargo.toml."""
    content = file_path.read_text(encoding="utf-8")

    # Match version in [package] section
    pattern = re.compile(r'^(\[package\].*?^version\s*=\s*")([^"]+)(")', re.MULTILINE | re.DOTALL)

    def replace_version(match):
        old_version = match.group(2)
        print(f"✓ Updated {file_path.name}: {old_version} → {new_version}")
        return match.group(1) + new_version + match.group(3)

    new_content = pattern.sub(replace_version, content)
    file_path.write_text(new_content, encoding="utf-8")


def update_tauri_conf(file_path: Path, new_version: str) -> None:
    """Update version in tauri.conf.json."""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    old_version = data.get("package", {}).get("version", "unknown")
    if "package" not in data:
        data["package"] = {}
    data["package"]["version"] = new_version

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"✓ Updated {file_path.name}: {old_version} → {new_version}")


def update_pyproject_toml(file_path: Path, new_version: str) -> None:
    """Update version in pyproject.toml."""
    content = file_path.read_text(encoding="utf-8")

    # Match version in [project] section
    pattern = re.compile(r'^(\[project\].*?^version\s*=\s*")([^"]+)(")', re.MULTILINE | re.DOTALL)

    def replace_version(match):
        old_version = match.group(2)
        print(f"✓ Updated {file_path.name}: {old_version} → {new_version}")
        return match.group(1) + new_version + match.group(3)

    new_content = pattern.sub(replace_version, content)
    file_path.write_text(new_content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bump Flash-AI version across all project files"
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--major",
        action="store_const",
        const="major",
        dest="bump_type",
        help="Bump major version (X.0.0)"
    )
    group.add_argument(
        "--minor",
        action="store_const",
        const="minor",
        dest="bump_type",
        help="Bump minor version (0.X.0)"
    )
    group.add_argument(
        "--patch",
        action="store_const",
        const="patch",
        dest="bump_type",
        help="Bump patch version (0.0.X)"
    )
    group.add_argument(
        "--set",
        type=str,
        dest="explicit_version",
        metavar="VERSION",
        help="Set explicit version (e.g., 1.2.3 or 1.2.3-beta.1)"
    )

    parser.add_argument(
        "--prerelease",
        type=str,
        help="Prerelease identifier (e.g., alpha, beta.1)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without modifying files"
    )

    args = parser.parse_args()

    # Find project root
    project_root = Path(__file__).resolve().parent.parent

    # Define file paths
    package_json = project_root / "package.json"
    cargo_toml = project_root / "src-tauri" / "Cargo.toml"
    tauri_conf = project_root / "src-tauri" / "tauri.conf.json"
    pyproject_toml = project_root / "python_sidecar" / "pyproject.toml"

    # Verify files exist
    for file_path in [package_json, cargo_toml, tauri_conf, pyproject_toml]:
        if not file_path.exists():
            print(f"Error: {file_path} not found", file=sys.stderr)
            sys.exit(1)

    # Get current version from package.json
    with open(package_json, "r", encoding="utf-8") as f:
        current_version = json.load(f).get("version", "0.0.0")

    # Calculate new version
    if args.explicit_version:
        # Validate explicit version
        try:
            parse_version(args.explicit_version)
            new_version = args.explicit_version.lstrip("v")
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    else:
        new_version = bump_version(current_version, args.bump_type, args.prerelease)

    print(f"\nVersion bump: {current_version} → {new_version}")

    if args.dry_run:
        print("\n[DRY RUN] Would update the following files:")
        print(f"  - {package_json.relative_to(project_root)}")
        print(f"  - {cargo_toml.relative_to(project_root)}")
        print(f"  - {tauri_conf.relative_to(project_root)}")
        print(f"  - {pyproject_toml.relative_to(project_root)}")
        return

    print()

    # Update all files
    update_package_json(package_json, new_version)
    update_cargo_toml(cargo_toml, new_version)
    update_tauri_conf(tauri_conf, new_version)
    update_pyproject_toml(pyproject_toml, new_version)

    print(f"\n✅ All files updated to version {new_version}")
    print("\nNext steps:")
    print(f"  1. Review changes: git diff")
    print(f"  2. Commit: git commit -am 'chore: bump version to {new_version}'")
    print(f"  3. Tag: git tag v{new_version}")
    print(f"  4. Push: git push && git push --tags")


if __name__ == "__main__":
    main()
