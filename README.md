# Modora FiveM Integration Resource

Version: 1.0.4
Author: ModoraLabs

## Overview

Connects your FiveM server to Modora so players can submit in-game reports that become Discord tickets.

## Install

1. Place the resource in your server `resources` directory.
2. Add to `server.cfg`:
   ```cfg
   ensure modora-reports
   ```
3. Configure `config.lua` with your API token.

## Configuration

```lua
Config.ModoraAPIBase = 'http://api.modora.xyz'
Config.APIToken = 'your_api_token_here'
Config.ReportCommand = 'report'
Config.ReportKeybind = 'F7'
Config.NearbyRadius = 30.0
Config.MaxNearbyPlayers = 5
Config.Locale = 'en'
Config.Debug = false
```

If you use an IP address for the API base URL, set the Host header:

```lua
Config.ModoraAPIBase = 'http://157.180.103.21'
Config.ModoraHostHeader = 'api.modora.xyz'
```

Restart the resource:

```
restart modora-reports
```

## Support

- Discord: https://discord.gg/modora
- Website: https://modora.xyz
- Docs: https://modora.xyz/docs
- GitHub: https://github.com/ModoraLabs/modora-reports
