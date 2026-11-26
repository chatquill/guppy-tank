// The desktop shell: one window showing the exported game, with no browser around it.
const { app, BrowserWindow, Menu, net, protocol } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const GAME = path.join(__dirname, 'game');

// The game is served from its own address so that it can load its code and keep its save, as it does on a web server.
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function serveGame(request) {
    const file = path.normalize(path.join(GAME, decodeURIComponent(new URL(request.url).pathname)));
    if (file !== GAME && !file.startsWith(GAME + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
}

function openWindow() {
    const window = new BrowserWindow({
        width: 1600, height: 900, minWidth: 960, minHeight: 540, backgroundColor: '#000000', title: 'Guppy Tank',
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' },
    });
    // F11 or Alt+Enter: fullscreen. The game never opens other pages, so refuse any that are asked for.
    window.webContents.on('before-input-event', (event, input) => {
        const toggle = input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt));
        if (!toggle) return;
        window.setFullScreen(!window.isFullScreen());
        event.preventDefault();
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('app://game/')) event.preventDefault(); });
    window.loadURL('app://game/index.html');
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    Menu.setApplicationMenu(null);
    app.whenReady().then(() => {
        protocol.handle('app', serveGame);
        openWindow();
    });
    app.on('window-all-closed', () => app.quit());
}
