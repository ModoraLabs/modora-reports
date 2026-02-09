local isMenuOpen = false
local nearbyPlayers = {}
local playerIdentifiersCache = {}
local serverConfig = nil

-- ============================================
-- PLAYER IDENTIFIERS
-- ============================================

RegisterNetEvent('modora:playerIdentifiers')
AddEventHandler('modora:playerIdentifiers', function(serverIdentifiers)
    playerIdentifiersCache = serverIdentifiers or {}
end)

-- ============================================
-- NEARBY PLAYERS
-- ============================================

function GetNearbyPlayers(coords, radius, maxPlayers)
    local players = {}
    local playerPed = PlayerPedId()
    local playerCoords = coords or GetEntityCoords(playerPed)
    
    for _, playerId in ipairs(GetActivePlayers()) do
        if playerId ~= PlayerId() then
            local targetPed = GetPlayerPed(playerId)
            if targetPed and targetPed ~= 0 then
                local targetCoords = GetEntityCoords(targetPed)
                local distance = #(playerCoords - targetCoords)
                
                if distance <= radius then
                    local serverId = GetPlayerServerId(playerId)
                    local playerName = GetPlayerName(playerId)
                    
                    table.insert(players, {
                        fivemId = serverId,
                        name = playerName,
                        distance = math.floor(distance)
                    })
                    
                    if #players >= maxPlayers then
                        break
                    end
                end
            end
        end
    end
    
    return players
end

-- ============================================
-- NUI CALLBACKS
-- ============================================

RegisterNUICallback('closeReport', function(data, cb)
    SetNuiFocus(false, false)
    isMenuOpen = false
    cb('ok')
end)

RegisterNUICallback('requestPlayerData', function(data, cb)
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local nearbyPlayers = GetNearbyPlayers(coords, Config.NearbyRadius or 30.0, Config.MaxNearbyPlayers or 5)
    
    -- Request identifiers from server
    playerIdentifiersCache = {}
    TriggerServerEvent('modora:getPlayerIdentifiers')
    
    -- Wait for server response (max 500ms)
    local waitCount = 0
    while next(playerIdentifiersCache) == nil and waitCount < 10 do
        Wait(50)
        waitCount = waitCount + 1
    end
    
    local playerData = {
        fivemId = GetPlayerServerId(PlayerId()),
        name = GetPlayerName(PlayerId()),
        identifiers = playerIdentifiersCache,
        position = { x = coords.x, y = coords.y, z = coords.z },
        nearbyPlayers = nearbyPlayers
    }
    
    if Config.Debug then
        print('[Modora] Sending player data to NUI:', json.encode(playerData))
    end
    
    cb({ success = true, playerData = playerData })
end)

RegisterNUICallback('requestServerConfig', function(data, cb)
    if serverConfig then
        cb({ success = true, config = serverConfig })
    else
        TriggerServerEvent('modora:getServerConfig')
        local waitCount = 0
        while not serverConfig and waitCount < 20 do
            Wait(100)
            waitCount = waitCount + 1
        end
        if serverConfig then
            cb({ success = true, config = serverConfig })
        else
            cb({ success = false, error = 'Failed to load server configuration' })
        end
    end
end)

RegisterNUICallback('submitReport', function(data, cb)
    if not data.category or not data.subject or not data.description then
        cb({ success = false, error = 'Missing required fields' })
        return
    end
    
    local reportData = {
        category = data.category,
        subject = data.subject,
        description = data.description,
        priority = data.priority or 'normal',
        reporter = data.reporter or {},
        targets = data.targets or {},
        attachments = data.attachments or {},
        customFields = data.customFields or {},
        evidenceUrls = data.evidenceUrls or {}
    }
    
    TriggerServerEvent('modora:submitReport', reportData)
    cb({ success = true, processing = true })
end)

-- Screenshot upload (screenshot-basic): NUI requests upload URL, server provides it, client uploads and sends URL back to NUI
local screenshotCb = nil

RegisterNUICallback('requestScreenshotUpload', function(data, cb)
    screenshotCb = cb
    TriggerServerEvent('modora:getScreenshotUploadUrl')
end)

