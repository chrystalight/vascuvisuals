const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 900,
        minHeight: 600,
        title: 'VascuVisuals',
        webPreferences: {
            contextIsolation: true,
        },
    });

    win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    // Grant all permissions (camera, fullscreen, etc.)
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        callback(true);
    });

    // Auto-save recordings and screenshots to Downloads — no popup
    session.defaultSession.on('will-download', (event, item) => {
        const downloadsPath = app.getPath('downloads');
        item.setSavePath(path.join(downloadsPath, item.getFilename()));
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
