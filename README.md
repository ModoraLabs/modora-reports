# 🎮 Modora FiveM Integration Resource

**Version:** 1.0.1  
**FiveM:** All versions  
**Author:** Modora Labs

---

## 📋 Overview

This FiveM resource connects your server to Modora Discord bot, allowing players to create reports in-game that automatically become Discord tickets via an iframe-based form.

### Features

- ✅ `/report` command with iframe-based modal menu
- ✅ Direct integration with Modora Dashboard report form
- ✅ Custom form builder with categories and questions
- ✅ File upload support for attachments
- ✅ Nearby players detection (configurable radius)
- ✅ Category-based ticket routing to specific staff teams
- ✅ Multi-language support (Dutch/English)

---

## 🚀 Installation

### Prerequisites

- FiveM Server
- Modora Dashboard account
- Access to your Discord server with Modora bot installed

### Step 1: Download & Install

1. Download or clone this resource
2. Place the resource folder in your FiveM server's `resources` directory
3. Add to your `server.cfg`:
   ```cfg
   ensure modora-reports
   ```

**Note:** Screenshot functionality has been disabled. Use file upload instead to add screenshots to reports.

### Step 2: Configure Report Form URL

Edit `config.lua` and set the Report Form URL:

```lua
Config.ReportFormURL = 'https://modora.xyz/fivem/{guildId}/reports/{uniqueId}'
```

**How to get your Report Form URL:**

1. Go to your Modora Dashboard
2. Navigate to: **Guild Settings > FiveM Integration**
3. Add a new server or select existing server
4. Copy the **Report Form URL** from the server settings page
5. Paste it in `config.lua` replacing the placeholders

**Example:**
```lua
Config.ReportFormURL = 'https://modora.xyz/fivem/123456789/reports/abc123def456'
```

**Important:** Make sure to replace `{guildId}` and `{uniqueId}` with actual values from your dashboard, or use the complete URL provided in the dashboard.

### Step 3: Configure Additional Settings

Edit `config.lua` to customize:

```lua
Config.ReportCommand = 'report'        -- Command name
Config.ReportKeybind = 'F7'            -- Keybind (or false to disable)
Config.NearbyRadius = 30.0             -- Radius in meters for nearby players
Config.MaxNearbyPlayers = 5            -- Maximum number of nearby players to show
Config.Locale = 'nl'                   -- Language: 'nl' or 'en'
Config.Debug = false                   -- Set to true for detailed logging
```

### Step 4: Restart Resource

```
restart modora-reports
```

---

## 📖 Usage

### For Players

1. Type `/report` in chat or press `F7` (default keybind)
2. The report form opens as an iframe modal menu
3. Fill in the custom report form (configured in dashboard)
4. Select category, priority, and fill in custom fields
5. Upload files/attachments if needed (use file upload, not screenshot)
6. Click "Submit Report"
7. Report is automatically created as a Discord ticket
8. You'll receive confirmation with the ticket number in-game

### For Server Owners

1. **Configure Report Form in Dashboard:**
   - Go to: **Guild Settings > FiveM Integration > [Your Server]**
   - Use the **Report Form Builder** to create custom categories and questions
   - Assign ticket panels to specific categories for routing to staff teams
   - Configure file upload settings (max file size, allowed types)
   - Add intro text to display above the form

2. **Configure Channel Name Template:**
   - In the server settings, set a custom channel name template
   - Available placeholders: `{ticket_number}`, `{subject}`, `{reporter_name}`
   - Example: `report-{ticket_number}` or `{subject}-{ticket_number}`

3. **Reports appear in your Discord ticket system:**
   - All player information (identifiers, position, etc.) is included
   - Custom form fields are displayed in a second embed
   - Attachments are uploaded to Modora CDN and sent to Discord
   - Staff can respond in Discord tickets

---

## ⚙️ Configuration Options

### `config.lua`

| Option | Description | Default |
|--------|-------------|---------|
| `Config.ReportFormURL` | Iframe URL for the report form (REQUIRED) | `'https://modora.xyz/fivem/{guildId}/reports/{uniqueId}'` |
| `Config.ReportCommand` | Command name | `'report'` |
| `Config.ReportKeybind` | Keybind (or `false` to disable) | `'F7'` |
| `Config.NearbyRadius` | Radius in meters for nearby players detection | `30.0` |
| `Config.MaxNearbyPlayers` | Maximum number of nearby players to show | `5` |
| `Config.Locale` | Language (`'nl'` or `'en'`) | `'nl'` |
| `Config.Debug` | Enable debug prints | `false` |

