@echo off
REM Setup script for Flash-AI development environment

echo ====================================
echo Flash-AI Development Setup
echo ====================================
echo.

REM Check Python version
echo Checking Python version...
python --version 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Python not found!
    echo Please install Python 3.9 or higher from https://www.python.org/
    pause
    exit /b 1
)

REM Check Python version is at least 3.9
python -c "import sys; exit(0 if sys.version_info >= (3, 9) else 1)" 2>NUL
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Python 3.9 or higher is recommended
    echo Your current Python version may not support all dependencies
    echo.
)

echo.
echo Installing Python dependencies...
echo This may take several minutes as it includes ML models...
echo.

pip install -r requirements.txt

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to install Python dependencies!
    echo Try running: pip install --upgrade pip
    echo Then run this script again.
    pause
    exit /b 1
)

echo.
echo Installing Node.js dependencies...
echo.

call pnpm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to install Node.js dependencies!
    echo Make sure pnpm is installed: npm install -g pnpm
    pause
    exit /b 1
)

echo.
echo ====================================
echo Setup complete!
echo ====================================
echo.
echo Next steps:
echo   Development: pnpm tauri dev
echo   Production:  pnpm tauri build
echo.
pause
