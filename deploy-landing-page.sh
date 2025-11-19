#!/bin/bash

set -e

echo "================================"
echo " Deploy Landing Page to GitHub Pages"
echo "================================"
echo ""

# Check if we're in the right directory
if [ ! -f "landing-page/index.html" ]; then
    echo "Error: landing-page/index.html not found!"
    echo "Please run this script from the project root directory."
    exit 1
fi

echo "[1/5] Saving current branch..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

echo "[2/5] Checking for uncommitted changes..."
if ! git diff-index --quiet HEAD --; then
    echo "Warning: You have uncommitted changes!"
    echo "Please commit or stash them before deploying."
    exit 1
fi
echo ""

echo "[3/5] Switching to gh-pages branch..."
if git show-ref --verify --quiet refs/heads/gh-pages; then
    echo "Using existing gh-pages branch"
    git checkout gh-pages
    # Clean the branch
    git rm -rf . 2>/dev/null || true
else
    echo "Creating new gh-pages branch..."
    git checkout --orphan gh-pages
    git rm -rf . 2>/dev/null || true
fi
echo ""

echo "[4/5] Getting landing page from main branch..."
# Checkout files from main branch
git checkout $CURRENT_BRANCH -- landing-page/index.html
[ -f landing-page/README.md ] && git checkout $CURRENT_BRANCH -- landing-page/README.md || true

# Move to root
mv landing-page/index.html index.html
[ -f landing-page/README.md ] && mv landing-page/README.md landing-page-README.md || true
rm -rf landing-page

echo ""

echo "[5/5] Committing and pushing..."
git add index.html
[ -f landing-page-README.md ] && git add landing-page-README.md || true
git commit -m "Deploy landing page - $(date)"
git push origin gh-pages --force

echo ""
echo "================================"
echo " Deployment Complete!"
echo "================================"
echo ""
echo "Your landing page will be live at:"
echo "https://yourusername.github.io/Flash-AI/"
echo ""
echo "Note: It may take a few minutes for GitHub Pages to update."
echo ""

echo "Switching back to $CURRENT_BRANCH..."
git checkout "$CURRENT_BRANCH"

echo ""
echo "Done!"
