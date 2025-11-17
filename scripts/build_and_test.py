#!/usr/bin/env python
"""
Unified build and test script for Retention sidecar.
Downloads model, builds sidecar, and runs comprehensive tests.
"""
import argparse
import subprocess
import sys
from pathlib import Path


class Colors:
    """ANSI color codes."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_step(message: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}>>> {message}{Colors.RESET}\n")


def print_success(message: str):
    print(f"{Colors.GREEN}SUCCESS:{Colors.RESET} {message}")


def print_error(message: str):
    print(f"{Colors.RED}ERROR:{Colors.RESET} {message}")


def run_command(cmd: list, description: str, cwd: Path) -> bool:
    """Run a command and return True if successful."""
    print(f"Running: {' '.join(str(c) for c in cmd)}")

    result = subprocess.run(cmd, cwd=str(cwd))

    if result.returncode != 0:
        print_error(f"{description} failed with exit code {result.returncode}")
        return False

    print_success(f"{description} completed")
    return True


def main():
    parser = argparse.ArgumentParser(
        description="Build and test Retention sidecar with bundled model"
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip model download (assumes already downloaded)"
    )
    parser.add_argument(
        "--skip-test",
        action="store_true",
        help="Skip testing after build"
    )
    parser.add_argument(
        "--test-only",
        action="store_true",
        help="Only run tests (skip build)"
    )
    args = parser.parse_args()

    project_root = Path(__file__).resolve().parent.parent

    # Step 1: Download model
    if not args.test_only and not args.skip_download:
        print_step("Step 1: Downloading model for bundling")
        download_script = project_root / "scripts" / "download_model_for_bundle.py"
        if not run_command(
            [sys.executable, str(download_script)],
            "Model download",
            project_root
        ):
            print_error("Model download failed. Continuing anyway...")

    # Step 2: Build sidecar
    if not args.test_only:
        print_step("Step 2: Building sidecar with PyInstaller")
        build_script = project_root / "scripts" / "build_sidecar.py"
        build_cmd = [sys.executable, str(build_script)]
        if args.skip_download:
            build_cmd.append("--skip-model-download")

        if not run_command(build_cmd, "Sidecar build", project_root):
            print_error("Build failed!")
            return 1

    # Step 3: Test sidecar
    if not args.skip_test:
        print_step("Step 3: Testing bundled sidecar")
        test_script = project_root / "scripts" / "test_bundled_sidecar.py"
        if not run_command(
            [sys.executable, str(test_script)],
            "Sidecar tests",
            project_root
        ):
            print_error("Tests failed!")
            return 1

    # Success!
    print(f"\n{Colors.BOLD}{Colors.GREEN}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.GREEN}All steps completed successfully!{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.GREEN}{'=' * 60}{Colors.RESET}\n")

    # Print next steps
    print(f"{Colors.BOLD}Next steps:{Colors.RESET}")
    print("  1. Run the sidecar: ./src-tauri/binaries/windows/retention-sidecar.exe")
    print("  2. Build the full app: pnpm tauri build")
    print()

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(130)
