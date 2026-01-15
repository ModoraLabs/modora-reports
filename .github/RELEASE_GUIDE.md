# 🚀 Release Guide

This guide explains how to create releases for modora-reports using GitHub Actions.

## 📋 Automatic Release (Recommended)

Releases are automatically created when you push a git tag that follows semantic versioning.

### Steps:

1. **Update version in `fxmanifest.lua`**
   ```lua
   version '1.0.2'  -- Update to new version
   ```

2. **Update `CHANGELOG.md`** with the new version entry
   ```markdown
   ## [1.0.2] - 2025-01-29
   
   ### Fixed
   - Fixed issue X
   - Improved feature Y
   ```

3. **Commit and push your changes**
   ```bash
   git add .
   git commit -m "Release v1.0.2"
   git push origin main
   ```

4. **Create and push a git tag**
   ```bash
   git tag -a v1.0.2 -m "Release v1.0.2"
   git push origin v1.0.2
   ```

5. **GitHub Actions will automatically:**
   - Extract version from the tag
   - Extract release notes from CHANGELOG.md
   - Create a GitHub release with all files
   - Attach release assets (zip file)

## 🔧 Manual Release (Alternative)

If you prefer to create releases manually through GitHub UI:

1. Go to **Releases** → **Draft a new release**
2. Click **Choose a tag** → Create new tag (e.g., `v1.0.2`)
3. Fill in release title and description (copy from CHANGELOG.md)
4. Upload release files or let GitHub auto-generate a zip
5. Click **Publish release**

## 📝 Release Checklist

- [ ] Version updated in `fxmanifest.lua`
- [ ] Version updated in `server.lua` (RESOURCE_VERSION)
- [ ] Version updated in `README.md`
- [ ] CHANGELOG.md updated with new version entry
- [ ] All changes committed and pushed
- [ ] Git tag created and pushed (for automatic release)

## 🎯 Version Format

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR.MINOR.PATCH** (e.g., 1.0.1, 1.1.0, 2.0.0)
- Tag format: **vMAJOR.MINOR.PATCH** (e.g., v1.0.1, v1.1.0, v2.0.0)

## 📦 What Gets Included in Releases

The automatic release workflow includes:
- All `.lua` files
- All `.md` files (README, CHANGELOG, etc.)
- `html/` folder with all assets
- `LICENSE` file

## 🔗 Workflow Files

- **`.github/workflows/release.yml`** - Automatic release on tag push
- **`.github/workflows/release-manual.yml`** - Manual trigger via GitHub Actions UI



