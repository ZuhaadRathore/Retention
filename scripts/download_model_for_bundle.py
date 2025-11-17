#!/usr/bin/env python
"""
Download the sentence-transformers model at build time for bundling with PyInstaller.
This ensures the model is available offline and ready immediately on app launch.
"""
import sys
from pathlib import Path


def main():
    # Model to download
    MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

    # Download to project's models directory
    project_root = Path(__file__).resolve().parent.parent
    models_dir = project_root / "models" / "sentence-transformers"
    models_dir.mkdir(parents=True, exist_ok=True)

    print(f"[build] Downloading model '{MODEL_NAME}' for bundling...")
    print(f"[build] Target directory: {models_dir}")

    try:
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id=MODEL_NAME,
            local_dir=str(models_dir / "all-MiniLM-L6-v2"),
            local_dir_use_symlinks=False,
            resume_download=True,
            # Don't download unnecessary files to reduce bundle size
            ignore_patterns=["*.h5", "*.ot", "*.msgpack", "tf_model.h5"]
        )

        print("[build] Model downloaded successfully!")
        print(f"[build] Model location: {models_dir / 'all-MiniLM-L6-v2'}")

        # Verify critical files exist
        model_path = models_dir / "all-MiniLM-L6-v2"
        required_files = ["config.json", "pytorch_model.bin"]
        missing = []

        for filename in required_files:
            if not (model_path / filename).exists():
                missing.append(filename)

        if missing:
            print(f"[build] WARNING: Missing expected files: {missing}")
            print(f"[build] Model may not work correctly.")
            return 1

        print("[build] Model validation passed")
        return 0

    except ImportError:
        print("[build] ERROR: huggingface_hub not installed")
        print("[build] Run: pip install huggingface-hub")
        return 1
    except Exception as e:
        print(f"[build] ERROR: Failed to download model: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
