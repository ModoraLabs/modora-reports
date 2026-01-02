let isModalOpen = false;
let reportFormUrl = '';

// ============================================
// NUI MESSAGE HANDLING
// ============================================

window.addEventListener('message', function(event) {
    const data = event.data;
    
    if (data.action === 'openReport') {
        reportFormUrl = data.reportFormUrl;
        openModal();
    } else if (data.action === 'closeReport') {
        closeModal();
    }
});

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
    
    // Set iframe source
    iframe.src = reportFormUrl;
    
    modal.classList.remove('hidden');
    isModalOpen = true;
    
    // Send player data to iframe after it loads
    iframe.onload = function() {
        console.log('[Modora] Iframe loaded successfully');
        sendPlayerDataToIframe();
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
    }
    
    isModalOpen = false;
    
    // Notify FiveM
    fetch(`https://${GetParentResourceName()}/closeReport`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    }).catch(err => {
        console.error('Failed to notify FiveM of modal close:', err);
    });
}

function GetParentResourceName() {
    return 'modora-reports';
}

// ============================================
// SEND PLAYER DATA TO IFRAME
// ============================================

function sendPlayerDataToIframe() {
    // Request player data from FiveM
    fetch(`https://${GetParentResourceName()}/requestPlayerData`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
    .then(response => response.json())
    .then(data => {
        console.log('Player data received from FiveM:', data);
        if (data && data.playerData) {
            // Send player data to iframe via postMessage
            const iframe = document.getElementById('reportIframe');
            if (iframe && iframe.contentWindow) {
                console.log('Sending player data to iframe:', data.playerData);
                iframe.contentWindow.postMessage({
                    type: 'fivem:playerData',
                    data: data.playerData
                }, '*');
            } else {
                console.error('Iframe or contentWindow not found');
            }
        } else {
            console.error('No player data in response:', data);
        }
    })
    .catch(err => {
        console.error('Failed to get player data:', err);
    });
}

// Listen for messages from iframe
window.addEventListener('message', function(event) {
    // Only accept messages from our iframe
    const iframe = document.getElementById('reportIframe');
    if (!iframe || event.source !== iframe.contentWindow) {
        return;
    }
    
    // Handle report submitted
    if (event.data.type === 'fivem:reportSubmitted') {
        console.log('[Modora] Report submitted, success:', event.data.success);
        if (event.data.success) {
            // Notify FiveM client about success immediately
            fetch(`https://${GetParentResourceName()}/reportSubmitted`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    ticketNumber: event.data.ticketNumber,
                    ticketId: event.data.ticketId
                })
            }).then(() => {
                console.log('[Modora] Successfully notified FiveM client about report submission');
            }).catch(err => {
                console.error('[Modora] Failed to notify FiveM of report submission:', err);
            });
            
            // Don't close modal immediately - let the form show success message first
            // The form will close itself after 3 seconds
        } else {
            // Notify FiveM client about error
            fetch(`https://${GetParentResourceName()}/reportSubmitted`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: event.data.error || 'Unknown error'
                })
            }).catch(err => {
                console.error('[Modora] Failed to notify FiveM of report error:', err);
            });
        }
    }
    
    // Handle close request
    if (event.data.type === 'fivem:closeForm') {
        closeModal();
    }
    
    // Handle screenshot request
    if (event.data.type === 'fivem:requestScreenshot') {
        requestScreenshot();
    }
});

// ============================================
// SCREENSHOT FUNCTIONALITY
// ============================================

function requestScreenshot() {
    console.log('[Modora] Requesting screenshot...');
    fetch(`https://${GetParentResourceName()}/takeScreenshot`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
    })
    .then(response => response.json())
    .then(data => {
        console.log('[Modora] Screenshot response:', data);
        if (data.success && data.processing) {
            // Screenshot is being processed, wait for NUI callback
            console.log('[Modora] Screenshot processing, waiting for result...');
        } else if (data.success && data.url) {
            // Direct URL response (shouldn't happen with new flow)
            const iframe = document.getElementById('reportIframe');
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
            const iframe = document.getElementById('reportIframe');
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
        const iframe = document.getElementById('reportIframe');
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
// NUI CALLBACK FOR SCREENSHOT-BASIC
// ============================================
// screenshot-basic uses SendNUIMessage to call this callback
// It sends a message with type 'screenshot_created' to the NUI context
// We need to listen for this in the window message handler
window.addEventListener('message', function(event) {
    // Handle screenshot_created callback from screenshot-basic
    // screenshot-basic sends this via SendNUIMessage with the screenshot data
    // The message structure can vary, so we check multiple formats
    const data = event.data;
    
    // Check if this is a screenshot_created message from screenshot-basic
    // screenshot-basic might send it as: { type: 'screenshot_created', data: {...} }
    // or as: { url: '...' } directly
    // or as: { action: 'screenshot_created', ... }
    if (data.type === 'screenshot_created' || 
        data.action === 'screenshot_created' ||
        (data.url && typeof data.url === 'string' && data.url.startsWith('http'))) {
        
        console.log('[Modora] screenshot_created received from screenshot-basic:', data);
        
        // Extract URL from various possible formats
        const screenshotData = data.data || data;
        const url = screenshotData.url || data.url || screenshotData.uploadUrl || screenshotData.link;
        
        if (url && typeof url === 'string' && url !== '') {
            console.log('[Modora] Screenshot URL received:', url);
            
            // Forward to client.lua via NUI callback
            fetch(`https://${GetParentResourceName()}/screenshotResult`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: url,
                    success: true
                })
            }).catch(err => {
                console.error('[Modora] Error sending screenshot result:', err);
            });
            
            // Also send to iframe
            const iframe = document.getElementById('reportIframe');
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
            
            fetch(`https://${GetParentResourceName()}/screenshotResult`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: false,
                    error: error
                })
            }).catch(err => {
                console.error('[Modora] Error sending screenshot error:', err);
            });
            
            // Send error to iframe
            const iframe = document.getElementById('reportIframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({
                    type: 'fivem:screenshot',
                    data: {
                        error: error
                    }
                }, '*');
            }
        }
        return; // Don't process further
    }
    
    // Handle screenshot ready from FiveM client (via SendNUIMessage) - legacy support
    if (data.action === 'screenshotReady' && data.url) {
        console.log('[Modora] Screenshot ready, sending to iframe:', data.url);
        const iframe = document.getElementById('reportIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    url: data.url
                }
            }, '*');
        }
        return;
    }
    
    if (data.action === 'screenshotError') {
        console.error('[Modora] Screenshot error:', data.error);
        const iframe = document.getElementById('reportIframe');
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
                type: 'fivem:screenshot',
                data: {
                    error: data.error || 'Failed to take screenshot'
                }
            }, '*');
        }
        return;
    }
    
    // Handle other messages (openReport, closeReport, etc.)
    if (data.action === 'openReport') {
        reportFormUrl = data.reportFormUrl;
        openModal();
    } else if (data.action === 'closeReport') {
        closeModal();
    }
});

// ESC key to close
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isModalOpen) {
        closeModal();
    }
});
