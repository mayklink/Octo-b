import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
import { createLogger } from './logger'

const log = createLogger({ component: 'UpdateService' })

type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

interface UpdateState {
  status: UpdateStatus
  version: string | null
  error: string | null
  percent: number | null
}

let mainWindow: BrowserWindow | null = null
let handlersRegistered = false
let checking = false
let currentState: UpdateState = {
  status: 'idle',
  version: null,
  error: null,
  percent: null
}

function emit(channel: string, payload?: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function setState(partial: Partial<UpdateState>): UpdateState {
  currentState = { ...currentState, ...partial }
  emit('updates:state', currentState)
  return currentState
}

function getVersion(info?: UpdateInfo | null): string | null {
  return info?.version ?? null
}

async function checkForUpdates(): Promise<UpdateState> {
  if (!app.isPackaged) {
    return setState({
      status: 'not-available',
      version: null,
      error: 'Updates are only checked in packaged builds.',
      percent: null
    })
  }

  if (checking) return currentState

  checking = true
  setState({ status: 'checking', error: null, percent: null })

  try {
    await autoUpdater.checkForUpdates()
    return currentState
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('Update check failed', { error: message })
    return setState({ status: 'error', error: message, percent: null })
  } finally {
    checking = false
  }
}

export function registerUpdateService(window: BrowserWindow): void {
  mainWindow = window

  if (!handlersRegistered) {
    handlersRegistered = true

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for updates')
      setState({ status: 'checking', error: null, percent: null })
    })

    autoUpdater.on('update-available', (info) => {
      const version = getVersion(info)
      log.info('Update available', { version })
      setState({ status: 'available', version, error: null, percent: null })
      emit('updates:available', { version })
    })

    autoUpdater.on('update-not-available', (info) => {
      log.info('No update available', { version: getVersion(info) })
      setState({ status: 'not-available', version: getVersion(info), error: null, percent: null })
      emit('updates:not-available', { version: getVersion(info) })
    })

    autoUpdater.on('download-progress', (progress) => {
      setState({ status: 'downloading', percent: progress.percent, error: null })
      emit('updates:progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      const version = getVersion(info)
      log.info('Update downloaded', { version })
      setState({ status: 'downloaded', version, error: null, percent: 100 })
      emit('updates:downloaded', { version })
    })

    autoUpdater.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error)
      log.warn('Updater error', { error: message })
      setState({ status: 'error', error: message, percent: null })
      emit('updates:error', { message })
    })

    ipcMain.handle('updates:getState', () => currentState)
    ipcMain.handle('updates:check', () => checkForUpdates())
    ipcMain.handle('updates:download', async () => {
      if (!app.isPackaged) {
        return setState({
          status: 'error',
          error: 'Updates can only be downloaded in packaged builds.',
          percent: null
        })
      }

      setState({ status: 'downloading', error: null, percent: 0 })
      await autoUpdater.downloadUpdate()
      return currentState
    })
    ipcMain.handle('updates:install', () => {
      autoUpdater.quitAndInstall(false, true)
    })
  }

  if (app.isPackaged) {
    setTimeout(() => {
      void checkForUpdates()
    }, 5_000)
  }
}
