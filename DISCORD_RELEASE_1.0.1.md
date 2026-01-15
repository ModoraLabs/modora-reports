# 🎮 Modora Reports v1.0.1 - Release Notes

## 🐛 Bug Fixes

✅ **Fixed iframe embedding issues**
- Resolved X-Frame-Options header blocking that prevented the report form from loading in-game
- Report forms should now load correctly without browser errors

✅ **Improved error handling**
- Fixed console spam from failed FiveM NUI callbacks
- Network errors are now handled gracefully without flooding the console
- Better error messages for debugging

✅ **Fixed timing issues**
- Resolved problems with iframe contentWindow not being available immediately
- Added retry logic for sending player data to the form
- Improved reliability when opening the report form

## ⚡ Improvements

🔧 **Code improvements**
- Consolidated multiple message handlers into a single, more efficient handler
- Better code organization with separated handler functions
- Improved iframe reference management

🛡️ **Stability**
- More robust error handling for network failures
- Added 100ms delay after iframe load for better reliability
- Response validation before parsing JSON data

## 📥 Download

**GitHub:** https://github.com/ModoraLabs/modora-reports/releases/tag/v1.0.1

**Installation:**
1. Download the latest release from GitHub
2. Replace your existing `modora-reports` folder
3. Restart the resource: `restart modora-reports`

## 📝 Full Changelog

For detailed technical changes, see the [CHANGELOG.md](https://github.com/ModoraLabs/modora-reports/blob/main/CHANGELOG.md)

---

**Questions or issues?** Join our Discord: https://discord.gg/modora



