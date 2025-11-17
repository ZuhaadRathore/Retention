# Release Checklist

Use this checklist when preparing a new Flash-AI release.

## Pre-Release

- [ ] All planned features for this version are merged to `main`
- [ ] All CI checks passing on `main` branch
- [ ] Manual testing completed on all platforms
- [ ] Documentation updated for new features
- [ ] Risk log ([docs/risk-log.md](../docs/risk-log.md)) reviewed and updated

## Version Bump

- [ ] Decide version number (major.minor.patch)
  - **Patch**: Bug fixes, minor improvements
  - **Minor**: New features, backwards compatible
  - **Major**: Breaking changes

- [ ] Run version bump script:
  ```bash
  # Choose one:
  pnpm version:patch   # 0.1.0 → 0.1.1
  pnpm version:minor   # 0.1.0 → 0.2.0
  pnpm version:major   # 0.1.0 → 1.0.0
  ```

- [ ] Review version changes:
  ```bash
  git diff
  ```

- [ ] Verify version in all four files:
  - [ ] `package.json`
  - [ ] `src-tauri/Cargo.toml`
  - [ ] `src-tauri/tauri.conf.json`
  - [ ] `python_sidecar/pyproject.toml`

## Commit and Tag

- [ ] Commit version bump:
  ```bash
  git commit -am "chore: bump version to X.Y.Z"
  ```

- [ ] Create version tag:
  ```bash
  git tag vX.Y.Z
  ```

- [ ] Push commit and tag:
  ```bash
  git push && git push --tags
  ```

## Monitor Build

- [ ] Open [GitHub Actions](https://github.com/YOUR_ORG/Flash-AI/actions)
- [ ] Watch Release workflow progress
- [ ] Verify all three platform builds succeed:
  - [ ] Windows build completes
  - [ ] macOS build completes
  - [ ] Linux build completes

## Release Notes

Draft your release notes covering:

### Features
- List new features with brief descriptions
- Include screenshots/GIFs if applicable

### Improvements
- List enhancements to existing features
- Performance improvements

### Bug Fixes
- List resolved issues with issue numbers (#123)

### Breaking Changes
- Clearly document any breaking changes
- Provide migration instructions

## Finalize Release

- [ ] Go to [GitHub Releases](https://github.com/YOUR_ORG/Flash-AI/releases)
- [ ] Find draft release for vX.Y.Z
- [ ] Paste prepared release notes
- [ ] Verify all assets are present:
  - [ ] `Flash-AI-vX.Y.Z-x64.msi` (Windows)
  - [ ] `Flash-AI-vX.Y.Z-x64.msi.sha256`
  - [ ] `Flash-AI-vX.Y.Z.dmg` (macOS)
  - [ ] `Flash-AI-vX.Y.Z.dmg.sha256`
  - [ ] `Flash-AI-vX.Y.Z.AppImage` (Linux)
  - [ ] `Flash-AI-vX.Y.Z.AppImage.sha256`
- [ ] Check "Pre-release" if this is a beta/alpha version
- [ ] Click "Publish release"

## Post-Release

- [ ] Test download links work
- [ ] Verify checksums match:
  ```bash
  # Windows (PowerShell)
  certutil -hashfile Flash-AI-vX.Y.Z-x64.msi SHA256

  # macOS/Linux
  sha256sum Flash-AI-vX.Y.Z.dmg
  ```

- [ ] Install and test on each platform
- [ ] Update project website/documentation (if applicable)
- [ ] Announce release:
  - [ ] Project Discord/Slack
  - [ ] Social media
  - [ ] Email list

- [ ] Create milestone for next version
- [ ] Move incomplete issues to next milestone

## Hotfix Release

If you need to release an urgent bug fix:

1. Create hotfix branch from the release tag:
   ```bash
   git checkout -b hotfix/vX.Y.Z vX.Y.Z
   ```

2. Make minimal fix
3. Bump patch version: `pnpm version:patch`
4. Commit: `git commit -am "fix: critical issue description"`
5. Tag: `git tag vX.Y.Z+1`
6. Push: `git push origin hotfix/vX.Y.Z --tags`
7. Merge back to main: `git checkout main && git merge hotfix/vX.Y.Z`

## Rollback Procedure

If critical issues are discovered after release:

1. **Delete the release:**
   - Go to GitHub Releases
   - Edit the release
   - Click "Delete this release"

2. **Delete the tag:**
   ```bash
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```

3. **Communicate:**
   - Update release page with issue details
   - Notify users through all channels
   - Document issue in risk log

4. **Fix and re-release:**
   - Fix the critical issue
   - Bump to next patch version
   - Follow standard release process

## Troubleshooting

### Build Failures

**Check logs:**
- Go to failed workflow run
- Expand failed step
- Review error messages

**Common issues:**
- Dependency version conflicts
- Platform-specific compilation errors
- Sidecar binary build failures

**Solutions:**
- Run locally: `pnpm build`
- Check [CI/CD Guide](../docs/ci-cd-guide.md)
- Review previous successful builds

### Missing Assets

**If Windows .msi is missing:**
- Check `src-tauri/target/release/bundle/msi/`
- Verify Tauri config targets include "msi"

**If macOS .dmg is missing:**
- Check signing configuration
- Verify macOS runner succeeded

**If Linux .AppImage is missing:**
- Check system dependencies were installed
- Verify AppImage bundling is enabled

## Contact

For CI/CD issues:
- Create issue with `ci/cd` label
- Tag `@devops-team` (if applicable)
- Check [CI/CD Guide](../docs/ci-cd-guide.md)
