const path = require('node:path')
const { app, BrowserWindow, Menu, shell } = require('electron')

const isDev = process.argv.includes('--dev')
const devServerUrl = process.env.ELECTRON_DEV_URL || 'http://localhost:5173'

let mainWindow

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1040,
    minHeight: 680,
    title: 'Joton Billing',
    backgroundColor: '#f4f7fb',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'src', 'assets', 'logo-marvel.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  Menu.setApplicationMenu(null)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url)
    }

    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow.webContents.getURL()
    const isExternal =
      /^https?:\/\//i.test(url) && !url.startsWith(devServerUrl)

    if (currentUrl && isExternal) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  if (isDev) {
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
    return
  }

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
