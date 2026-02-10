Config = {}

-- ============================================
-- API CONFIGURATION (REQUIRED)
-- ============================================
-- API base URL (no trailing slash). Use hostname or IP; when using IP, set ModoraHostHeader.
Config.ModoraAPIBase = 'http://api.modoralabs.com'

-- Host header when using an IP as base URL. Leave empty when using hostname.
Config.ModoraHostHeader = ''

-- API token from the Modora dashboard (FiveM → your server → API).
Config.APIToken = 'your_api_key'

-- ============================================
-- REPORT COMMAND & KEYBIND
-- ============================================
Config.ReportCommand = 'report'
Config.ReportKeybind = 'disable' -- Or F7 as example

-- ============================================
-- NEARBY PLAYERS SETTINGS
-- ============================================
Config.NearbyRadius = 30.0 -- Radius in meters for nearby players detection
Config.MaxNearbyPlayers = 5 -- Maximum number of nearby players to show

-- ============================================
-- LOCALE & LOGGING
-- ============================================
Config.Debug = false
Config.Locale = 'en'  -- 'nl' or 'en'

Config.Messages = {
    ['nl'] = {
        ['report_opened'] = 'Report menu geopend. Gebruik ESC om te sluiten.',
        ['report_sent'] = 'Je report is verzonden! Ticket ID: %s',
        ['report_failed'] = 'Je report kon niet worden verzonden. Probeer het later opnieuw.',
        ['cooldown_active'] = 'Je moet %d seconden wachten voordat je een nieuw report kunt maken.',
        ['no_nearby_players'] = 'Geen spelers in de buurt gevonden.',
        ['upload_failed'] = 'Upload van bijlage mislukt.',
        ['config_failed'] = 'Modora API-token niet geconfigureerd. Controleer config.lua.',
        ['auth_failed'] = 'Authenticatie mislukt. Controleer het Modora API-token in het dashboard (FiveM → jouw server → API Credentials).',
    },
    ['en'] = {
        ['report_opened'] = 'Report menu opened. Press ESC to close.',
        ['report_sent'] = 'Your report has been sent! Ticket ID: %s',
        ['report_failed'] = 'Your report could not be sent. Please try again later.',
        ['cooldown_active'] = 'You must wait %d seconds before creating a new report.',
        ['no_nearby_players'] = 'No nearby players found.',
        ['upload_failed'] = 'Failed to upload attachment.',
        ['config_failed'] = 'Modora API token not configured. Check config.lua.',
        ['auth_failed'] = 'Authentication failed. Check the Modora API token in the dashboard (FiveM → your server → API Credentials).',
    }
}

function GetMessage(key)
    return Config.Messages[Config.Locale][key] or Config.Messages['en'][key] or key
end
