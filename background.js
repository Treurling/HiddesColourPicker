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

function injectColorPickerOverlay() {
    try {
        const existingOverlay = document.getElementById('color-picker-overlay');
        if (existingOverlay) existingOverlay.remove();
        const overlay = document.createElement('div');
        overlay.id = 'color-picker-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: transparent; cursor: crosshair; z-index: 999999; pointer-events: auto;';
        overlay.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            window.dispatchEvent(new CustomEvent('ColorPicked', { detail: { x: e.clientX, y: e.clientY } }));
            overlay.remove();
        });
        const handleEscape = function(e) {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handleEscape); }
        };
        document.addEventListener('keydown', handleEscape);
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

function injectResultOverlay() {
    try {
        const existingOverlay = document.getElementById('result-overlay');
        if (existingOverlay) existingOverlay.remove();
        const overlay = document.createElement('div');
        overlay.id = 'result-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); z-index: 999999; pointer-events: auto;';
        overlay.innerHTML = `
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: color.hex; color: white; padding: 10px; border-radius: 5px;">
                <p>Color: color.hex</p>
                <p>RGB: color.rgb</p>
            </div>
        `;

        const handleEscape = function(e) {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', handleEscape); }
        };
        document.addEventListener('keydown', handleEscape);

        document.body.appendChild(overlay);
    } catch (err) {
        console.error('Result overlay injection error:', err);
    }
}

function StringifyResultOverlay(color) {
    return `(${injectResultOverlay.toString()})()`.replaceAll("color.hex", color.hex).replaceAll("color.rgb", color.rgb);
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