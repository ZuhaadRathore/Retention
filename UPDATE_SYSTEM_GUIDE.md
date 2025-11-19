# Update System Setup Guide

This guide explains how to set up and use the automatic update system for Retention.

## Overview

The update system uses:
- **Tauri's built-in updater** for secure, automatic updates
- **GitHub Releases** for hosting update files
- **Database migrations** for schema changes
- **Automatic backups** before migrations

## Initial Setup

### 1. Generate Signing Keys

Updates must be cryptographically signed for security. Generate a keypair:

```bash
# Install Tauri CLI if not already installed
cargo install tauri-cli --version "^2.0.0"

# Generate signing keys
pnpm tauri signer generate -w ~/.tauri/retention.key
```

This creates:
- **Private key**: `~/.tauri/retention.key` (KEEP SECRET!)
- **Public key**: Printed to console

### 2. Configure Public Key

Copy the public key and update [tauri.conf.json](src-tauri/tauri.conf.json#L59):

```json
"pubkey": "YOUR_PUBLIC_KEY_HERE"
```

Replace `"UPDATE_PUBKEY_PLACEHOLDER"` with your actual public key.

### 3. Set Up GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

1. **TAURI_SIGNING_PRIVATE_KEY**: The entire contents of `~/.tauri/retention.key`
2. **TAURI_SIGNING_PRIVATE_KEY_PASSWORD**: The password you used when generating the key

### 4. Update GitHub Repository Info

In [tauri.conf.json](src-tauri/tauri.conf.json#L56), the endpoint uses `{{owner}}/{{repo}}` placeholders.
These are automatically replaced by Tauri with your GitHub username/org and repo name.

Make sure your repository is public or you have proper access tokens configured.

## Releasing Updates

### 1. Update Version Number

Update the version in [tauri.conf.json](src-tauri/tauri.conf.json#L3):

```json
"version": "0.2.0"
```

### 2. Create Database Migrations (if needed)

If you changed the database schema, add a migration to [python_sidecar/migrations.py](python_sidecar/migrations.py):

```python
# Add to MIGRATIONS list
Migration(
    version=2,
    description="Add new column to cards table",
    up=lambda conn: conn.execute("ALTER TABLE cards ADD COLUMN new_field TEXT"),
    down=lambda conn: conn.execute("ALTER TABLE cards DROP COLUMN new_field")
)
```

Update `CURRENT_SCHEMA_VERSION`:

```python
CURRENT_SCHEMA_VERSION = 2
```

### 3. Create and Push a Version Tag

```bash
git add .
git commit -m "Release v0.2.0"
git tag v0.2.0
git push origin main
git push origin v0.2.0
```

### 4. Automated Build Process

The GitHub Actions workflow will automatically:
1. Build the Windows installer
2. Create a signed update package
3. Generate `latest.json` with update metadata
4. Create a GitHub Release (draft)
5. Upload all artifacts

### 5. Publish the Release

1. Go to your GitHub repository's Releases page
2. Find the draft release
3. Review the build artifacts
4. Click "Publish release"

Users will now be notified of the update when they open the app!

## How Updates Work

### For Users

1. App checks for updates on startup (production only)
2. If update available, notification appears at top of screen
3. User clicks "Install Update"
4. Update downloads with progress bar
5. Update installs automatically
6. User restarts the app

### For Developers

The update flow:

```
App Startup
    ↓
Check for updates (React component)
    ↓
Tauri updater checks GitHub Releases
    ↓
If update found → Show notification
    ↓
User clicks install → Download update
    ↓
Install update → User restarts
    ↓
New version launches
    ↓
Database migrations run automatically (with backup)
```

## Database Migrations

### Automatic Backup System

Before running migrations, the system:
1. Creates `backups/` directory in app data folder
2. Copies the database (including WAL/SHM files)
3. Keeps last 10 backups automatically

### Migration Execution

On app startup, the sidecar:
1. Checks current schema version in `schema_version` table
2. Finds pending migrations (higher version numbers)
3. Creates backup
4. Runs migrations in order
5. Records each migration in `schema_version` table

If a migration fails, the backup location is logged.

### App Data Location

Database and backups are stored in:
- Windows: `%LOCALAPPDATA%\Retention\`

Files:
- `retention.sqlite` - Main database
- `retention.sqlite-wal` - Write-ahead log
- `retention.sqlite-shm` - Shared memory
- `backups/` - Database backups

## Troubleshooting

### Updates Not Showing

1. **Check version in tauri.conf.json** - Make sure it's higher than current
2. **Verify public key** - Must match the private key used for signing
3. **Check GitHub Release** - Must be published (not draft)
4. **Check latest.json** - Should exist in release assets

### Build Failures

1. **Missing secrets** - Verify GitHub Actions secrets are set
2. **Python dependencies** - Ensure `requirements.txt` is complete
3. **Rust compilation** - Check Cargo.toml dependencies

### Migration Failures

1. **Check logs** - Sidecar prints migration errors to console
2. **Restore backup** - Copy from `backups/` directory
3. **Fix migration** - Update migration code and re-release

## Security Notes

- **Never commit private keys** - Keep `~/.tauri/retention.key` secret
- **Use strong passwords** - For signing key encryption
- **Test updates locally** - Build and test before releasing
- **Keep backups** - Database backups are automatic but test restoration

## Testing Updates Locally

To test the update flow without releasing:

1. Build current version:
   ```bash
   pnpm tauri build
   ```

2. Install it on your system

3. Increment version in tauri.conf.json

4. Build new version

5. Create a local GitHub release with the installer

6. Open the app and check for updates

## CI/CD Workflow

The [release.yml](.github/workflows/release.yml) workflow:

1. **Triggers** on version tags (v*.*.*)
2. **Creates** draft release
3. **Builds** Windows installer with Python sidecar
4. **Signs** update package
5. **Uploads** artifacts to release
6. **Publishes** release (manual step)

## Version Numbering

Follow semantic versioning:
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features
- **Patch** (0.0.1): Bug fixes

## Support

For issues with the update system:
1. Check GitHub Actions logs
2. Review Tauri updater documentation
3. Test locally before releasing
4. Keep database backups

---

**Next Steps:**
1. Generate signing keys
2. Configure tauri.conf.json with public key
3. Set up GitHub secrets
4. Create your first release!
