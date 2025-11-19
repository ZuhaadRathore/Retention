@echo off
echo ================================
echo  Deploy Landing Page to GitHub Pages
echo ================================
echo.

REM Check if we're in the right directory
if not exist "landing-page\index.html" (
    echo Error: landing-page\index.html not found!
    echo Please run this script from the project root directory.
    pause
    exit /b 1
)

echo [1/5] Saving current branch...
for /f "tokens=*" %%a in ('git branch --show-current') do set CURRENT_BRANCH=%%a
echo Current branch: %CURRENT_BRANCH%
echo.

echo [2/5] Checking for uncommitted changes...
git diff-index --quiet HEAD --
if %errorlevel% neq 0 (
    echo Warning: You have uncommitted changes!
    echo Please commit or stash them before deploying.
    pause
    exit /b 1
)
echo.

echo [3/5] Switching to gh-pages branch...
git checkout gh-pages 2>nul
if %errorlevel% neq 0 (
    echo Creating new gh-pages branch...
    git checkout --orphan gh-pages
    git rm -rf . 2>nul
)
echo.

echo [4/5] Copying landing page files...
copy /Y landing-page\index.html index.html >nul
if exist landing-page\README.md copy /Y landing-page\README.md landing-page-README.md >nul

REM Clean up any files that shouldn't be in gh-pages
if exist src rmdir /s /q src 2>nul
if exist src-tauri rmdir /s /q src-tauri 2>nul
if exist python_sidecar rmdir /s /q python_sidecar 2>nul
if exist node_modules rmdir /s /q node_modules 2>nul
if exist dist rmdir /s /q dist 2>nul
if exist .github rmdir /s /q .github 2>nul

echo.
echo [5/5] Committing and pushing...
git add index.html
if exist landing-page-README.md git add landing-page-README.md
git commit -m "Deploy landing page - %date% %time%"
git push origin gh-pages

if %errorlevel% neq 0 (
    echo.
    echo Error: Failed to push to GitHub.
    echo Make sure you have permissions and the remote is set up correctly.
    pause
    git checkout %CURRENT_BRANCH%
    exit /b 1
)

echo.
echo ================================
echo  Deployment Complete!
echo ================================
echo.
echo Your landing page will be live at:
echo https://yourusername.github.io/Flash-AI/
echo.
echo Note: It may take a few minutes for GitHub Pages to update.
echo.

echo Switching back to %CURRENT_BRANCH%...
git checkout %CURRENT_BRANCH%

echo.
echo Done! Press any key to exit.
pause >nul
