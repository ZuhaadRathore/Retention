# Production Build Guide

This guide explains how to bundle the Python sidecar with the Tauri application for production deployment.

## Overview

The application consists of:
- **Frontend**: React + Tauri (handles UI)
- **Backend**: Python FastAPI sidecar (handles AI scoring, database, ML models)

The Python sidecar is bundled as a standalone executable and automatically started by the Tauri app.

## Prerequisites

1. **Python** (3.11 or higher)
2. **Node.js** and **pnpm**
3. **Rust** and Tauri CLI
4. **PyInstaller** (included in requirements.txt)

## Building for Production

### Option 1: Full Build (Recommended)

This command builds both the frontend and the sidecar, then creates the final installer:

```bash
pnpm tauri build
```

This will:
1. Build the React frontend (`pnpm web:build`)
2. Bundle the Python sidecar using PyInstaller (`python build-sidecar.py`)
3. Build the Tauri application with the sidecar included
4. Create platform-specific installers in `src-tauri/target/release/bundle/`

### Option 2: Manual Build

If you need more control, you can build components separately:

#### 1. Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### 2. Build the Python Sidecar

```bash
python build-sidecar.py
```

Or on Windows:
```bash
build-sidecar.bat
```

This creates the sidecar executable at:
- Windows: `python_sidecar/dist/retention-sidecar/retention-sidecar.exe`
- macOS/Linux: `python_sidecar/dist/retention-sidecar/retention-sidecar`

#### 3. Build the Frontend

```bash
pnpm web:build
```

#### 4. Build the Tauri App

```bash
pnpm tauri build
```

## Output Location

After building, you'll find the installers in:

- **Windows**: `src-tauri/target/release/bundle/msi/` or `src-tauri/target/release/bundle/nsis/`
- **macOS**: `src-tauri/target/release/bundle/dmg/` or `src-tauri/target/release/bundle/macos/`
- **Linux**: `src-tauri/target/release/bundle/deb/` or `src-tauri/target/release/bundle/appimage/`

## How It Works

### Sidecar Architecture

1. **Bundling**: PyInstaller packages the Python FastAPI server and all dependencies (including ML models) into a standalone executable.

2. **Tauri Configuration**: The `tauri.conf.json` includes:
   - `resources`: Maps the sidecar directory to be bundled
   - `externalBin`: Declares the sidecar as an external binary
   - `beforeBuildCommand`: Runs the sidecar build script before building

3. **Runtime Behavior**:
   - On app startup, Tauri spawns the sidecar process
   - The sidecar finds an available port (default: 27888)
   - The sidecar prints `SIDECAR_PORT=<port>` to stdout
   - Rust code reads this and stores the port
   - Frontend calls `get_sidecar_port()` to get the port dynamically
   - Frontend communicates with sidecar via HTTP

4. **Development vs Production**:
   - **Dev mode**: Runs `python -m python_sidecar` directly
   - **Production**: Uses the bundled executable from PyInstaller

### Port Management

- The sidecar automatically finds an available port starting from 27888
- If that port is in use, it tries 27889, 27890, etc.
- The frontend dynamically discovers the port via the Tauri command
- This prevents port conflicts when running multiple instances

## Testing the Build

Before distributing, test the build locally:

```bash
# Run the built executable
./src-tauri/target/release/Retention
```

Or on Windows:
```bash
.\src-tauri\target\release\Retention.exe
```

The app should:
1. Start without errors
2. Automatically launch the sidecar
3. Connect to the backend successfully
4. Display "Backend: Ready" in the UI

## Troubleshooting

### Sidecar Fails to Start

Check the console logs. The sidecar outputs to stderr/stdout.

Common issues:
- Missing dependencies: Ensure all Python deps are in `requirements.txt`
- PyInstaller errors: Check `python_sidecar/build/` for logs

### Port Issues

If the sidecar can't find an available port:
- Check if ports 27888-27897 are available
- Close other instances of the app
- Check firewall settings

### Large Bundle Size

The bundle includes ML models and dependencies. Expected size:
- Windows: ~500MB - 1GB
- macOS: ~500MB - 1GB
- Linux: ~500MB - 1GB

To reduce size:
- Exclude unused ML models in `sidecar.spec`
- Use lighter transformer models
- Exclude development dependencies

## Distribution

### Windows

Distribute the `.msi` or `.exe` installer from `src-tauri/target/release/bundle/nsis/`

### macOS

Distribute the `.dmg` from `src-tauri/target/release/bundle/dmg/`

For macOS, you may need to:
1. Sign the app with a Developer ID
2. Notarize the app with Apple

### Linux

Distribute the `.deb`, `.AppImage`, or `.rpm` from `src-tauri/target/release/bundle/`

## Security Considerations

- The sidecar only listens on `127.0.0.1` (localhost)
- CORS is restricted to Tauri's localhost origins
- The sidecar process is automatically terminated when the app closes
- All communication happens locally - no external network access required

## Advanced Configuration

### Custom Port

Set the `RETENTION_PORT` environment variable before building:

```bash
export RETENTION_PORT=28000
pnpm tauri build
```

### Excluding Dependencies

Edit `python_sidecar/sidecar.spec` to exclude unwanted packages:

```python
excludes=['matplotlib', 'tkinter', 'IPython', 'jupyter', 'your_package'],
```

### Multiple Architectures

Build for different architectures:

```bash
# Build for ARM64 on macOS
rustup target add aarch64-apple-darwin
pnpm tauri build --target aarch64-apple-darwin

# Build for x86_64
rustup target add x86_64-apple-darwin
pnpm tauri build --target x86_64-apple-darwin
```

## CI/CD

For automated builds, see the example GitHub Actions workflow:

```yaml
name: Build
on: [push]
jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - uses: actions/setup-python@v4
      - run: pip install -r requirements.txt
      - run: pnpm install
      - run: pnpm tauri build
```

## Support

For issues or questions:
- Check the Tauri documentation: https://tauri.app
- Check the PyInstaller documentation: https://pyinstaller.org
- Open an issue on GitHub
