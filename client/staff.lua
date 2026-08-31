-- ============================================
-- Modora FiveM Control Center — Staff Panel Client
-- ============================================
-- Depends on: client/bootstrap.lua (isMenuOpen, isServerStatsOpen)

isStaffPanelOpen = false
isSpectating = false
local spectateReturnCoords = nil
local spectateTarget = nil  -- server id of the player currently being spectated
local spectateCam = nil     -- scripted orbit camera used while spectating
local camDist = 4.5         -- distance from the target, metres (scroll to change)
local camYaw = 0.0          -- orbit yaw, degrees (mouse left/right)
local camPitch = 18.0       -- orbit pitch, degrees (mouse up/down)
local camInitialized = false
local stopSpectate  -- forward declaration; defined in the Spectate section below

local function clamp(v, lo, hi)
    if v < lo then return lo elseif v > hi then return hi else return v end
end

-- ── Open staff panel ──

local function openStaffPanel()
    if Config.StaffPanelEnabled == false then return end
    -- If currently spectating, the staff command/keybind exits spectate first
    -- (matches the on-screen "Use /mstaff to stop" hint).
    if isSpectating then
        stopSpectate(false)
        return
    end
    if isMenuOpen or isServerStatsOpen then return end
    if isStaffPanelOpen then
        SetNuiFocus(false, false)
        isStaffPanelOpen = false
        SendNUIMessage({ action = 'CLOSE_STAFF' })
        return
    end

    isStaffPanelOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'OPEN_STAFF' })

    -- Request data (server checks ACE permission before responding)
    TriggerServerEvent('modora:staff:getReports')
    TriggerServerEvent('modora:staff:getPlayers')
end

-- Register command (configurable, can be disabled)
local staffCommand = Config.StaffPanelCommand
if staffCommand and staffCommand ~= false and staffCommand ~= 'false' and staffCommand ~= '' then
    RegisterCommand(staffCommand, function()
        openStaffPanel()
    end, false)

    -- Register keybind (configurable, can be disabled)
    local staffKeybind = Config.StaffPanelKeybind
    if staffKeybind and staffKeybind ~= false and staffKeybind ~= 'false' and staffKeybind ~= '' then
        RegisterKeyMapping(staffCommand, 'Open Modora Staff Panel', 'keyboard', staffKeybind)
    end
end

-- ── NUI callbacks ──

RegisterNUICallback('closeStaff', function(data, cb)
    SetNuiFocus(false, false)
    isStaffPanelOpen = false
    cb('ok')
end)

RegisterNUICallback('staffAction', function(data, cb)
    TriggerServerEvent('modora:staff:executeAction', data)
    cb('ok')
end)

RegisterNUICallback('staffRefreshPlayers', function(data, cb)
    TriggerServerEvent('modora:staff:getPlayers')
    cb('ok')
end)

RegisterNUICallback('staffRefreshReports', function(data, cb)
    TriggerServerEvent('modora:staff:getReports')
    cb('ok')
end)

RegisterNUICallback('staffBulkAction', function(data, cb)
    TriggerServerEvent('modora:staff:bulkAction', data)
    cb('ok')
end)

-- ── Server event handlers ──

RegisterNetEvent('modora:staff:reportsResult')
AddEventHandler('modora:staff:reportsResult', function(data)
    if not data.allowed then
        TriggerEvent('chat:addMessage', {
            color = {255, 100, 100},
            args = {'[Modora]', 'You do not have permission to access the staff panel.'}
        })
        SetNuiFocus(false, false)
        isStaffPanelOpen = false
        SendNUIMessage({ action = 'CLOSE_STAFF' })
        return
    end
    SendNUIMessage({ action = 'STAFF_REPORTS_UPDATE', data = data })
end)

RegisterNetEvent('modora:staff:playersResult')
AddEventHandler('modora:staff:playersResult', function(players)
    SendNUIMessage({ action = 'STAFF_PLAYERS_UPDATE', players = players })
end)

RegisterNetEvent('modora:staff:actionResult')
AddEventHandler('modora:staff:actionResult', function(result)
    SendNUIMessage({ action = 'STAFF_ACTION_RESULT', result = result })
    -- Also refresh player list after actions
    TriggerServerEvent('modora:staff:getPlayers')
end)

