let isModalOpen = false;
let reportFormUrl = '';
let iframeReference = null;

// ============================================
// NUI MESSAGE HANDLING (Single consolidated handler)
// ============================================

window.addEventListener('message', function(event) {
    const data = event.data;
    
    // Handle messages from FiveM client
    if (data.action === 'openReport') {
        reportFormUrl = data.reportFormUrl;
        openModal();
    } else if (data.action === 'closeReport') {
        closeModal();
    } else if (data.action === 'screenshotReady' && data.url) {
        // Legacy screenshot support from FiveM client
        const iframe = document.getElementById('reportIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    url: data.url
                }
            }, '*');
        }
    } else if (data.action === 'screenshotError') {
        const iframe = document.getElementById('reportIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    error: data.error || 'Failed to take screenshot'
                }
            }, '*');
        }
    } else if (data.type === 'screenshot_created' || 
               data.action === 'screenshot_created' ||
               (data.url && typeof data.url === 'string' && data.url.startsWith('http'))) {
        // Handle screenshot_created from screenshot-basic
        handleScreenshotCreated(data);
    }
    
    // Handle messages FROM iframe (cross-origin messages)
    // Only process if the message is from our iframe
    const iframe = document.getElementById('reportIframe');
    if (iframe && iframe.contentWindow && event.source === iframe.contentWindow) {
        handleIframeMessage(data);
    }
});

// ============================================
// HANDLE MESSAGES FROM IFRAME
// ============================================

function handleIframeMessage(data) {
    // Handle report submitted
    if (data.type === 'fivem:reportSubmitted') {
        console.log('[Modora] Report submitted, success:', data.success);
        if (data.success) {
            // Notify FiveM client about success immediately
            sendNUICallback('reportSubmitted', {
                success: true,
                ticketNumber: data.ticketNumber,
                ticketId: data.ticketId
            }).then(() => {
                console.log('[Modora] Successfully notified FiveM client about report submission');
            }).catch(err => {
                console.error('[Modora] Failed to notify FiveM of report submission:', err);
            });
        } else {
            // Notify FiveM client about error
            sendNUICallback('reportSubmitted', {
                success: false,
                error: data.error || 'Unknown error'
            }).catch(err => {
                console.error('[Modora] Failed to notify FiveM of report error:', err);
            });
        }
    }
    
    // Handle close request
    if (data.type === 'fivem:closeForm') {
        closeModal();
    }
    
    // Handle screenshot request
    if (data.type === 'fivem:requestScreenshot') {
        requestScreenshot();
    }
}

// ============================================
// MODAL FUNCTIONS
// ============================================

function openModal() {
    const modal = document.getElementById('reportModal');
    const iframe = document.getElementById('reportIframe');
    
    if (!modal || !iframe) {
        console.error('[Modora] Modal or iframe element not found');
        return;
    }
    
    // Check if URL is valid (not containing placeholders)
    if (!reportFormUrl || reportFormUrl.includes('{')) {
        console.error('[Modora] Invalid report form URL:', reportFormUrl);
        alert('Report Form URL is not configured correctly. Please check config.lua and update the ReportFormURL with your actual URL from the dashboard.');
        return;
    }
    
    console.log('[Modora] Opening modal with URL:', reportFormUrl);
    
    // Store iframe reference for later use
    iframeReference = iframe;
    
    // Set iframe source
    iframe.src = reportFormUrl;
    
    modal.classList.remove('hidden');
    isModalOpen = true;
    
    // Send player data to iframe after it loads
    iframe.onload = function() {
        console.log('[Modora] Iframe loaded successfully');
        // Small delay to ensure iframe contentWindow is fully ready
        setTimeout(() => {
            sendPlayerDataToIframe();
        }, 100);
    };
    
    iframe.onerror = function() {
        console.error('[Modora] Error loading iframe:', reportFormUrl);
    };
}

function closeModal() {
    const modal = document.getElementById('reportModal');
    const iframe = document.getElementById('reportIframe');
    
    if (modal) {
        modal.classList.add('hidden');
    }
    
    if (iframe) {
        iframe.src = '';
        iframeReference = null;
    }
    
    isModalOpen = false;
    
    // Notify FiveM
    sendNUICallback('closeReport', {}).catch(err => {
        console.error('Failed to notify FiveM of modal close:', err);
    });
}

function GetParentResourceName() {
    return 'modora-reports';
}

// ============================================
// HELPER FUNCTION FOR NUI CALLBACKS
// ============================================

