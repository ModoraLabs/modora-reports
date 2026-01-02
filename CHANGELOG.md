# Changelog

All notable changes to the Modora FiveM Integration Resource will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2025-01-28

### Fixed
- Fixed iframe embedding issues caused by X-Frame-Options header blocking
- Improved error handling for FiveM NUI callbacks to prevent console spam
- Fixed timing issues with iframe contentWindow availability
- Consolidated multiple message event listeners into a single handler
- Added retry logic for sending player data to iframe when not ready
- Improved network error handling to only log unexpected errors

### Improved
- Better code organization with separated handler functions
- More robust error handling for network failures
- Improved iframe reference management
- Added 100ms delay after iframe load for better reliability

### Technical Details
- Created `sendNUICallback()` helper function for all NUI callbacks
- Added response validation before parsing JSON
- Improved iframe timing with reference caching and retry logic
- Separated iframe message handling into dedicated function

---

## [1.0.0] - 2024-XX-XX

### Added
- Initial release of Modora FiveM Integration Resource
- `/report` command with iframe-based modal menu
- Direct integration with Modora Dashboard report form
- Custom form builder with categories and questions
- File upload support for attachments
- Nearby players detection (configurable radius)
- Category-based ticket routing to specific staff teams
- Multi-language support (Dutch/English)
- Screenshot functionality support (via screenshot-basic)

