fx_version 'cerulean'
game 'gta5'

author 'ModoraLabs'
description 'Modora FiveM Control Center - Reports, moderation, player intelligence, health monitoring'
version '2.0.7'

dependency 'screenshot-basic'

shared_scripts {
    'config.lua',
    'shared/constants.lua',
    'shared/locales/en.lua',
    'shared/locales/nl.lua',
}

client_scripts {
    'client/utils.lua',
    'client/bootstrap.lua',
    'client/ui.lua',
    'client/reports.lua',
    'client/moderation.lua',
    'client/status.lua',
    'client/staff.lua',
}

server_scripts {
    'server/api.lua',
    'server/auth.lua',
    'server/permissions.lua',
    'server/reports.lua',
    'server/moderation.lua',
    'server/stats.lua',
    'server/uploads.lua',
    'server/sync.lua',
    'server/staff.lua',
    'server/bootstrap.lua',
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/styles.css',
    'html/app.js',
}