RegisterNetEvent('modora:staff:teleportTo')
AddEventHandler('modora:staff:teleportTo', function(coords)
    local ped = PlayerPedId()
    SetEntityCoords(ped, coords.x, coords.y, coords.z, false, false, false, false)
end)

RegisterNetEvent('modora:staff:freezePlayer')
AddEventHandler('modora:staff:freezePlayer', function()
    local ped = PlayerPedId()
    local isFrozen = IsEntityPositionFrozen(ped)
    FreezeEntityPosition(ped, not isFrozen)
end)

-- Restore the local ped to a normal, controllable state and drop back where we
-- started. Without this there is no way out of spectate: the ped stays invisible
-- and, because collision was disabled, teleporting away makes you fall forever.
stopSpectate = function(silent)
    if not isSpectating then return end
    isSpectating = false
    spectateTarget = nil

    local ped = PlayerPedId()
    local coords = spectateReturnCoords
    spectateReturnCoords = nil

    -- Tear down the scripted camera and hand control back to the gameplay cam.
    if spectateCam then
        RenderScriptCams(false, false, 0, true, true)
        DestroyCam(spectateCam, false)
        spectateCam = nil
    end
    camInitialized = false

    -- Restore collision/visibility BEFORE moving, so we never teleport a
    -- collisionless ped into the world.
    SetEntityCollision(ped, true, true)
    SetEntityVisible(ped, true, false)
    ResetEntityAlpha(ped)
    FreezeEntityPosition(ped, false)

    if coords then
        -- Stream collision in around the destination first, otherwise the ped
        -- falls through un-loaded terrain (the "fall infinitely" symptom).
        RequestCollisionAtCoord(coords.x, coords.y, coords.z)
        SetEntityCoords(ped, coords.x, coords.y, coords.z, false, false, false, true)
        local attempts = 0
        while not HasCollisionLoadedAroundEntity(ped) and attempts < 100 do
            RequestCollisionAtCoord(coords.x, coords.y, coords.z)
            Wait(10)
            attempts = attempts + 1
        end
    end

    if not silent then
        TriggerEvent('chat:addMessage', {
            color = {177, 137, 251},
            args = {'[Modora]', 'Stopped spectating.'}
        })
    end
end

