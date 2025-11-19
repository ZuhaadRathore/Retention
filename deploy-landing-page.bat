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
git show-ref --verify --quiet refs/heads/gh-pages
if %errorlevel% equ 0 (
    echo Using existing gh-pages branch
    git checkout gh-pages
    git rm -rf . 2>nul
) else (
    echo Creating new gh-pages branch...
    git checkout --orphan gh-pages
    git rm -rf . 2>nul
)
echo.

echo [4/5] Getting landing page from main branch...
REM Checkout files from main branch
git checkout %CURRENT_BRANCH% -- landing-page/index.html
if exist landing-page\README.md git checkout %CURRENT_BRANCH% -- landing-page/README.md

REM Move to root
move /Y landing-page\index.html index.html >nul
if exist landing-page\README.md move /Y landing-page\README.md landing-page-README.md >nul
rmdir /s /q landing-page 2>nul

echo.
echo [5/5] Committing and pushing...
git add index.html
if exist landing-page-README.md git add landing-page-README.md
git commit -m "Deploy landing page - %date% %time%"
git push origin gh-pages --force

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
echo https://ZuhaadRathore.github.io/Retention/
echo.
echo Note: It may take a few minutes for GitHub Pages to update.
echo.

echo Switching back to %CURRENT_BRANCH%...
git checkout %CURRENT_BRANCH%

echo.
echo Done! Press any key to exit.
pause >nul
