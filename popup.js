// Popup script for Firefox extension

document.addEventListener('DOMContentLoaded', function() {
    const pickColorBtn = document.getElementById('pickColor');

    pickColorBtn.addEventListener('click', async () => {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;
        await browser.runtime.sendMessage({ action: 'startColorPicking', tabId: tab.id });
        window.close();
    });
});
