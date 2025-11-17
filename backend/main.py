"""
Flash-AI Backend Server
A standalone FastAPI server for handling LLM inference and flashcard data.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# Add parent directory to path to import python_sidecar
sys.path.insert(0, str(Path(__file__).parent.parent))

import uvicorn
from python_sidecar.app import app

if __name__ == "__main__":
    # Get port from environment variable or default to 8000
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")

    # For production, set reload=False
    # For development, set reload=True
    reload = os.getenv("ENV", "development") == "development"

    print(f"Starting Flash-AI backend server on {host}:{port}")
    print(f"Environment: {'development' if reload else 'production'}")

    uvicorn.run(
        "python_sidecar.app:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info"
    )
