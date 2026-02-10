local RESOURCE_VERSION = GetResourceMetadata(GetCurrentResourceName(), 'version', 0) or '0.0.0'
local GITHUB_REPO = 'ModoraLabs/modora-admin'

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then
        return
    end

    print('[Modora] Resource version (fxmanifest): ' .. RESOURCE_VERSION)
end)


Citizen.CreateThread(function()
    Citizen.Wait(5000) 

    if Config.Debug then
        print('[Modora] Checking for updates from GitHub...')
    end

    PerformHttpRequest('https://api.github.com/repos/' .. GITHUB_REPO .. '/releases/latest', function(statusCode, response, headers)
        local statusNum = tonumber(statusCode) or 0
        if statusNum == 200 and response then
            local success, data = pcall(json.decode, response)
            if success and data and data.tag_name then
                local latestVersion = string.gsub(data.tag_name, '^v', '')
                local currentVersion = RESOURCE_VERSION

                if Config.Debug then
                    print('[Modora] Current version: ' .. currentVersion)
                    print('[Modora] Latest version: ' .. latestVersion)
                end

                if latestVersion ~= currentVersion then
                    print('^3[Modora] ⚠️ UPDATE AVAILABLE!^7')
                    print('^3[Modora] Current version: ^7' .. currentVersion)
                    print('^3[Modora] Latest version: ^7' .. latestVersion)
                    print('^3[Modora] Download: https://github.com/' .. GITHUB_REPO .. '/releases/latest^7')
                else
                    if Config.Debug then
                        print('[Modora] ✅ Resource is up to date!')
                    end
                end
            end
        end
    end, 'GET', '', {
        ['User-Agent'] = 'Modora-FiveM-Resource',
        ['Accept'] = 'application/vnd.github.v3+json'
    })
end)

-- ============================================
-- API AUTHENTICATION
-- ============================================

-- Returns API base URL, optional host header and bearer token from config.
local function getEffectiveAPIConfig()
    local base = (Config.ModoraAPIBase or ''):gsub('/+$', ''):match('^%s*(.-)%s*$')
    local host = (Config.ModoraHostHeader or ''):match('^%s*(.-)%s*$')
    local token = (Config.APIToken or ''):match('^%s*(.-)%s*$')
    return base, host, token
end

-- Build request headers with bearer token.
local function buildAuthHeaders()
    local _, hostHeader, token = getEffectiveAPIConfig()
    token = token or ''
    return {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. token,
    }
end

-- Player identifiers (discord, steam, etc.) for the report payload.
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

RegisterNetEvent('modora:getPlayerIdentifiers')
AddEventHandler('modora:getPlayerIdentifiers', function()
    local source = source
    local identifiers = GetPlayerIdentifiersTable(source)
    TriggerClientEvent('modora:playerIdentifiers', source, identifiers)
end)

-- API: config fetch and report submit with retries.

-- HTTP request with optional retries.
local function performHttpRequestWithRetry(url, method, body, headers, callback, maxRetries)
    maxRetries = tonumber(maxRetries) or 3
    local retryCount = 0

    local function attemptRequest()
        if Config.Debug then
            if retryCount > 0 then
                print('[Modora] Retry attempt ' .. tostring(retryCount) .. '/' .. tostring(maxRetries))
            else
                print('[Modora] Making HTTP request to: ' .. url)
            end
        end

        PerformHttpRequest(url, function(statusCode, response, responseHeaders)
            local statusNum = tonumber(statusCode) or 0

            if Config.Debug then
                print('[Modora] HTTP response: statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')
                if response and string.len(response) > 0 then
                    print('[Modora] Response preview: ' .. string.sub(response, 1, 200))
                end
            end

            if statusNum == 0 and retryCount < maxRetries then
                retryCount = retryCount + 1
                if Config.Debug then
                    print('[Modora] Connection failed, waiting ' .. tostring(1000 * retryCount) .. 'ms before retry...')
                end
                Citizen.Wait(1000 * retryCount) -- Exponential backoff
                attemptRequest()
            else
                if callback then
                    callback(statusCode, response, responseHeaders, maxRetries, retryCount)
                end
            end
        end, method, body or '', headers)
    end

    attemptRequest()
end

