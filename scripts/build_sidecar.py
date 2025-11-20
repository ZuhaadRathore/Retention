from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


PLATFORM_TARGETS = {
    "windows": ("windows", "retention-sidecar.exe", "retention-sidecar-x86_64-pc-windows-msvc.exe"),
    "linux": ("linux", "retention-sidecar", "retention-sidecar-x86_64-unknown-linux-gnu"),
    "macos": ("macos", "retention-sidecar", "retention-sidecar-aarch64-apple-darwin")
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

    _, binary_name, _ = PLATFORM_TARGETS[target]
    # PyInstaller onedir mode creates a folder, exe is inside it
    built_binary = dist_dir / "retention-sidecar" / binary_name
    if not built_binary.exists():
        raise FileNotFoundError(f"Expected PyInstaller output {built_binary} was not produced.")
    return built_binary


def stage_binary(source: Path, target: str, project_root: Path) -> Path:
    _, _, tauri_binary_name = PLATFORM_TARGETS[target]
    # Tauri expects binaries directly in src-tauri/binaries/, not in platform subdirectories
    dest_dir = project_root / "src-tauri" / "binaries"
    dest_dir.mkdir(parents=True, exist_ok=True)

    # For onedir builds, copy the entire sidecar folder
    # source points to the exe, we need to copy its parent directory
    source_dir = source.parent
    destination = dest_dir / tauri_binary_name

    # Copy the entire directory structure
    if source_dir.name == "retention-sidecar":
        # Copy the exe with Tauri's expected name
        shutil.copy2(source, destination)
        # Copy the _internal folder if it exists
        internal_src = source_dir / "_internal"
        if internal_src.exists():
            internal_dest = dest_dir / "_internal"
            if internal_dest.exists():
                shutil.rmtree(internal_dest)
            shutil.copytree(internal_src, internal_dest)
    else:
        # Fallback to simple copy for onefile builds
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
