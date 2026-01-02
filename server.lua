local screenshotCallbacks = {}
local RESOURCE_VERSION = '1.0.0'
local GITHUB_REPO = 'ModoraLabs/modora-reports'

-- ============================================
-- VERSION CHECK
-- ============================================

-- Check for updates from GitHub
Citizen.CreateThread(function()
    Citizen.Wait(5000) -- Wait 5 seconds after resource start
    
    if Config.Debug then
        print('[Modora] Checking for updates from GitHub...')
    end
    
    PerformHttpRequest('https://api.github.com/repos/' .. GITHUB_REPO .. '/releases/latest', function(statusCode, response, headers)
        if statusCode == 200 and response then
            local success, data = pcall(json.decode, response)
            if success and data and data.tag_name then
                local latestVersion = string.gsub(data.tag_name, '^v', '') -- Remove 'v' prefix if present
                local currentVersion = RESOURCE_VERSION
                
                if Config.Debug then
                    print('[Modora] Current version: ' .. currentVersion)
                    print('[Modora] Latest version: ' .. latestVersion)
                end
                
                -- Simple version comparison (assumes semantic versioning)
                if latestVersion ~= currentVersion then
                    print('^3[Modora] ⚠️ UPDATE AVAILABLE!^7')
                    print('^3[Modora] Current version: ^7' .. currentVersion)
                    print('^3[Modora] Latest version: ^7' .. latestVersion)
                    print('^3[Modora] Download: https://github.com/' .. GITHUB_REPO .. '/releases/latest^7')
                    if data.body and string.len(data.body) > 0 then
                        print('^3[Modora] Release notes:^7')
                        -- Print first few lines of release notes
                        local lines = {}
                        for line in string.gmatch(data.body, '[^\r\n]+') do
                            if string.len(line) > 0 then
                                table.insert(lines, line)
                                if #lines >= 5 then break end
                            end
                        end
                        for _, line in ipairs(lines) do
                            print('^3[Modora]   ' .. line .. '^7')
                        end
                    end
                else
                    if Config.Debug then
                        print('[Modora] ✅ Resource is up to date!')
                    end
                end
            else
                if Config.Debug then
                    print('[Modora] ⚠️ Could not parse GitHub response')
                end
            end
        else
            if Config.Debug then
                print('[Modora] ⚠️ Could not check for updates (HTTP ' .. tostring(statusCode) .. ')')
            end
        end
    end, 'GET', '', {
        ['User-Agent'] = 'Modora-FiveM-Resource',
        ['Accept'] = 'application/vnd.github.v3+json'
    })
end)

-- ============================================
-- PLAYER IDENTIFIERS
-- ============================================

-- Function to get player identifiers as a key-value table
function GetPlayerIdentifiersTable(source)
    local identifiers = {}
    for i = 0, GetNumPlayerIdentifiers(source) - 1 do
        local identifier = GetPlayerIdentifier(source, i)
        if identifier then
            local prefix, value = string.match(identifier, '^([^:]+):(.+)$')
            if prefix and value then
                identifiers[prefix] = value
            end
        end
    end
    return identifiers
end

-- Event handler for client requesting identifiers
RegisterNetEvent('modora:getPlayerIdentifiers')
AddEventHandler('modora:getPlayerIdentifiers', function()
    local source = source
    local identifiers = GetPlayerIdentifiersTable(source)
    TriggerClientEvent('modora:playerIdentifiers', source, identifiers)
end)

-- ============================================
-- SCREENSHOT FUNCTIONALITY
-- ============================================

RegisterNetEvent('modora:getScreenshotUploadUrl')
AddEventHandler('modora:getScreenshotUploadUrl', function(callbackId)
    local source = source
    
    if GetResourceState('screenshot-basic') ~= 'started' then
        TriggerClientEvent('modora:screenshotUploaded', source, callbackId, nil, nil, 'screenshot-basic resource is not started. Please ensure screenshot-basic is installed and started.')
        return
    end
    
    screenshotCallbacks[callbackId] = {
        source = source,
        timestamp = os.time()
    }
    
    -- Request screenshot from client
    TriggerClientEvent('modora:takeScreenshot', source, callbackId)
end)

-- Handle screenshot data from client
RegisterNetEvent('modora:screenshotData')
AddEventHandler('modora:screenshotData', function(callbackId, url, error)
    local source = source
    
    if screenshotCallbacks[callbackId] then
        if url then
            -- Screenshot URL received, send to client
            TriggerClientEvent('modora:screenshotUploaded', source, callbackId, nil, url, nil)
        else
            -- Screenshot failed
            TriggerClientEvent('modora:screenshotUploaded', source, callbackId, nil, nil, error or 'Failed to take screenshot')
        end
        screenshotCallbacks[callbackId] = nil
    end
end)

-- Cleanup old callbacks
Citizen.CreateThread(function()
    while true do
        Citizen.Wait(60000)
        local currentTime = os.time()
        
        for callbackId, callback in pairs(screenshotCallbacks) do
            if currentTime - callback.timestamp > 300 then
                screenshotCallbacks[callbackId] = nil
            end
        end
    end
end)
