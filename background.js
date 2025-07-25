// Handle messages for different actions of the extension
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getPixelColor') {
        handleColorPickerRequest(sender.tab.id, message.coordinates, sendResponse);
        return true;
    }
    if (message.action === 'startColorPicking') {
        handleStartColorPicking(message.tabId, sendResponse);
        return true;
    }
    if (message.action === 'ShowResultOverlay') {
        handleResultOverlay(message.tabId, message.color);
        return true;
    }
    sendResponse({ success: false, error: 'Unknown action: ' + message.action });
    return false;
});

// Listen for the pick-color keyboard shortcut
browser.commands.onCommand.addListener((command) => {
    if (command === "startColorPicking") {
        // Get the active tab and start color picking
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            if (tabs[0]) {
                handleStartColorPicking(tabs[0].id, (response) => {
                    console.log('Color picker started via keyboard shortcut:', response);
                });
            }
        });
    }
});

// Handle the color picker request
async function handleColorPickerRequest(tabId, coordinates, sendResponse) {
    try {
        if (!tabId) {
            sendResponse({ success: false, error: 'No tab ID provided' });
            return;
        }
        try {
            const dataURL = await browser.tabs.captureVisibleTab(null, { format: 'png', quality: 100 });
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const pixelData = ctx.getImageData(coordinates.x, coordinates.y, 1, 1).data;
                const color = {
                    r: pixelData[0],
                    g: pixelData[1],
                    b: pixelData[2],
                    a: pixelData[3],
                    hex: `#${pixelData[0].toString(16).padStart(2, '0')}${pixelData[1].toString(16).padStart(2, '0')}${pixelData[2].toString(16).padStart(2, '0')}`,
                    rgb: `rgb(${pixelData[0]}, ${pixelData[1]}, ${pixelData[2]})`
                };
                sendResponse({ success: true, data: color });
            };
            img.onerror = function() {
                sendResponse({ success: false, error: 'Failed to load screenshot for color picking' });
            };
            img.src = dataURL;
        } catch (error) {
            sendResponse({ success: false, error: 'Failed to capture screenshot for color picking' });
        }
    } catch (error) {
        sendResponse({ success: false, error: error.message });
    }
}

function injectResultOverlay() {
    try {
        const existingOverlay = document.getElementById('result-overlay');
        if (existingOverlay) existingOverlay.remove();
        
        // Inject CSS if not already present
        if (!document.getElementById('overlay-styles')) {
            const link = document.createElement('link');
            link.id = 'overlay-styles';
            link.rel = 'stylesheet';
            link.href = browser.runtime.getURL('overlay.css');
            document.head.appendChild(link);
        }
        
        const overlay = document.createElement('div');
        overlay.id = 'result-overlay';
        
        overlay.innerHTML = `
            <div class="result-overlay-content">
                <div class="color-preview-box-container">
                    <div class="color-preview-box" style="background: color.lighter;"></div>
                    <div class="color-preview-box-selected" style="background: color.hex;"></div>
                    <div class="color-preview-box" style="background: color.darker;"></div>
                </div>
                <p class="color-hex">color.hex</p>
                <p class="color-rgb">color.rgb</p>
            </div>
        `;

        const handleEscape = function(e) {
            if (e.key === 'Escape') { 
                overlay.remove(); 
                document.removeEventListener('keydown', handleEscape); 
            }
        };
        document.addEventListener('keydown', handleEscape);
        document.body.appendChild(overlay);
    } catch (err) {
        console.error('Result overlay injection error:', err);
    }
}

function StringifyResultOverlay(color) {
    let lighter = "rgb(" + color.rgb.replace("rgb(", "").replace(")", "").split(",").map(Number).map(x => Math.min(Math.round(x * 1.2), 255)).join(",") + ")";
    let darker = "rgb(" + color.rgb.replace("rgb(", "").replace(")", "").split(",").map(Number).map(x => Math.max(Math.round(x * 0.8), 0)).join(",") + ")";
    return `(${injectResultOverlay.toString()})()`.replaceAll("color.hex", color.hex).replaceAll("color.rgb", color.rgb).replaceAll("color.lighter", lighter).replaceAll("color.darker", darker);
}

async function handleResultOverlay(tabId, color) {
    try {
        await browser.tabs.executeScript(tabId, {
            code: StringifyResultOverlay(color)
        });
    } catch (error) {
        console.error('Error injecting result overlay:', error);
    }
}

function injectColorPickerOverlay() {
    try {
        // Remove any existing overlays
        const existingOverlay = document.getElementById('color-picker-overlay');
        if (existingOverlay) existingOverlay.remove();
        
        // Inject CSS if not already present
        if (!document.getElementById('overlay-styles')) {
            const link = document.createElement('link');
            link.id = 'overlay-styles';
            link.rel = 'stylesheet';
            link.href = browser.runtime.getURL('overlay.css');
            document.head.appendChild(link);
        }
        
        // Create the overlay
        const overlay = document.createElement('div');
        overlay.id = 'color-picker-overlay';
        
        // Handle click events
        overlay.addEventListener('click', function(e) {
            e.preventDefault(); 
            e.stopPropagation();
            
            const coordinates = { x: e.clientX, y: e.clientY };
            overlay.remove();
            
            // Send message to background script
            browser.runtime.sendMessage({
                action: 'getPixelColor',
                coordinates: coordinates
            }).then(function(response) {
                if (response && response.success) {
                    browser.runtime.sendMessage({
                        action: 'ShowResultOverlay',
                        color: response.data
                    });
                }
            }).catch(function(error) {
                console.error('Error getting pixel color:', error);
            });
        });
        
        // Handle escape key
        const handleEscape = function(e) {
            if (e.key === 'Escape') { 
                overlay.remove(); 
                document.removeEventListener('keydown', handleEscape); 
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Add overlay to page
        document.body.appendChild(overlay);
    } catch (err) {
        console.error('Overlay injection error:', err);
    }
}

async function handleStartColorPicking(tabId, sendResponse) {
    try {
        if (!tabId) {
            sendResponse({ success: false, error: 'No tab ID provided' });
            return;
        }
        
        await browser.tabs.executeScript(tabId, {
            code: `(${injectColorPickerOverlay.toString()})();`
        });
        
        sendResponse({ success: true });
    } catch (error) {
        console.error('Error starting color picker:', error);
        sendResponse({ success: false, error: error.message });
    }
}