local RESOURCE_VERSION = GetResourceMetadata(GetCurrentResourceName(), 'version', 0) or '0.0.0'
local GITHUB_REPO = 'ModoraLabs/modora-admin'

AddEventHandler('onResourceStart', function(resourceName)
    if resourceName ~= GetCurrentResourceName() then
        return
    end

    print('[Modora] Resource version (fxmanifest): ' .. RESOURCE_VERSION)
end)

-- ============================================
-- VERSION CHECK
-- ============================================

Citizen.CreateThread(function()
    Citizen.Wait(5000) -- Wait 5 seconds after resource start
    
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

-- Returns effective base URL, host header and token (prod or alpha).
local function getEffectiveAPIConfig()
    local useAlpha = (Config.UseAlphaEnvironment == true) and
        (Config.ModoraAPIBaseAlpha or '') ~= '' and
        (Config.APITokenAlpha or '') ~= ''
    if useAlpha then
        local base = (Config.ModoraAPIBaseAlpha or ''):gsub('/+$', ''):match('^%s*(.-)%s*$')
        local host = (Config.ModoraHostHeaderAlpha or ''):match('^%s*(.-)%s*$')
        local token = (Config.APITokenAlpha or ''):match('^%s*(.-)%s*$')
        return base, host, token, true
    end
    local base = (Config.ModoraAPIBase or ''):gsub('/+$', ''):match('^%s*(.-)%s*$')
    local host = (Config.ModoraHostHeader or ''):match('^%s*(.-)%s*$')
    local token = (Config.APIToken or ''):match('^%s*(.-)%s*$')
    return base, host, token, false
end

-- Build authentication headers (uses effective config: prod or alpha)
local function buildAuthHeaders()
    local _, hostHeader, token = getEffectiveAPIConfig()
    token = token or ''
    local headers = {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. token,
        ['User-Agent'] = 'Modora-FiveM-Resource/' .. RESOURCE_VERSION,
        ['Accept'] = 'application/json',
        ['Connection'] = 'close', -- Force HTTP/1.1 connection close
        ['Accept-Encoding'] = 'identity', -- Disable compression for FiveM compatibility
        ['HTTP-Version'] = '1.1' -- Explicitly request HTTP/1.1 (informational header)
    }
    if hostHeader and hostHeader ~= '' then
        headers['Host'] = hostHeader
    end
    return headers
end

-- ============================================
-- PLAYER IDENTIFIERS
-- ============================================

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

-- ============================================
-- API COMMUNICATION
-- ============================================

-- Retry mechanism for HTTP requests
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
            -- Convert statusCode to number for comparison
            local statusNum = tonumber(statusCode) or 0
            
            if Config.Debug then
                print('[Modora] HTTP response: statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')
                if response and string.len(response) > 0 then
                    print('[Modora] Response preview: ' .. string.sub(response, 1, 200))
                end
            end
            
            if statusNum == 0 and retryCount < maxRetries then
                -- Retry on connection failure
                retryCount = retryCount + 1
                if Config.Debug then
                    print('[Modora] Connection failed, waiting ' .. tostring(1000 * retryCount) .. 'ms before retry...')
                end
                Citizen.Wait(1000 * retryCount) -- Exponential backoff
                attemptRequest()
            else
                -- Success or max retries reached
                -- Pass maxRetries and retryCount to callback for error messages
                if callback then
                    callback(statusCode, response, responseHeaders, maxRetries, retryCount)
                end
            end
        end, method, body or '', headers)
    end
    
    attemptRequest()
end

