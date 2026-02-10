fx_version 'cerulean'
game 'gta5'

author 'ModoraLabs'
description 'Modora FiveM Admin - Reports (in-game report → Discord ticket)'
version '1.0.6'

dependency 'screenshot-basic'

client_scripts {
    'config.lua',
    'client/main.lua'
}

server_scripts {
    'config.lua',
    'server/main.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/styles.css',
    'html/app.js'
}