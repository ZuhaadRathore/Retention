# Retention Python Sidecar

Local FastAPI service that handles semantic scoring, deck metadata persistence, and background model preparation for the Retention desktop shell.

## Quickstart
- Create and activate a virtual environment targeting Python 3.10+.
- Install dependencies with "pip install -e .[dev]".
- Initialize the SQLite database using "retention-init-db".
- Start the development server via "uvicorn python_sidecar.app:app --reload".

The API serves the paths /health and /score. The /score endpoint currently returns a deterministic stub until the embedding pipeline is wired up.