function sendNUICallback(callbackName, data) {
    return fetch(`https://${GetParentResourceName()}/${callbackName}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .catch(err => {
        // Only log errors that are not network-related (resource not found is expected if resource is down)
        if (err.name !== 'TypeError' || !err.message.includes('Failed to fetch')) {
            console.error(`[Modora] Error calling ${callbackName}:`, err);
        }
        throw err;
    });
}

// ============================================
// SEND PLAYER DATA TO IFRAME
// ============================================

function sendPlayerDataToIframe() {
    // Request player data from FiveM
    sendNUICallback('requestPlayerData', {})
    .then(data => {
        console.log('Player data received from FiveM:', data);
        if (data && data.success && data.playerData) {
            // Send player data to iframe via postMessage
            const iframe = iframeReference || document.getElementById('reportIframe');
            if (iframe && iframe.contentWindow) {
                try {
                    console.log('Sending player data to iframe:', data.playerData);
                    iframe.contentWindow.postMessage({
                        type: 'fivem:playerData',
                        data: data.playerData
                    }, '*');
                } catch (e) {
                    console.error('Error sending postMessage to iframe:', e);
                }
            } else {
                console.warn('[Modora] Iframe or contentWindow not available yet, retrying in 500ms...');
                // Retry after a short delay if iframe isn't ready
                setTimeout(() => {
                    sendPlayerDataToIframe();
                }, 500);
            }
        } else {
            console.error('No player data in response:', data);
        }
    })
    .catch(err => {
        // Don't log network errors as they're expected if the resource isn't running
        // Only log unexpected errors
        if (err.message && !err.message.includes('Failed to fetch')) {
            console.error('Failed to get player data:', err);
        }
    });
}


// ============================================
// SCREENSHOT FUNCTIONALITY
// ============================================

function requestScreenshot() {
    console.log('[Modora] Requesting screenshot...');
    sendNUICallback('takeScreenshot', {})
    .then(data => {
        console.log('[Modora] Screenshot response:', data);
        const iframe = iframeReference || document.getElementById('reportIframe');
        
        if (data.success && data.processing) {
            // Screenshot is being processed, wait for NUI callback
            console.log('[Modora] Screenshot processing, waiting for result...');
        } else if (data.success && data.url) {
            // Direct URL response (shouldn't happen with new flow)
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'fivem:screenshot',
                    data: {
                        url: data.url
                    }
                }, '*');
            }
        } else {
            // Screenshot failed - send error to iframe
            console.error('[Modora] Screenshot failed:', data.error);
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'fivem:screenshot',
                    data: {
                        error: data.error || 'Failed to capture screenshot',
                        fallback: data.fallback || false
                    }
                }, '*');
            }
        }
    })
    .catch(err => {
        console.error('[Modora] Screenshot error:', err);
        // Send error to iframe
        const iframe = iframeReference || document.getElementById('reportIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    error: 'Screenshot functionality is not available. Please use file upload to add screenshots manually.',
                    fallback: true
                }
            }, '*');
        }
    });
}

// ============================================
// HANDLE SCREENSHOT CREATED FROM SCREENSHOT-BASIC
// ============================================
// screenshot-basic uses SendNUIMessage to call this callback
// It sends a message with type 'screenshot_created' to the NUI context
function handleScreenshotCreated(data) {
    console.log('[Modora] screenshot_created received from screenshot-basic:', data);
    
    // Extract URL from various possible formats
    const screenshotData = data.data || data;
    const url = screenshotData.url || data.url || screenshotData.uploadUrl || screenshotData.link;
    
    const iframe = iframeReference || document.getElementById('reportIframe');
    
    if (url && typeof url === 'string' && url !== '') {
        console.log('[Modora] Screenshot URL received:', url);
        
        // Forward to client.lua via NUI callback
        sendNUICallback('screenshotResult', {
            url: url,
            success: true
        }).catch(err => {
            console.error('[Modora] Error sending screenshot result:', err);
        });
        
        // Also send to iframe
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    url: url
                }
            }, '*');
        }
    } else {
        console.error('[Modora] Screenshot created but no URL found:', screenshotData);
        const error = screenshotData.error || data.error || screenshotData.message || data.message || 'No URL returned';
        
        sendNUICallback('screenshotResult', {
            success: false,
            error: error
        }).catch(err => {
            console.error('[Modora] Error sending screenshot error:', err);
        });
        
        // Send error to iframe
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    error: error
                }
            }, '*');
        }
    }
}

// ESC key to close
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isModalOpen) {
        closeModal();
    }
});
