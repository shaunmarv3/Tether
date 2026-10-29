import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, TetherApi } from '../shared/api'

const api: TetherApi = {
  getState: () => ipcRenderer.invoke('tether:getState'),
  onState: (cb) => {
    const listener = (_e: unknown, s: AppState) => cb(s)
    ipcRenderer.on('tether:state', listener)
    return () => { ipcRenderer.removeListener('tether:state', listener) }
  },
  setPin: (pin) => ipcRenderer.invoke('tether:setPin', pin),
  unlock: (pin) => ipcRenderer.invoke('tether:unlock', pin),
  unlockHello: () => ipcRenderer.invoke('tether:unlockHello'),
  installEngine: () => ipcRenderer.invoke('tether:installEngine'),
  openMirror: () => ipcRenderer.invoke('tether:openMirror'),
}

contextBridge.exposeInMainWorld('tether', api)