RegisterNetEvent('modora:screenshotUploadUrl')
AddEventHandler('modora:screenshotUploadUrl', function(uploadUrl)
    if not uploadUrl or uploadUrl == '' then
        if screenshotCb then
            screenshotCb({ success = false, error = 'Could not get upload URL' })
            screenshotCb = nil
        end
        return
    end
    local pcallSuccess, err = pcall(function()
        exports['screenshot-basic']:requestScreenshotUpload(uploadUrl, 'file', { encoding = 'png' }, function(responseBody)
            local url = nil
            if responseBody and responseBody ~= '' then
                local ok, data = pcall(json.decode, responseBody)
                if ok and data and data.url then
                    url = data.url
                end
            end
            SendNUIMessage({ action = 'screenshotReady', url = url })
            if screenshotCb then
                screenshotCb({ success = (url ~= nil), url = url })
                screenshotCb = nil
            end
        end)
    end)
    if not pcallSuccess and screenshotCb then
        screenshotCb({ success = false, error = 'screenshot-basic not available or failed' })
        screenshotCb = nil
    end
end)

RegisterNetEvent('modora:reportSubmitted')
AddEventHandler('modora:reportSubmitted', function(payload)
    if type(payload) ~= 'table' then
        payload = { success = false, error = 'Invalid response' }
    end
    if payload.success then
        TriggerEvent('chat:addMessage', {
            color = {0, 255, 0},
            multiline = true,
            args = {'[Modora]', string.format(GetMessage('report_sent'), payload.ticketNumber or payload.ticketId or '')}
        })
        -- Keep NUI open so user sees success screen; they close via Close button
    else
        TriggerEvent('chat:addMessage', {
            color = {255, 0, 0},
            multiline = true,
            args = {'[Modora]', GetMessage('report_failed') .. (payload.error and (': ' .. payload.error) or '')}
        })
    end
    SendNUIMessage({
        action = 'reportSubmitted',
        success = payload.success,
        ticketNumber = payload.ticketNumber,
        ticketId = payload.ticketId,
        ticketUrl = payload.ticketUrl,
        error = payload.error,
        cooldownSeconds = payload.cooldownSeconds
    })
end)

RegisterNetEvent('modora:serverConfig')
AddEventHandler('modora:serverConfig', function(config)
    serverConfig = config
    SendNUIMessage({
        action = 'serverConfig',
        config = config
    })
end)

-- ============================================
-- REPORT COMMAND
-- ============================================

RegisterCommand(Config.ReportCommand, function()
    if not Config.ModoraAPIBase or Config.ModoraAPIBase == '' then
        TriggerEvent('chat:addMessage', {
            color = {255, 165, 0},
            multiline = true,
            args = {'[Modora]', GetMessage('config_failed')}
        })
        return
    end
    
    if isMenuOpen then
        SetNuiFocus(false, false)
        isMenuOpen = false
        return
    end
    
    isMenuOpen = true
    SetNuiFocus(true, true)
    
    -- INIT payload: serverName from convar, optional for NUI branding
    local serverName = GetConvar('sv_projectName', '') or GetConvar('sv_hostname', '') or ''
    if serverName == '' then serverName = 'Server' end
    SendNUIMessage({
        action = 'openReport',
        type = 'INIT',
        serverName = serverName,
        cooldownRemaining = 0,
        playerName = GetPlayerName(PlayerId()),
        version = '1.0'
    })
    
    TriggerEvent('chat:addMessage', {
        color = {0, 255, 0},
        multiline = true,
        args = {'[Modora]', GetMessage('report_opened')}
    })
end, false)

if Config.ReportKeybind and Config.ReportKeybind ~= false then
    RegisterKeyMapping(Config.ReportCommand, 'Open Report Menu', 'keyboard', Config.ReportKeybind)
end

-- ============================================
-- ESC KEY HANDLING
-- ============================================

Citizen.CreateThread(function()
    while true do
        Wait(0)
        if isMenuOpen then
            DisableControlAction(0, 322, true) -- ESC
            DisableControlAction(0, 245, true) -- T
            DisableControlAction(0, 246, true) -- Y
            DisableControlAction(0, 1, true)
            DisableControlAction(0, 2, true)
            DisableControlAction(0, 24, true)
            DisablePlayerFiring(PlayerId(), true)
            
            if IsDisabledControlJustPressed(0, 322) then
                SetNuiFocus(false, false)
                isMenuOpen = false
                SendNUIMessage({
                    action = 'closeReport'
                })
            end
        end
    end
end)
