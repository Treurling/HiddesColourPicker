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

// RGB to HEX
function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function formatColorData(r, g, b, a) {
    return {
        r: r,
        g: g,
        b: b,
        a: a,
        hex: rgbToHex(r, g, b),
        rgb: `rgb(${r}, ${g}, ${b})`
    }
}

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
                const color = formatColorData(pixelData[0], pixelData[1], pixelData[2], pixelData[3]);
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

        const content = document.createElement('div');
        content.className = 'result-overlay-content';
        
        content.innerHTML = `
            <div class="color-preview-box-container">
                <div class="color-preview-box" style="background: color.lighter;"></div>
                <div class="color-preview-box-selected" style="background: color.hex;"></div>
                <div class="color-preview-box" style="background: color.darker;"></div>
            </div>
            <p class="color-hex">color.hex</p>
            <p class="color-rgb">color.rgb</p>
        `;

        const handleEscape = function(e) {
            if (e.key === 'Escape') { 
                overlay.remove(); 
                document.removeEventListener('keydown', handleEscape); 
            }
        };
        document.addEventListener('keydown', handleEscape);
        overlay.addEventListener('click', function(e) {
            overlay.remove();
        });

        content.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });

        overlay.appendChild(content);
        document.body.appendChild(overlay);
    } catch (err) {
        console.error('Result overlay injection error:', err);
    }
}

function calculateLighterColor(color) {
    return formatColorData(Math.min(Math.round(color.r * 1.2), 255), Math.min(Math.round(color.g * 1.2), 255), Math.min(Math.round(color.b * 1.2), 255), color.a);
}

function calculateDarkerColor(color) {
    return formatColorData(Math.max(Math.round(color.r * 0.8), 0), Math.max(Math.round(color.g * 0.8), 0), Math.max(Math.round(color.b * 0.8), 0), color.a);
}

function StringifyResultOverlay(color) {
    return `(${injectResultOverlay.toString()})()`.replaceAll("color.hex", color.hex).replaceAll("color.rgb", color.rgb).replaceAll("color.lighter", calculateLighterColor(color).rgb).replaceAll("color.darker", calculateDarkerColor(color).rgb);
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