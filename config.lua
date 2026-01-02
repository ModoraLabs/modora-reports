Config = {}

-- ============================================
-- REPORT FORM URL (REQUIRED)
-- ============================================
-- Report Form URL - Iframe URL for the report form
-- Get this from your Modora Dashboard:
-- Dashboard > Guild > FiveM Integration > [Your Server] > Report Form URL
-- Replace {guildId} and {uniqueId} with values from your dashboard
Config.ReportFormURL = 'https://modora.xyz/fivem/{guildId}/reports/{uniqueId}'
-- Example: Config.ReportFormURL = 'https://modora.xyz/fivem/123456789/reports/abc123def456'

-- ============================================
-- REPORT COMMAND & KEYBIND
-- ============================================
Config.ReportCommand = 'report'
Config.ReportKeybind = 'F7' -- Or false to disable

-- ============================================
-- NEARBY PLAYERS SETTINGS
-- ============================================
Config.NearbyRadius = 30.0 -- Radius in meters for nearby players detection
Config.MaxNearbyPlayers = 5 -- Maximum number of nearby players to show

-- ============================================
-- DEBUG & LOCALE
-- ============================================
Config.Debug = false -- Set to true for detailed logging
Config.Locale = 'nl' -- 'nl' or 'en'

Config.Messages = {
    ['nl'] = {
        ['report_opened'] = 'Report menu geopend. Gebruik ESC om te sluiten.',
        ['report_sent'] = 'Je report is verzonden! Ticket ID: %s',
        ['report_failed'] = 'Je report kon niet worden verzonden. Probeer het later opnieuw.',
        ['cooldown_active'] = 'Je moet %d seconden wachten voordat je een nieuw report kunt maken.',
        ['no_nearby_players'] = 'Geen spelers in de buurt gevonden.',
        ['upload_failed'] = 'Upload van bijlage mislukt.',
        ['config_failed'] = 'Report Form URL niet geconfigureerd. Controleer config.lua.',
    },
    ['en'] = {
        ['report_opened'] = 'Report menu opened. Press ESC to close.',
        ['report_sent'] = 'Your report has been sent! Ticket ID: %s',
        ['report_failed'] = 'Your report could not be sent. Please try again later.',
        ['cooldown_active'] = 'You must wait %d seconds before creating a new report.',
        ['no_nearby_players'] = 'No nearby players found.',
        ['upload_failed'] = 'Failed to upload attachment.',
        ['config_failed'] = 'Report Form URL not configured. Check config.lua.',
    }
}

function GetMessage(key)
    return Config.Messages[Config.Locale][key] or Config.Messages['en'][key] or key
end