-- Get server configuration from API
local function getServerConfig(callback)
    local baseUrl, _, token, isAlpha = getEffectiveAPIConfig()
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
    if baseUrl:match('^http://') and Config.Debug then
        print('[Modora] ⚠️ WARNING: Using HTTP (not HTTPS). This is less secure but avoids SSL/TLS certificate issues.')
    end
    if isAlpha and Config.Debug then
        print('[Modora] Using ALPHA environment: ' .. baseUrl)
    end
    local url = baseUrl .. '/config'
    local headers = buildAuthHeaders()
    if Config.Debug then
        print('[Modora] Fetching server config from: ' .. url)
        print('[Modora] API Token length: ' .. tostring(string.len(token or '')))
        print('[Modora] API Token preview: ' .. string.sub(token or '', 1, 10) .. '...')
    end
    
    performHttpRequestWithRetry(url, 'GET', '', headers, function(statusCode, response, responseHeaders, maxRetries, retryCount)
        -- Convert statusCode to number for comparison
        local statusNum = tonumber(statusCode) or 0
        
        -- Ensure maxRetries and retryCount have default values
        maxRetries = maxRetries or 3
        retryCount = retryCount or 0
        
        if Config.Debug then
            print('[Modora] Config request response: statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')
            print('[Modora] Retries attempted: ' .. tostring(retryCount) .. '/' .. tostring(maxRetries))
        end
        
        if statusNum == 0 then
            -- HTTP 0 usually means connection failed (even after retries)
            local errorMsg = 'Connection failed after retries. This is likely a FiveM HTTP client SSL/TLS issue.'
            if Config.Debug then
                print('[Modora] ERROR: ' .. errorMsg)
                print('[Modora] URL: ' .. url)
                print('[Modora] Try: Update FiveM server and CA certificates')
            end
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
            if response then
                errorMsg = errorMsg .. ': ' .. response
            end
            if Config.Debug then
                print('[Modora] Config request failed: ' .. errorMsg)
            end
            if callback then callback(false, errorMsg) end
        end
    end)
end

-- Submit report to API
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
    
    -- Validate URL format (allow both http:// and https://)
    if not baseUrl:match('^https?://') then
        if callback then callback(false, nil, 'API base URL must start with http:// or https://') end
        return
    end
    
    -- Warn if using HTTP (less secure)
    if baseUrl:match('^http://') and Config.Debug then
        print('[Modora] ⚠️ WARNING: Using HTTP (not HTTPS). This is less secure but avoids SSL/TLS certificate issues.')
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
        -- Convert statusCode to number for comparison
        local statusNum = tonumber(statusCode) or 0
        
        -- Ensure maxRetries and retryCount have default values
        maxRetries = maxRetries or 3
        retryCount = retryCount or 0
        
        if Config.Debug then
            print('[Modora] Report submission response: statusCode=' .. tostring(statusCode) .. ' (num=' .. tostring(statusNum) .. ')')
            print('[Modora] Retries attempted: ' .. tostring(retryCount) .. '/' .. tostring(maxRetries))
        end
        
        if statusNum == 0 then
            -- HTTP 0 usually means connection failed (even after retries)
            local protocol = url:match('^(https?)://')
            local errorMsg = 'Connection failed after ' .. tostring(retryCount) .. ' retry attempts (max: ' .. tostring(maxRetries) .. ').'
            
            if Config.Debug then
                print('[Modora] ERROR: ' .. errorMsg)
                print('[Modora] URL: ' .. url)
                print('[Modora] Protocol: ' .. (protocol or 'unknown'))
                print('[Modora] Has token: ' .. tostring(Config.APIToken ~= '' and Config.APIToken ~= nil))
                print('[Modora] Method: POST')
                print('[Modora] Headers: ' .. json.encode(headers))
                
                if protocol == 'http' then
                    print('[Modora] Using HTTP - no SSL/TLS needed')
                    print('[Modora]^7')
                    print('[Modora] Possible causes:^7')
                    print('[Modora]   1. Cloudflare redirecting HTTP to HTTPS (307 error)')
                    print('[Modora]      → Configure Cloudflare: SSL/TLS mode = "Flexible" for api.modora.xyz')
                    print('[Modora]   2. Server cannot reach api.modora.xyz (firewall/network)')
                    print('[Modora]      → Test: curl -I --http1.1 ' .. url)
                    print('[Modora]   3. DNS resolution failed')
                    print('[Modora]      → Test: nslookup api.modora.xyz')
                    print('[Modora]   4. Server timeout')
                    print('[Modora]^7')
                    print('[Modora] Quick fix: Try HTTPS instead:')
                    print('[Modora]   Config.ModoraAPIBase = "https://api.modora.xyz"')
                else
                    print('[Modora] Using HTTPS - SSL/TLS certificate issue')
                    print('[Modora]^7')
                    print('[Modora] Solutions:^7')
                    print('[Modora]   1. Update FiveM artifact to recommended version')
                    print('[Modora]   2. Update CA certificates: sudo update-ca-certificates')
                    print('[Modora]   3. Try HTTP instead: Config.ModoraAPIBase = "http://api.modora.xyz"')
                    print('[Modora]      (Requires Cloudflare configuration to allow HTTP)')
                end
            end
            
            if protocol == 'http' then
                errorMsg = errorMsg .. ' Using HTTP. Check: 1) Server can reach api.modora.xyz, 2) Cloudflare allows HTTP, 3) DNS resolution works.'
            else
                errorMsg = errorMsg .. ' Using HTTPS. Try switching to HTTP in config.lua to avoid SSL/TLS issues.'
            end
            
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
            if response then
                local success, data = pcall(json.decode, response)
                if success and data and data.message then
                    errorMsg = data.message
                else
                    errorMsg = errorMsg .. ': ' .. response
                end
            end
            if Config.Debug then
                print('[Modora] Report submission failed: ' .. errorMsg)
            end
            if callback then callback(false, nil, errorMsg, nil) end
        end
    end)