-- Fetches server config (categories, report form, etc.) from the API.
local function getServerConfig(callback)
    local baseUrl, _, token = getEffectiveAPIConfig()
    if not baseUrl or baseUrl == '' then
        if callback then callback(false, 'API base URL not configured') end
        return
    end
    if not token or token == '' then
        if callback then callback(false, 'API token not configured') end
        return
    end
    if not baseUrl:match('^https?://') then
        if callback then callback(false, 'API base URL must start with http:// or https://') end
        return
    end
    local url = baseUrl .. '/config'
    local headers = buildAuthHeaders()
    if Config.Debug then
        print('[Modora] Fetching server config from: ' .. url)
        print('[Modora] API Token length: ' .. tostring(string.len(token or '')))
        print('[Modora] API Token preview: ' .. string.sub(token or '', 1, 10) .. '...')
    end

    performHttpRequestWithRetry(url, 'GET', '', headers, function(statusCode, response, responseHeaders, maxRetries, retryCount)
        local statusNum = tonumber(statusCode) or 0
        maxRetries = maxRetries or 3
        retryCount = retryCount or 0

        if Config.Debug then
            print('[Modora] Config request response: statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')
            print('[Modora] Retries attempted: ' .. tostring(retryCount) .. '/' .. tostring(maxRetries))
        end

        if statusNum == 0 then
            local errorMsg = 'Connection failed after retries.'
            if callback then callback(false, errorMsg) end
        elseif statusNum == 200 and response then
            local success, data = pcall(json.decode, response)
            if success and data then
                if callback then callback(true, data) end
            else
                if callback then callback(false, 'Failed to parse config response') end
            end
        elseif statusNum == 401 then
            if callback then callback(false, 'Authentication failed. Check your API token.') end
        else
            local errorMsg = 'HTTP ' .. tostring(statusCode)
            if response then errorMsg = errorMsg .. ': ' .. response end
            if callback then callback(false, errorMsg) end
        end
    end)
end

-- Submits report payload to the API and returns result via callback.
local function submitReport(reportData, callback)
    local baseUrl, _, token = getEffectiveAPIConfig()
    if not baseUrl or baseUrl == '' then
        if callback then callback(false, nil, 'API base URL not configured') end
        return
    end
    if not token or token == '' then
        if callback then callback(false, nil, 'API token not configured') end
        return
    end
    baseUrl = baseUrl:gsub('/+$', ''):match('^%s*(.-)%s*$')

    if not baseUrl:match('^https?://') then
        if callback then callback(false, nil, 'API base URL must start with http:// or https://') end
        return
    end

    local url = baseUrl .. '/reports'
    local body = json.encode(reportData)
    local headers = buildAuthHeaders()

    if Config.Debug then
        print('[Modora] Submitting report to: ' .. url)
        print('[Modora] API Token length: ' .. tostring(string.len(Config.APIToken or '')))
        print('[Modora] API Token preview: ' .. string.sub(Config.APIToken or '', 1, 10) .. '...')
        print('[Modora] Report data: ' .. body)
    end

    performHttpRequestWithRetry(url, 'POST', body, headers, function(statusCode, response, responseHeaders, maxRetries, retryCount)
        local statusNum = tonumber(statusCode) or 0
        maxRetries = maxRetries or 3
        retryCount = retryCount or 0

        if Config.Debug then
            print('[Modora] Report submission response: statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')
            print('[Modora] Retries attempted: ' .. tostring(retryCount) .. '/' .. tostring(maxRetries))
        end

        if statusNum == 0 then
            local errorMsg = 'Connection failed after ' .. tostring(retryCount) .. ' retry attempts.'
            if callback then callback(false, nil, errorMsg, nil) end
        elseif statusNum == 201 or statusNum == 200 then
            local success, data = pcall(json.decode, response)
            if success and data then
                if callback then callback(true, data, nil, nil) end
            else
                if callback then callback(false, nil, 'Failed to parse response', nil) end
            end
        elseif statusNum == 401 then
            if callback then callback(false, nil, 'Authentication failed. Check your API token.', nil) end
        elseif statusNum == 429 then
            local success, data = pcall(json.decode, response)
            local cooldownSec = (success and data and data.remaining_seconds) and tonumber(data.remaining_seconds) or (success and data and data.cooldown_seconds) and tonumber(data.cooldown_seconds) or nil
            if success and data and data.remaining_seconds then
                if callback then callback(false, nil, 'Cooldown active. Please wait ' .. data.remaining_seconds .. ' seconds.', cooldownSec) end
            else
                if callback then callback(false, nil, 'Rate limit exceeded. Please wait before submitting another report.', cooldownSec) end
            end
        else
            local errorMsg = 'HTTP ' .. tostring(statusCode)
            if response and response ~= '' then
                local success, data = pcall(json.decode, response)
                if success and data then
                    if data.message and data.message ~= '' then
                        errorMsg = data.message
                    elseif data.error and data.error ~= '' then
                        errorMsg = data.error .. (data.message and (': ' .. data.message) or '')
                    end
                else
                    errorMsg = errorMsg .. ': ' .. string.sub(response, 1, 200)
                end
            end
            if callback then callback(false, nil, errorMsg, nil) end
        end
    end)
