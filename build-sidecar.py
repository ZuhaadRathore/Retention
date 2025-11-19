#!/usr/bin/env python3
"""
Build script for bundling the Python sidecar using PyInstaller.
This script creates a standalone executable that can be distributed with the Tauri app.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

def check_dependencies():
    """Check if required dependencies are installed."""
    print("Checking dependencies...")

    # Check for PyInstaller
    try:
        import PyInstaller
        print(f"✓ PyInstaller {PyInstaller.__version__} found")
    except ImportError:
        print("✗ PyInstaller not found!")
        print("\nTo install dependencies, run:")
        print("  pip install -r requirements.txt")
        sys.exit(1)

    # Check for other critical dependencies
    missing_deps = []
    deps_to_check = [
        ("fastapi", "FastAPI"),
        ("uvicorn", "Uvicorn"),
        ("sentence_transformers", "sentence-transformers"),
    ]

    for module_name, package_name in deps_to_check:
        try:
            __import__(module_name)
            print(f"✓ {package_name} found")
        except ImportError:
            missing_deps.append(package_name)

    if missing_deps:
        print(f"\n✗ Missing dependencies: {', '.join(missing_deps)}")
        print("\nTo install all dependencies, run:")
        print("  pip install -r requirements.txt")
        sys.exit(1)

    print("✓ All dependencies installed\n")

def main():
    # Check dependencies first
    check_dependencies()

    # Get the project root directory
    project_root = Path(__file__).parent
    sidecar_dir = project_root / "python_sidecar"
    dist_dir = project_root / "python_sidecar" / "dist"
    build_dir = project_root / "python_sidecar" / "build"
    spec_file = sidecar_dir / "sidecar.spec"

    # Clean previous builds
    print("Cleaning previous builds...")
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    if build_dir.exists():
        shutil.rmtree(build_dir)

    # Run PyInstaller
    print("Building sidecar with PyInstaller...")
    print(f"Using Python: {sys.executable}")
    print(f"Python version: {sys.version}\n")

    try:
        subprocess.run(
            [sys.executable, "-m", "PyInstaller", str(spec_file)],
            cwd=str(sidecar_dir),
            check=True
        )
        print("\n✓ Sidecar built successfully!")

        # Determine the executable extension based on platform
        exe_extension = ".exe" if sys.platform == "win32" else ""
        exe_name = f"retention-sidecar{exe_extension}"

        # Print the output location
        output_path = dist_dir / "retention-sidecar" / exe_name
        if output_path.exists():
            print(f"✓ Executable located at: {output_path}")
            file_size_mb = output_path.stat().st_size / (1024 * 1024)
            print(f"✓ Size: {file_size_mb:.1f} MB")
        else:
            print(f"⚠ Warning: Expected executable not found at {output_path}")
            print(f"Check the dist directory for build output")

    except subprocess.CalledProcessError as e:
        print(f"\n✗ Build failed with error code {e.returncode}")
        print("\nTroubleshooting:")
        print("1. Make sure all dependencies are installed: pip install -r requirements.txt")
        print("2. Check the error messages above for specific issues")
        print("3. Try running: python -m PyInstaller python_sidecar/sidecar.spec")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Build failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
