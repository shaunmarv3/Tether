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
  installEngine: () => ipcRenderer.invoke('tether:installEngine'),
  openMirror: () => ipcRenderer.invoke('tether:openMirror'),
  trust: (serialNo) => ipcRenderer.invoke('tether:trust', serialNo),
  forget: (serialNo) => ipcRenderer.invoke('tether:forget', serialNo),
  lockdown: () => ipcRenderer.invoke('tether:lockdown'),
  setIdle: (minutes) => ipcRenderer.invoke('tether:setIdle', minutes),
  getActivity: () => ipcRenderer.invoke('tether:getActivity'),
}

contextBridge.exposeInMainWorld('tether', api)