end

-- ============================================
-- REPORT SUBMISSION
-- ============================================

RegisterNetEvent('modora:submitReport')
AddEventHandler('modora:submitReport', function(reportData)
    local source = source

    if not reportData.category or not reportData.subject or not reportData.description then
        TriggerClientEvent('modora:reportSubmitted', source, {
            success = false,
            error = 'Missing required fields',
            cooldownSeconds = nil
        })
        return
    end

    local identifiers = GetPlayerIdentifiersTable(source)
    reportData.reporter = reportData.reporter or {}
    reportData.reporter.identifiers = identifiers
    reportData.reporter.fivemId = source
    reportData.reporter.name = GetPlayerName(source)

    reportData.meta = reportData.meta or {}
    if reportData.evidenceUrls and type(reportData.evidenceUrls) == 'table' then
        reportData.meta.evidence_urls = reportData.evidenceUrls
    end

    submitReport(reportData, function(success, data, err, cooldownSeconds)
        if success and data then
            TriggerClientEvent('modora:reportSubmitted', source, {
                success = true,
                ticketNumber = data.ticketNumber,
                ticketId = data.ticketId,
                ticketUrl = data.ticketUrl,
                error = nil,
                cooldownSeconds = nil
            })
        else
            TriggerClientEvent('modora:reportSubmitted', source, {
                success = false,
                ticketNumber = nil,
                ticketId = nil,
                ticketUrl = nil,
                error = err or 'Unknown error',
                cooldownSeconds = cooldownSeconds
            })
        end
    end)
end)

-- ============================================
-- SCREENSHOT UPLOAD
-- ============================================

RegisterNetEvent('modora:getScreenshotUploadUrl')
AddEventHandler('modora:getScreenshotUploadUrl', function()
    local source = source
    local baseUrl, _, token = getEffectiveAPIConfig()
    baseUrl = (baseUrl or ''):gsub('/+$', ''):match('^%s*(.-)%s*$')
    if baseUrl == '' or (token or '') == '' then
        TriggerClientEvent('modora:screenshotUploadUrl', source, '')
        return
    end
    local url = baseUrl .. '/upload-token'
    local headers = buildAuthHeaders()
    performHttpRequestWithRetry(url, 'POST', '{}', headers, function(statusCode, response)
        local uploadUrl = ''
        local statusNum = tonumber(statusCode) or 0
        if statusNum == 200 and response and response ~= '' then
            local ok, data = pcall(json.decode, response)
            if ok and data and data.upload_url then
                uploadUrl = tostring(data.upload_url)
            end
        end
        Citizen.CreateThread(function()
            TriggerClientEvent('modora:screenshotUploadUrl', source, uploadUrl)
        end)
    end, 2)
end)

-- ============================================
-- API CONNECTION CHECK
-- ============================================