RegisterNetEvent('modora:staff:spectatePlayer')
AddEventHandler('modora:staff:spectatePlayer', function(data)
    if not data then return end
    local ped = PlayerPedId()
    local wasSpectating = isSpectating

    -- Remember where we were so we can restore on exit. Only capture on the
    -- first enter, so hopping between targets keeps the original return point.
    if not wasSpectating then
        local c = GetEntityCoords(ped)
        spectateReturnCoords = { x = c.x, y = c.y, z = c.z }
    end

    isSpectating = true
    spectateTarget = tonumber(data.targetId)

    -- Jump to the target so their ped streams in; our (hidden) ped is then kept
    -- near them each frame for streaming, while a scripted camera does the viewing.
    SetEntityCoords(ped, data.x, data.y, data.z + 10.0, false, false, false, false)
    FreezeEntityPosition(ped, true)
    SetEntityVisible(ped, false, false)
    SetEntityAlpha(ped, 0, false)
    SetEntityCollision(ped, false, false)

    TriggerEvent('chat:addMessage', {
        color = {177, 137, 251},
        args = {'[Modora]', 'Spectating. Mouse to look, scroll to zoom. BACKSPACE / /unspectate / /' .. tostring(Config.StaffPanelCommand or 'mstaff') .. ' to stop.'}
    })

    -- Only one follow loop runs at a time; re-spectating just retargets it.
    if wasSpectating then return end

    -- Fresh session: reset the orbit and spin up the scripted camera.
    camDist = 4.5
    camPitch = 18.0
    camInitialized = false
    if not spectateCam then
        spectateCam = CreateCam('DEFAULT_SCRIPTED_CAMERA', true)
        SetCamActive(spectateCam, true)
        RenderScriptCams(true, false, 0, true, true)
    end

    CreateThread(function()
        while isSpectating do
            Wait(0)
            local target = spectateTarget
            if not target then break end

            local localIdx = GetPlayerFromServerId(target)
            if localIdx == -1 then
                -- Target disconnected — nothing left to spectate.
                TriggerEvent('chat:addMessage', {
                    color = {177, 137, 251},
                    args = {'[Modora]', 'Spectated player left the server — stopping spectate.'}
                })
                stopSpectate(true)
                break
            end

            local targetPed = GetPlayerPed(localIdx)
            if targetPed and targetPed ~= 0 and DoesEntityExist(targetPed) then
                local tc = GetEntityCoords(targetPed)

                -- Keep our hidden ped on the target so the world stays streamed
                -- (follows them into vehicles, since it tracks the ped).
                SetEntityCoords(PlayerPedId(), tc.x, tc.y, tc.z, false, false, false, false)

                -- Start the orbit behind the target on the first valid frame.
                if not camInitialized then
                    camYaw = GetEntityHeading(targetPed)
                    camInitialized = true
                end

                -- Consume look/zoom inputs so the gameplay cam and ped ignore them.
                DisableControlAction(0, 1, true)   -- LookLeftRight
                DisableControlAction(0, 2, true)   -- LookUpDown
                DisableControlAction(0, 14, true)  -- weapon wheel next  (scroll down)
                DisableControlAction(0, 15, true)  -- weapon wheel prev  (scroll up)
                DisableControlAction(0, 24, true)  -- attack
                DisableControlAction(0, 25, true)  -- aim

                camYaw = camYaw - GetDisabledControlNormal(0, 1) * 8.0
                camPitch = clamp(camPitch + GetDisabledControlNormal(0, 2) * 8.0, -60.0, 85.0)
                if IsDisabledControlPressed(0, 15) then camDist = clamp(camDist - 0.6, 1.5, 30.0) end
                if IsDisabledControlPressed(0, 14) then camDist = clamp(camDist + 0.6, 1.5, 30.0) end

                -- Spherical orbit around the target; yaw 0 sits directly behind.
                local yawR = math.rad(camYaw)
                local pitchR = math.rad(camPitch)
                local horiz = math.cos(pitchR) * camDist
                local camX = tc.x + math.sin(yawR) * horiz
                local camY = tc.y - math.cos(yawR) * horiz
                local camZ = tc.z + math.sin(pitchR) * camDist + 0.5

                if spectateCam then
                    SetCamCoord(spectateCam, camX, camY, camZ)
                    PointCamAtEntity(spectateCam, targetPed, 0.0, 0.0, 0.3, true)
                end
            end
        end
    end)
end)

-- Dedicated exit command + keybind (works regardless of the staff panel state).
RegisterCommand('unspectate', function()
    stopSpectate(false)
end, false)
RegisterKeyMapping('unspectate', 'Stop Spectating (Modora)', 'keyboard', 'BACK')

-- Safety net: if the resource stops/restarts mid-spectate, don't leave the
-- player stuck invisible and collisionless.
AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() and isSpectating then
        if spectateCam then
            RenderScriptCams(false, false, 0, true, true)
            DestroyCam(spectateCam, false)
            spectateCam = nil
        end
        local ped = PlayerPedId()
        SetEntityCollision(ped, true, true)
        SetEntityVisible(ped, true, false)
        ResetEntityAlpha(ped)
        FreezeEntityPosition(ped, false)
    end
end)

-- ── Staff notifications ──

RegisterNetEvent('modora:staff:notification')
AddEventHandler('modora:staff:notification', function(notification)
    if not notification then return end
    -- Show as NUI toast if staff panel is open, otherwise show chat message
    if isStaffPanelOpen then
        SendNUIMessage({ action = 'STAFF_NOTIFICATION', notification = notification })
    else
        TriggerEvent('chat:addMessage', {
            color = {177, 137, 251},
            args = {'[Modora]', notification.message or 'New notification'}
        })
    end

    -- Play notification sound
    PlaySoundFrontend(-1, 'Text_Arrive_Tone', 'Phone_SoundSet_Default', false)
end)

-- ── Warn received handler (for target player) ──

RegisterNetEvent('modora:receiveWarn')
AddEventHandler('modora:receiveWarn', function(reason, staffName)
    TriggerEvent('chat:addMessage', {
        color = {255, 200, 0},
        args = {'[Modora Warning]', 'You have been warned by ' .. (staffName or 'Staff') .. ': ' .. (reason or 'No reason provided')}
    })
    PlaySoundFrontend(-1, 'Text_Arrive_Tone', 'Phone_SoundSet_Default', false)
end)
