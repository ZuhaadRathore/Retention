from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


PLATFORM_TARGETS = {
    "windows": ("windows", "retention-sidecar.exe"),
    "linux": ("linux", "retention-sidecar"),
    "macos": ("macos", "retention-sidecar")
}


def _detect_platform() -> str:
    platform = sys.platform
    if platform.startswith("win"):
        return "windows"
    if platform.startswith("linux"):
        return "linux"
    if platform == "darwin":
        return "macos"
    raise RuntimeError(f"Unsupported platform {platform!r}")


def build_sidecar(target: str, spec_path: Path, dist_root: Path) -> Path:
    dist_dir = dist_root / target / "dist"
    work_dir = dist_root / target / "build"
    dist_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(spec_path),
        "--noconfirm",
        "--clean",
        "--distpath",
        str(dist_dir),
        "--workpath",
        str(work_dir)
    ]
    subprocess.run(cmd, check=True, cwd=str(spec_path.parent))

    _, binary_name = PLATFORM_TARGETS[target]
    built_binary = dist_dir / binary_name
    if not built_binary.exists():
        raise FileNotFoundError(f"Expected PyInstaller output {built_binary} was not produced.")
    return built_binary


def stage_binary(source: Path, target: str, project_root: Path) -> Path:
    dest_dir = project_root / "src-tauri" / "binaries" / PLATFORM_TARGETS[target][0]
    dest_dir.mkdir(parents=True, exist_ok=True)
    destination = dest_dir / source.name
    shutil.copy2(source, destination)
    return destination


def download_model_for_bundle(project_root: Path) -> bool:
    """Download the model before building. Returns True if successful."""
    download_script = project_root / "scripts" / "download_model_for_bundle.py"

    if not download_script.exists():
        print(f"[sidecar] WARNING: Model download script not found at {download_script}")
        return False

    print(f"[sidecar] Downloading model for bundling...")
    result = subprocess.run(
        [sys.executable, str(download_script)],
        cwd=str(project_root),
        capture_output=False
    )

    if result.returncode != 0:
        print(f"[sidecar] ERROR: Model download failed with code {result.returncode}")
        return False

    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the Retention sidecar using PyInstaller and stage it for Tauri bundling."
    )
    parser.add_argument(
        "--platform",
        choices=PLATFORM_TARGETS.keys(),
        help="Override the detected platform."
    )
    parser.add_argument(
        "--dist-root",
        type=Path,
        default=Path("build/sidecar"),
        help="Where to place intermediate PyInstaller output."
    )
    parser.add_argument(
        "--spec",
        type=Path,
        default=Path("retention-sidecar.spec"),
        help="Path to the PyInstaller spec file."
    )
    parser.add_argument(
        "--skip-model-download",
        action="store_true",
        help="Skip downloading the model (assumes it's already downloaded)."
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent
    target = args.platform or _detect_platform()
    spec_path = (project_root / args.spec).resolve()
    dist_root = (project_root / args.dist_root).resolve()

    if target not in PLATFORM_TARGETS:
        raise ValueError(f"Unsupported packaging target {target!r}")

    # Download model before building (unless skipped)
    if not args.skip_model_download:
        if not download_model_for_bundle(project_root):
            print("[sidecar] WARNING: Continuing build without model download")
            print("[sidecar] The app will need to download the model on first run")

    print(f"[sidecar] Building PyInstaller bundle for {target}...")
    built_binary = build_sidecar(target, spec_path, dist_root)
    staged_binary = stage_binary(built_binary, target, project_root)
    print(f"[sidecar] Staged binary at {staged_binary}")


if __name__ == "__main__":
    main()