local function testAPIConnection()
    local baseUrl, hostHeader = getEffectiveAPIConfig()
    if not baseUrl or baseUrl == '' then
        return
    end
    baseUrl = baseUrl:gsub('/+$', ''):match('^%s*(.-)%s*$')
    if not baseUrl:match('^https?://') then
        return
    end

    local testUrl = baseUrl .. '/test'

    print('[Modora] Testing API connection to: ' .. testUrl)

    local protocol = testUrl:match('^(https?)://')

    if Config.Debug then
        print('[Modora] Testing API connection...')
        print('[Modora] URL: ' .. testUrl)
        print('[Modora] Protocol: ' .. (protocol or 'unknown'))
    end

    local testHeaders = {
        ['Accept'] = 'application/json',
    }
    -- Don't manually set Host header 
    -- if hostHeader and hostHeader ~= '' then
    --     testHeaders['Host'] = hostHeader
    -- end

    PerformHttpRequest(testUrl, function(statusCode, response, responseHeaders)
        local statusNum = tonumber(statusCode) or 0

        if statusNum == 0 then
            print('^1[Modora] API connection check: could not reach ' .. testUrl .. '^7')
        elseif statusNum == 200 then
            print('^2[Modora] ✅ API connection test successful!^7')
            if Config.Debug and response then
                local success, data = pcall(json.decode, response)
                if success and data then
                    print('[Modora] API Response: ' .. (data.message or 'OK'))
                    if data.protocol then
                        print('[Modora] Server protocol: ' .. data.protocol)
                    end
                end
            end
        else
            print('^3[Modora] API connection check: HTTP ' .. tostring(statusCode) .. '^7')
        end
    end, 'GET', '', testHeaders)
end

-- ============================================
-- HTTP CONNECTIVITY TEST (console command)
-- ============================================

local function testHttpEndpoint(url, label)
    local headers = {
        ['Accept'] = '*/*',
    }

    print('[Modora] HTTP debug: ' .. label .. ' -> ' .. url)

    PerformHttpRequest(url, function(statusCode, response, responseHeaders)
        local statusNum = tonumber(statusCode) or 0
        print('[Modora] HTTP debug result (' .. label .. '): statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')

        if response and response ~= '' then
            print('[Modora] HTTP debug response preview (' .. label .. '): ' .. string.sub(response, 1, 200))
        end

        if responseHeaders and type(responseHeaders) == 'table' then
            local location = responseHeaders['Location'] or responseHeaders['location']
            if location and location ~= '' then
                print('[Modora] HTTP debug redirect (' .. label .. '): Location=' .. location)
            end
        end
    end, 'GET', '', headers)
end

RegisterCommand('modora_debug_http', function(source)
    if source ~= 0 then
        print('[Modora] HTTP debug can only be run from server console.')
        return
    end

    testHttpEndpoint('http://example.com', 'example-http')
    testHttpEndpoint('http://api.modoralabs.com/test', 'modora-http-test')
    testHttpEndpoint('https://api.modoralabs.com/test', 'modora-https-test')

    local ip = '157.180.103.21'
    local function testIpEndpoint(url, label, hostHeader)
        local headers = {
            ['Accept'] = '*/*',
        }
        -- Don't manually set Host header
        -- if hostHeader and hostHeader ~= '' then
        --     headers['Host'] = hostHeader
        -- end

        print('[Modora] HTTP debug: ' .. label .. ' -> ' .. url .. (hostHeader and (' (Host=' .. hostHeader .. ')') or ''))

        PerformHttpRequest(url, function(statusCode, response, responseHeaders)
            local statusNum = tonumber(statusCode) or 0
            print('[Modora] HTTP debug result (' .. label .. '): statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')

            if response and response ~= '' then
                print('[Modora] HTTP debug response preview (' .. label .. '): ' .. string.sub(response, 1, 200))
            end

            if responseHeaders and type(responseHeaders) == 'table' then
                local location = responseHeaders['Location'] or responseHeaders['location']
                if location and location ~= '' then
                    print('[Modora] HTTP debug redirect (' .. label .. '): Location=' .. location)
                end
            end
        end, 'GET', '', headers)
    end

    testIpEndpoint('http://' .. ip .. '/test', 'modora-ip-http-test', 'api.modoralabs.com')
    testIpEndpoint('https://' .. ip .. '/test', 'modora-ip-https-test', 'api.modoralabs.com')
end, false)

-- ============================================
-- CONFIGURATION VALIDATION
-- ============================================

Citizen.CreateThread(function()
    Citizen.Wait(2000)

    local baseUrl, _, token = getEffectiveAPIConfig()
    local configValid = (baseUrl and baseUrl ~= '' and token and token ~= '')

    if not configValid then
        print('^1[Modora] Set Config.ModoraAPIBase and Config.APIToken in config.lua (from Dashboard → FiveM → your server).^7')
    else
        print('^2[Modora] Configuration OK^7')
        Citizen.Wait(1000)
        testAPIConnection()
    end
end)
