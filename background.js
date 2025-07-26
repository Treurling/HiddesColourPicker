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

// Parse RGB string to color object
function parseRgbString(rgbString) {
    const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
        return {
            r: parseInt(match[1]),
            g: parseInt(match[2]),
            b: parseInt(match[3]),
            a: 255,
            hex: rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3])),
            rgb: rgbString
        };
    }
    return null;
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

function calculateLighterColor(color) {
    return formatColorData(Math.min(Math.round(color.r * 1.2), 255), Math.min(Math.round(color.g * 1.2), 255), Math.min(Math.round(color.b * 1.2), 255), color.a);
}

function calculateDarkerColor(color) {
    return formatColorData(Math.max(Math.round(color.r * 0.8), 0), Math.max(Math.round(color.g * 0.8), 0), Math.max(Math.round(color.b * 0.8), 0), color.a);
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

function injectResultOverlay(color, tabId) {
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

        const colorContainer = document.createElement('div');
        colorContainer.className = 'color-preview-box-container';

        const lighterColor = document.createElement('div');
        lighterColor.className = 'color-preview-box';
        lighterColor.style.backgroundColor = color.lighter;
        colorContainer.appendChild(lighterColor);

        lighterColor.addEventListener('click', function() {
            browser.runtime.sendMessage({
                action: 'ShowResultOverlay',
                tabId: tabId,
                color: color.lighter
            });
        });

        const selectedColor = document.createElement('div');
        selectedColor.className = 'color-preview-box-selected';
        selectedColor.style.backgroundColor = color.hex;
        colorContainer.appendChild(selectedColor);

        selectedColor.addEventListener('click', function() {
            navigator.clipboard.writeText(color.hex);
        });

        const darkerColor = document.createElement('div');
        darkerColor.className = 'color-preview-box';
        darkerColor.style.backgroundColor = color.darker;
        colorContainer.appendChild(darkerColor);

        darkerColor.addEventListener('click', function() {
            browser.runtime.sendMessage({
                action: 'ShowResultOverlay',
                tabId: tabId,
                color: color.darker
            });
        });

        content.appendChild(colorContainer);
        const colorHex = document.createElement('p');
        colorHex.className = 'color-hex';
        colorHex.textContent = color.hex;
        content.appendChild(colorHex);

        const colorRgb = document.createElement('p');
        colorRgb.className = 'color-rgb';
        colorRgb.textContent = color.rgb;
        content.appendChild(colorRgb);

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

async function handleResultOverlay(tabId, color) {
    try {
        // Determine if the input is an RGB string or a color object
        const colorToInject = typeof color === 'string' ? parseRgbString(color) : color;
        
        if (!colorToInject) {
            console.error('Invalid color format:', color);
            return;
        }

        // Calculate lighter and darker colors before injection
        const colorWithVariants = {
            ...colorToInject,
            lighter: calculateLighterColor(colorToInject).rgb,
            darker: calculateDarkerColor(colorToInject).rgb
        };
        
        await browser.tabs.executeScript(tabId, {
            code: `(${injectResultOverlay.toString()})(${JSON.stringify(colorWithVariants)}, ${JSON.stringify(tabId)})`
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