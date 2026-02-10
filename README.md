# Modora FiveM Admin

Version: 1.0.6
Author: ModoraLabs

FiveM resource: **Reports** — in-game report form → Discord ticket.

## Install

1. Clone or download this repo. **Rename the folder to `modora-admin`** (the FiveM resource name is the folder name).
2. Place the `modora-admin` folder in your server `resources` directory.
3. Add to `server.cfg`:
   ```cfg
   ensure modora-admin
   ```
4. Configure `config.lua` with your API token (from Modora Dashboard → FiveM → your server).

## Features

- **Reports:** `/report` (or keybind) opens the report form; submissions create Discord tickets.

## Configuration

```lua
Config.ModoraAPIBase = 'http://api.modoralabs.com'
Config.APIToken = 'your_api_token_here'
Config.ReportCommand = 'report'
Config.ReportKeybind = 'F7'
Config.NearbyRadius = 30.0
Config.MaxNearbyPlayers = 5
Config.Locale = 'en'
Config.Debug = false
```

Optional convars in `server.cfg`:

```cfg
set modora_api_base "http://api.modoralabs.com"
set modora_api_token "your_token"
```

When using the server IP as base (e.g. `http://157.180.103.21`), set the Host header:

```lua
Config.ModoraHostHeader = 'api.modoralabs.com'
```

Restart after config changes:

```
restart modora-admin
```

**API base:** Use only `https://api.modoralabs.com` (or `http://api.modoralabs.com`) or the server IP + `ModoraHostHeader = 'api.modoralabs.com'`.  
*(We use `api.modoralabs.com` because FiveM blocks requests to `.xyz` domains.)*

### Alpha environment (IP-based testing)

To test against the alpha dashboard (alpha.modora.xyz) with IP-based access:

```lua
Config.UseAlphaEnvironment = true
Config.ModoraAPIBaseAlpha = 'http://ALPHA_SERVER_IP'   -- IP of the alpha deployment
Config.ModoraHostHeaderAlpha = 'api.alpha.modoralabs.com'  -- Host header for alpha (when using IP)
Config.APITokenAlpha = 'alpha_server_api_token'       -- API token from the FiveM server in the alpha dashboard
```

Or via convar: `set modora_use_alpha 1` (and set the Alpha config values in config.lua).  
On the **alpha** Laravel deployment, set `FIVEM_API_IP_HOSTS` to the alpha server IP so the API routes match when the request Host is that IP.

## NUI (report form)

- **Lua → NUI:** `openReport` with optional `INIT` (serverName, cooldownRemaining, playerName, version); `reportSubmitted` (success, ticketNumber, ticketId, ticketUrl, error, cooldownSeconds).
- **NUI → Lua:** `closeReport`, `requestPlayerData`, `requestServerConfig`, `submitReport` (category, subject, description, priority, reporter, targets, attachments, evidenceUrls).

## Support

- Discord: https://discord.gg/modora
- Website: https://modora.xyz
- Docs: https://modora.xyz/docs
- GitHub: https://github.com/ModoraLabs/modora-admin