---

## 🔧 How It Works

The resource uses an iframe-based approach:

1. **Report Form URL**: The form is hosted on Modora Dashboard and loaded via iframe
2. **Player Data Sync**: Player information (identifiers, position, nearby players) is automatically sent to the iframe via postMessage API
3. **Form Submission**: The form submits directly to Modora Dashboard API
4. **Ticket Creation**: Reports are automatically created as Discord tickets in the configured panel
5. **File Uploads**: Attachments are uploaded to Modora CDN and sent to Discord

### Communication Flow

```
Player opens /report
  ↓
Resource opens iframe with Report Form URL
  ↓
Player data sent via postMessage API
  ↓
Form filled and submitted
  ↓
Laravel backend processes form
  ↓
Bot task created for Discord
  ↓
Ticket created in Discord channel
  ↓
Success message shown in-game
```

---

## 🐛 Troubleshooting

### Resource won't start

- Check `fxmanifest.lua` syntax
- Verify all files are present
- Check server console for errors
- Ensure resource folder is named `modora-reports`

### Report form not opening

- Verify `Config.ReportFormURL` is correctly set in `config.lua`
- Check that the URL is accessible (test in browser)
- Ensure the URL matches the one from your dashboard
- Check firewall allows outbound connections on port 443 (HTTPS)
- Enable `Config.Debug = true` for detailed logs
- Check FiveM console (F8) for JavaScript errors

### Invalid Report Form URL

- Make sure you replaced `{guildId}` and `{uniqueId}` with actual values
- Or use the complete URL from your dashboard server settings
- Verify the URL format: `https://modora.xyz/fivem/{guildId}/reports/{uniqueId}`
- Ensure there are no extra spaces or characters

### Reports not submitting

- Check server console for errors
- Verify the Report Form URL is correct and accessible
- Check if player data is being sent correctly to the iframe
- Enable debug mode (`Config.Debug = true`) to see detailed logs

### Iframe not loading

- Check browser console (F8 in FiveM)
- Verify `Config.ReportFormURL` is correct
- Check if the URL is accessible from your server

### Custom fields not being sent

- Open browser console (F12) when opening the form
- Fill in a field and check if `customFieldValues` is being updated
- Check console logs on submit to see if `customFields` is built correctly
- Verify the form configuration in dashboard has fields defined

### Form is blank in-game

- Verify `Config.ReportFormURL` is set correctly
- Check that the URL is accessible
- Ensure the iframe is loading (check browser console)
- Try restarting the resource: `restart modora-reports`

### No ticket created after submission

- Check bot task processor logs
- Verify ticket panel is configured correctly
- Check if the category has a panel assigned
- Verify Discord bot has proper permissions

### Attachments not being sent

- Verify file upload is enabled in form configuration
- Check file size limits (max 10MB by default)
- Ensure file types are allowed
- Verify attachments are being uploaded successfully

---

## 📝 File Structure

```
modora-reports/
├── fxmanifest.lua    # Resource manifest
├── config.lua        # Configuration
├── client.lua        # Client-side logic (iframe handling, NUI focus)
├── server.lua        # Server-side logic (player identifiers, screenshot handling)
├── html/
│   ├── index.html    # Iframe container HTML
│   ├── style.css     # Styling
│   └── script.js     # JavaScript (postMessage communication)
└── README.md         # This file
```

---

## 🔐 Security

- Report Form URLs are unique per server
- Player data is securely transmitted via postMessage API
- All communication uses HTTPS
- Form submissions are validated server-side
- CSRF protection is enabled for form submissions

---

## 🧪 Testing

1. Enable debug mode: `Config.Debug = true` in `config.lua`
2. Check server console for logs
3. Use FiveM console: `F8` to open browser console
4. Test with `/report` command

---

## 📞 Support

For issues or questions:
- Discord: https://discord.gg/modora
- Website: https://modora.xyz
- Documentation: https://modora.xyz/docs

---

## 📄 License

Copyright © 2025 Modora Labs. All rights reserved.
