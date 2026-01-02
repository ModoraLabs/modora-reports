local isMenuOpen = false
local nearbyPlayers = {}
local playerIdentifiersCache = {}

function GetPlayerIdentifiers()
    return {}
end

-- Register event to receive identifiers from server (only once, outside callback)
RegisterNetEvent('modora:playerIdentifiers')
AddEventHandler('modora:playerIdentifiers', function(serverIdentifiers)
    playerIdentifiersCache = serverIdentifiers or {}
end)

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

RegisterNUICallback('closeReport', function(data, cb)
    SetNuiFocus(false, false)
    isMenuOpen = false
    cb('ok')
end)

RegisterNUICallback('requestPlayerData', function(data, cb)
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local nearbyPlayers = GetNearbyPlayers(coords, Config.NearbyRadius or 30.0, Config.MaxNearbyPlayers or 5)
    
    -- Request identifiers from server (server-side only function)
    playerIdentifiersCache = {} -- Clear cache
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

RegisterNUICallback('takeScreenshot', function(data, cb)
    -- Check if screenshot-basic is available
    if GetResourceState('screenshot-basic') ~= 'started' then
        cb({ 
            success = false, 
            error = 'Screenshot functionality is not available. Please use file upload to add screenshots manually.',
            fallback = true
        })
        return
    end
    
    local callbackId = math.random(100000, 999999)
    
    -- Request screenshot from server
    TriggerServerEvent('modora:getScreenshotUploadUrl', callbackId)
    
    -- The screenshot will be handled by server and sent back via event
    cb({ success = true, processing = true, callbackId = callbackId })
end)

-- Store active screenshot callbacks (maps callbackId to true)
local activeScreenshotCallbacks = {}

-- Register NUI callback for screenshot-basic
-- screenshot-basic expects this callback to exist and will call it with screenshot data
-- This MUST be registered BEFORE calling requestScreenshot
RegisterNUICallback('screenshot_created', function(data, cb)
    if Config.Debug then
        print('[Modora] screenshot_created NUI callback received from screenshot-basic')
        print('[Modora] Data type:', type(data))
        print('[Modora] Data:', json.encode(data))
    end
    
    -- Find the oldest active callback (FIFO - first in, first out)
    local callbackId = nil
    for id, _ in pairs(activeScreenshotCallbacks) do
        callbackId = id
        break
    end
    
    if callbackId then
        -- Remove from active callbacks
        activeScreenshotCallbacks[callbackId] = nil
        
        -- screenshot-basic sends data in various formats
        local url = nil
        if data and type(data) == 'table' then
            url = data.url or data.uploadUrl or data.link or data.data
            if type(url) == 'table' then
                url = url.url or url.uploadUrl or url.link
            end
        elseif data and type(data) == 'string' then
            url = data
        end
        
        if url and type(url) == 'string' and url ~= '' then
            -- Screenshot successful
            if Config.Debug then
                print('[Modora] Screenshot URL received:', url)
                print('[Modora] Sending to server for callbackId:', callbackId)
            end
            TriggerServerEvent('modora:screenshotData', callbackId, url, nil)
        else
            -- Screenshot failed or no URL
            local errorMsg = 'No URL returned from screenshot-basic'
            if data and type(data) == 'table' then
                errorMsg = data.error or data.message or errorMsg
            end
            if Config.Debug then
                print('[Modora] Screenshot failed:', errorMsg)
            end
            TriggerServerEvent('modora:screenshotData', callbackId, nil, errorMsg)
        end
    else
        if Config.Debug then
            print('[Modora] Warning: screenshot_created received but no active callback found')
        end
    end
    
    -- Always call cb to acknowledge the NUI callback
    cb('ok')
end)

-- Register NUI callback to receive screenshot result from HTML page (fallback)
-- The HTML page will receive the screenshot_created message from screenshot-basic
-- and forward it to this callback if the direct callback doesn't work
RegisterNUICallback('screenshotResult', function(data, cb)
    if Config.Debug then
        print('[Modora] screenshotResult NUI callback received from HTML page')
        print('[Modora] Data:', json.encode(data))
    end
    
    -- Find the oldest active callback (FIFO - first in, first out)
    local callbackId = nil
    for id, _ in pairs(activeScreenshotCallbacks) do
        callbackId = id
        break
    end
    
    if callbackId then
        -- Remove from active callbacks
        activeScreenshotCallbacks[callbackId] = nil
        
        if data.success and data.url then
            -- Screenshot successful
            if Config.Debug then
                print('[Modora] Screenshot URL received:', data.url)
                print('[Modora] Sending to server for callbackId:', callbackId)
            end
            TriggerServerEvent('modora:screenshotData', callbackId, data.url, nil)
        else
            -- Screenshot failed
            local errorMsg = data.error or 'No URL returned from screenshot-basic'
            if Config.Debug then
                print('[Modora] Screenshot failed:', errorMsg)
            end
            TriggerServerEvent('modora:screenshotData', callbackId, nil, errorMsg)
        end
    else
        if Config.Debug then
            print('[Modora] Warning: screenshotResult received but no active callback found')
        end
    end
    
    -- Always call cb to acknowledge the NUI callback
    cb('ok')
end)

-- Handle screenshot capture request from server
RegisterNetEvent('modora:takeScreenshot')
AddEventHandler('modora:takeScreenshot', function(callbackId)
    if GetResourceState('screenshot-basic') ~= 'started' then
        TriggerServerEvent('modora:screenshotData', callbackId, nil, 'screenshot-basic resource is not started')
        return
    end
    
    -- Take screenshot using screenshot-basic
    if Config.Debug then
        print('[Modora] Taking screenshot with callbackId:', callbackId)
    end
    
    -- Store callback ID BEFORE calling requestScreenshot
    -- screenshot-basic will send a message to the NUI context when done
    activeScreenshotCallbacks[callbackId] = true
    
    -- Call requestScreenshot with error handling
    -- screenshot-basic expects the NUI callback 'screenshot_created' to be registered
    -- It will call this callback when the screenshot is ready
    local success, errorMsg = pcall(function()
        -- screenshot-basic expects requestScreenshot to be called without parameters
        -- It will use the registered NUI callback 'screenshot_created' to return the result
        exports['screenshot-basic'].requestScreenshot()
        
        if Config.Debug then
            print('[Modora] requestScreenshot called, waiting for screenshot_created NUI callback...')
        end
    end)
    
    if not success then
        activeScreenshotCallbacks[callbackId] = nil
        local errorMessage = 'Screenshot functionality is not available. Please use file upload to add screenshots manually.'
        if Config.Debug then
            print('[Modora] Error calling requestScreenshot:', errorMsg)
        end
        TriggerServerEvent('modora:screenshotData', callbackId, nil, errorMessage)
    else
        -- Set a timeout in case screenshot-basic doesn't respond
        -- If no response after 10 seconds, assume it failed
        Citizen.SetTimeout(10000, function()
            if activeScreenshotCallbacks[callbackId] then
                activeScreenshotCallbacks[callbackId] = nil
                if Config.Debug then
                    print('[Modora] Screenshot timeout - no response from screenshot-basic')
                end
                TriggerServerEvent('modora:screenshotData', callbackId, nil, 'Screenshot timeout. Please use file upload to add screenshots manually.')
            end
        end)
    end
end)


-- NUI Callback for report submission result
RegisterNUICallback('reportSubmitted', function(data, cb)
    if data.success then
        local ticketNumber = data.ticketNumber or 'N/A'
        TriggerEvent('chat:addMessage', {
            color = {0, 255, 0},
            multiline = true,
            args = {'[Modora]', string.format(GetMessage('report_sent'), ticketNumber)}
        })
        
        -- Close NUI focus immediately
        SetNuiFocus(false, false)
        isMenuOpen = false
    else
        TriggerEvent('chat:addMessage', {
            color = {255, 0, 0},
            multiline = true,
            args = {'[Modora]', GetMessage('report_failed') .. (data.error and (': ' .. data.error) or '')}
        })
    end
    
    cb('ok')
end)

RegisterNetEvent('modora:screenshotUploaded')
AddEventHandler('modora:screenshotUploaded', function(callbackId, fileId, url, error)
    if Config.Debug then
        print('[Modora] Screenshot uploaded event received:', json.encode({
            callbackId = callbackId,
            fileId = fileId,
            url = url,
            error = error
        }))
    end
    
    if url then
        -- Send screenshot URL to NUI
        SendNUIMessage({
            action = 'screenshotReady',
            fileId = fileId,
            url = url
        })
        if Config.Debug then
            print('[Modora] Sent screenshot URL to NUI:', url)
        end
    else
        SendNUIMessage({
            action = 'screenshotError',
            error = error or 'Failed to upload screenshot'
        })
        if Config.Debug then
            print('[Modora] Sent screenshot error to NUI:', error or 'Failed to upload screenshot')
        end
    end
end)

RegisterCommand(Config.ReportCommand, function()
    if not Config.ReportFormURL or Config.ReportFormURL == '' or Config.ReportFormURL:find('{') then
        TriggerEvent('chat:addMessage', {
            color = {255, 165, 0},
            multiline = true,
            args = {'[Modora]', GetMessage('config_failed') .. ' URL: ' .. (Config.ReportFormURL or 'NOT SET')}
        })
        if Config.Debug then
            print('[Modora] ERROR: ReportFormURL not configured correctly. Current value: ' .. (Config.ReportFormURL or 'NOT SET'))
            print('[Modora] Please update config.lua with your actual Report Form URL from the dashboard.')
        end
        return
    end
    
    if isMenuOpen then
        SetNuiFocus(false, false)
        isMenuOpen = false
        return
    end
    
    if Config.Debug then
        print('[Modora] Opening report form with URL: ' .. Config.ReportFormURL)
    end
    
    isMenuOpen = true
    -- SetNuiFocus with keepInput = true so players can type in the form without opening chat
    SetNuiFocus(true, true)
    
    -- Open iframe with report form URL
    SendNUIMessage({
        action = 'openReport',
        reportFormUrl = Config.ReportFormURL
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

-- ESC key to close menu and prevent chat from opening
Citizen.CreateThread(function()
    while true do
        Wait(0)
        if isMenuOpen then
            -- Disable ESC key
            DisableControlAction(0, 322, true) -- ESC
            -- Disable chat keys (T and Y)
            DisableControlAction(0, 245, true) -- T (chat)
            DisableControlAction(0, 246, true) -- Y (chat alternative)
            -- Disable other controls that might interfere
            DisableControlAction(0, 1, true) -- LookLeftRight
            DisableControlAction(0, 2, true) -- LookUpDown
            DisableControlAction(0, 24, true) -- Attack
            DisablePlayerFiring(PlayerId(), true) -- Disable weapon firing
            
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