end

-- ============================================
-- REPORT SUBMISSION HANDLER
-- ============================================

RegisterNetEvent('modora:submitReport')
AddEventHandler('modora:submitReport', function(reportData)
    local source = source
    
    -- Validate required fields
    if not reportData.category or not reportData.subject or not reportData.description then
        TriggerClientEvent('modora:reportSubmitted', source, {
            success = false,
            error = 'Missing required fields',
            cooldownSeconds = nil
        })
        return
    end
    
    -- Get player identifiers
    local identifiers = GetPlayerIdentifiersTable(source)
    reportData.reporter = reportData.reporter or {}
    reportData.reporter.identifiers = identifiers
    reportData.reporter.fivemId = source
    reportData.reporter.name = GetPlayerName(source)
    
    -- Merge evidence URLs into meta for API
    reportData.meta = reportData.meta or {}
    if reportData.evidenceUrls and type(reportData.evidenceUrls) == 'table' then
        reportData.meta.evidence_urls = reportData.evidenceUrls
    end
    
    -- Submit to API
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
-- SCREENSHOT UPLOAD TOKEN (for screenshot-basic)
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
-- TEST API CONNECTION
-- ============================================

local function testAPIConnection()
    local baseUrl, hostHeader = getEffectiveAPIConfig()
    if not baseUrl or baseUrl == '' then
        return
    end
    baseUrl = baseUrl:gsub('/+$', ''):match('^%s*(.-)%s*$')
    if not baseUrl:match('^https?://') then
        print('^1[Modora] ⚠️ Invalid API base URL format. Must start with http:// or https://^7')
        return
    end
    
    -- Warn if using HTTP
    if baseUrl:match('^http://') then
        print('^3[Modora] ⚠️ WARNING: Using HTTP (not HTTPS). This is less secure but avoids SSL/TLS certificate issues.^7')
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
        ['User-Agent'] = 'Modora-FiveM-Resource/' .. RESOURCE_VERSION,
        ['Accept'] = 'application/json',
        ['Connection'] = 'close',
        ['Accept-Encoding'] = 'identity'
    }
    if hostHeader and hostHeader ~= '' then
        testHeaders['Host'] = hostHeader
    end

    PerformHttpRequest(testUrl, function(statusCode, response, responseHeaders)
        local statusNum = tonumber(statusCode) or 0
        
        if statusNum == 0 then
            print('^1[Modora] ⚠️ API CONNECTION FAILED!^7')
            print('^1[Modora] Cannot connect to ' .. testUrl .. '^7')
            print('^1[Modora] Protocol: ' .. (protocol or 'unknown') .. '^7')
            print('^1[Modora]^7')
            
            if protocol == 'http' then
                print('^1[Modora] Using HTTP - no SSL/TLS needed^7')
                print('^1[Modora]^7')
                print('^1[Modora] Possible causes:^7')
                print('^1[Modora]   1. Server cannot reach api.modora.xyz (firewall/network)^7')
                print('^1[Modora]   2. DNS resolution failed^7')
                print('^1[Modora]   3. Cloudflare blocking HTTP (check SSL/TLS settings)^7')
                print('^1[Modora]   4. Server timeout^7')
                print('^1[Modora]^7')
                print('^1[Modora] Solutions:^7')
                print('^1[Modora]   1. Test from server: curl ' .. testUrl .. '^7')
                print('^1[Modora]   2. Check Cloudflare SSL/TLS settings for api.modora.xyz^7')
                print('^1[Modora]   3. Verify DNS: nslookup api.modora.xyz^7')
                print('^1[Modora]   4. Check firewall allows outbound HTTP (port 80)^7')
            else
                print('^1[Modora] Using HTTPS - SSL/TLS certificate issue^7')
                print('^1[Modora]^7')
                print('^1[Modora] Solutions:^7')
                print('^1[Modora]   1. Switch to HTTP: Config.ModoraAPIBase = "http://api.modora.xyz"^7')
                print('^1[Modora]   2. Update FiveM server to latest version^7')
                print('^1[Modora]   3. Update CA certificates: sudo update-ca-certificates^7')
            end
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
            print('^3[Modora] ⚠️ API connection test returned HTTP ' .. tostring(statusCode) .. '^7')
            if response and Config.Debug then
                print('[Modora] Response: ' .. string.sub(response, 1, 500))
            end
        end
    end, 'GET', '', testHeaders)
