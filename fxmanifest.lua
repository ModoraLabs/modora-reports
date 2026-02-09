fx_version 'cerulean'
game 'gta5'

author 'ModoraLabs'
description 'Modora FiveM Integration - Report system that creates Discord tickets'
version '1.0.4'

dependency 'screenshot-basic'

client_scripts {
    'config.lua',
    'client.lua'
}

server_scripts {
    'config.lua',
    'server.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js'
}