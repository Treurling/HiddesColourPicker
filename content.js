// Content script for Firefox extension

// Listen for custom ColorPicked event from overlay
window.addEventListener('ColorPicked', (event) => {
    const { x, y } = event.detail;
    browser.runtime.sendMessage({
        action: 'getPixelColor',
        coordinates: { x, y }
    }).then(response => {
        if (response && response.success) {
            browser.runtime.sendMessage({
                action: 'ShowResultOverlay',
                color: response.data
            });
        }
    });
});

