# Landing Page Deployment Guide

This guide explains how to deploy your landing page to GitHub Pages using the automated scripts.

## Quick Start

### Windows
```bash
# Run the deployment script
deploy-landing-page.bat
```

### Linux/Mac/Git Bash
```bash
# Run the deployment script
./deploy-landing-page.sh
```

## First-Time Setup

### 1. Enable GitHub Pages

After running the deployment script for the first time:

1. Go to your GitHub repository
2. Click **Settings** → **Pages**
3. Under "Source", select:
   - **Branch**: `gh-pages`
   - **Folder**: `/ (root)`
4. Click **Save**

### 2. Wait for Deployment

GitHub will build and deploy your site. This usually takes 1-2 minutes.

### 3. Access Your Site

Your landing page will be available at:
```
https://yourusername.github.io/Flash-AI/
```

Replace `yourusername` with your GitHub username.

## What the Script Does

1. **Saves current branch** - Remembers where you were
2. **Checks for changes** - Ensures you don't lose uncommitted work
3. **Switches to gh-pages** - Creates or uses existing deployment branch
4. **Copies landing page** - Copies `landing-page/index.html` to root
5. **Commits and pushes** - Deploys to GitHub
6. **Returns to original branch** - Switches back to where you started

## Updating the Landing Page

Whenever you make changes to `landing-page/index.html`:

```bash
# 1. Make changes to landing-page/index.html
# 2. Commit your changes to main branch
git add landing-page/index.html
git commit -m "Update landing page"
git push origin main

# 3. Deploy to GitHub Pages
deploy-landing-page.bat  # or .sh on Linux/Mac
```

## Adding a Custom Domain (Optional)

### 1. Add CNAME File

Create a file named `CNAME` in the `landing-page` directory:
```
yourdomain.com
```

### 2. Update Script to Include CNAME

The script will automatically copy it during deployment.

### 3. Configure DNS

Add a CNAME record in your domain's DNS settings:
```
Type: CNAME
Name: www (or @)
Value: yourusername.github.io
```

### 4. Configure on GitHub

1. Go to **Settings** → **Pages**
2. Enter your custom domain
3. Wait for DNS check to complete
4. Enable "Enforce HTTPS"

## Linking to Latest Release

Update the download link in `landing-page/index.html` to:

```html
<a href="https://github.com/yourusername/Flash-AI/releases/latest">
    Download Now
</a>
```

This always points to the most recent release.

## Troubleshooting

### "Permission denied" Error

Run as administrator (Windows) or use `sudo` (Linux/Mac):
```bash
# Windows: Right-click → Run as administrator
# Linux/Mac:
chmod +x deploy-landing-page.sh
./deploy-landing-page.sh
```

### "Not a git repository" Error

Make sure you're in the project root directory:
```bash
cd /path/to/Flash-AI
deploy-landing-page.bat
```

### "Push rejected" Error

The gh-pages branch might be behind. Force push:
```bash
git checkout gh-pages
git push -f origin gh-pages
git checkout main
```

### 404 Error After Deployment

1. Check GitHub Pages settings (Settings → Pages)
2. Ensure branch is set to `gh-pages` and folder is `/ (root)`
3. Wait 2-3 minutes for propagation
4. Clear browser cache

### Changes Not Showing

1. Clear browser cache (Ctrl+F5 or Cmd+Shift+R)
2. Check if deployment succeeded: https://github.com/yourusername/Flash-AI/deployments
3. Wait a few minutes for CDN cache to clear

## Advanced: GitHub Actions Auto-Deploy

For automatic deployment on every push to main, create `.github/workflows/deploy-landing.yml`:

```yaml
name: Deploy Landing Page

on:
  push:
    branches: [main]
    paths:
      - 'landing-page/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to GitHub Pages
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git checkout --orphan gh-pages || git checkout gh-pages
          cp landing-page/index.html index.html
          git add index.html
          git commit -m "Auto-deploy landing page"
          git push -f origin gh-pages
```

This automatically deploys whenever you modify files in `landing-page/`.

## Monitoring

### Check Deployment Status

https://github.com/yourusername/Flash-AI/deployments

### View GitHub Pages Logs

**Settings** → **Pages** → View deployment history

### Analytics (Optional)

Add Google Analytics or Plausible to `index.html` to track visitors.

## Best Practices

1. **Test locally first** - Open `landing-page/index.html` in browser before deploying
2. **Version control** - Always commit changes to main before deploying
3. **Keep it simple** - Landing page should be fast and lightweight
4. **Update download links** - Point to latest release after each app update
5. **Add metadata** - Include proper meta tags for SEO and social sharing

## Support

For issues:
- Check GitHub Pages documentation: https://docs.github.com/en/pages
- Review deployment logs on GitHub
- Test the script with `--dry-run` flag (if implemented)

---

**Ready to deploy?** Run `deploy-landing-page.bat` (Windows) or `./deploy-landing-page.sh` (Linux/Mac)!