end

-- ============================================
-- DEBUG: RAW HTTP CONNECTIVITY TEST
-- ============================================

local function testHttpEndpoint(url, label)
    local headers = {
        ['User-Agent'] = 'Modora-FiveM-Resource/' .. RESOURCE_VERSION,
        ['Accept'] = '*/*',
        ['Connection'] = 'close',
        ['Accept-Encoding'] = 'identity'
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
    testHttpEndpoint('http://api.modora.xyz/test', 'modora-http-test')
    testHttpEndpoint('https://api.modora.xyz/test', 'modora-https-test')

    local ip = '157.180.103.21'
    local function testIpEndpoint(url, label, hostHeader)
        local headers = {
            ['User-Agent'] = 'Modora-FiveM-Resource/' .. RESOURCE_VERSION,
            ['Accept'] = '*/*',
            ['Connection'] = 'close',
            ['Accept-Encoding'] = 'identity'
        }
        if hostHeader and hostHeader ~= '' then
            headers['Host'] = hostHeader
        end

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

    testIpEndpoint('http://' .. ip .. '/test', 'modora-ip-http-test', 'api.modora.xyz')
    testIpEndpoint('https://' .. ip .. '/test', 'modora-ip-https-test', 'api.modora.xyz')
end, false)

-- ============================================
-- CONFIGURATION VALIDATION
-- ============================================

Citizen.CreateThread(function()
    Citizen.Wait(2000) -- Wait 2 seconds after resource start
    
    local baseUrl, _, token = getEffectiveAPIConfig()
    local configValid = true
    local errors = {}
    
    if not baseUrl or baseUrl == '' then
        configValid = false
        table.insert(errors, Config.UseAlphaEnvironment and 'ModoraAPIBaseAlpha is not set' or 'ModoraAPIBase is not set')
    end
    
    if not token or token == '' then
        configValid = false
        table.insert(errors, Config.UseAlphaEnvironment and 'APITokenAlpha is required for alpha' or 'APIToken is required')
    end
    
    if not configValid then
        print('^1[Modora] ⚠️ CONFIGURATION ERROR!^7')
        for _, error in ipairs(errors) do
            print('^1[Modora]   - ' .. error .. '^7')
        end
        print('^1[Modora]^7')
        print('^1[Modora] Please update config.lua with your API token from the dashboard:^7')
        print('^1[Modora]   1. Go to Dashboard > Guild > FiveM Integration^7')
        print('^1[Modora]   2. Add or select your server^7')
        print('^1[Modora]   3. Copy the API Token^7')
        print('^1[Modora]   4. Paste it in config.lua as Config.APIToken^7')
    else
        print('^2[Modora] ✅ Configuration validated successfully^7')
        Citizen.Wait(1000)
        testAPIConnection()
    end
end)
