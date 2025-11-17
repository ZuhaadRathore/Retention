# Retention Desktop

Retention is a Tauri-powered desktop shell around a FastAPI-based Python sidecar. The React UI talks to the bundled sidecar over HTTP (27888 by default), so the entire experience can ship as a single installer (`retention.exe` on Windows) once the sidecar is built with PyInstaller.

## Architecture

- `src/` – React + Zustand UI that targets `VITE_API_BASE_URL` (default `http://127.0.0.1:27888`).
- `python_sidecar/` – FastAPI app that hosts `/health`, `/score`, `/decks`, etc. This is the canonical backend the UI uses.
- `scripts/` – Helpers to download the model, build the sidecar with PyInstaller, and test the bundled binary.
- `src-tauri/` – The Rust/Tauri wrapper plus a staged `src-tauri/binaries/<platform>/retention-sidecar` that gets included inside the final bundle.

The old `backend/` package is kept for backwards compatibility, but the Python sidecar under `python_sidecar/` is now the single authoritative runtime you should ship and connect to.

## Development workflow

1. Start the sidecar locally (the FastAPI app listens on port `27888` by default):
   ```bash
   python -m python_sidecar
   ```
   This respects `RETENTION_PORT` if you need to override the port.
2. Run the UI:
   ```bash
   pnpm dev
   ```
3. The UI already defaults to `VITE_API_BASE_URL=http://127.0.0.1:27888`, so no extra configuration is required unless you point to a remote server.

## Release / bundling workflow

Retention ships as one binary pair: the Tauri shell and a PyInstaller-built sidecar. The helper scripts make that easy:

1. `pnpm run sidecar:build` – finds a Python interpreter, downloads the model (via `scripts/download_model_for_bundle.py`), runs `PyInstaller`, and stages the resulting binary under `src-tauri/binaries/<platform>`.  
2. `pnpm run release` – runs the previous step and then calls `pnpm tauri build`, producing installers that include the built `retention-sidecar`.

If you want an all-in-one Python workflow (with tests), use `python scripts/build_and_test.py`. It downloads the model, builds the sidecar, and exercises it before you package anything.

## Environment notes

- `VITE_API_BASE_URL` (frontend) defaults to `http://127.0.0.1:27888`. Override it for custom deployments or remote endpoints.
- `RETENTION_PORT` (sidecar) defaults to `27888`. The sidecar prints the chosen port via `SIDECAR_PORT=<port>` so you can wire up other launchers if necessary.

## Quick reminders

- Always build the sidecar before packaging: `pnpm run release` or `python scripts/build_sidecar.py`.
- The Tauri shell simply renders the React UI and proxies HTTP traffic; the heavy lifting happens in the bundled Python binary.
- The sidecar stores the model under `models/sentence-transformers/…` and automatically serves it when packaged via PyInstaller.
