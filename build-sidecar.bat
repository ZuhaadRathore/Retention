@echo off
REM Build script for bundling the Python sidecar on Windows

echo Building Python sidecar...
python build-sidecar.py

if %ERRORLEVEL% NEQ 0 (
    echo Build failed!
    exit /b %ERRORLEVEL%
)

echo.
echo Build complete!
