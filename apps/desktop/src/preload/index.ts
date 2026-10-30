import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, TetherApi, VideoMsg, ViewId } from '../shared/api'

function listen<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: unknown, ...args: T) => cb(...args)
  ipcRenderer.on(channel, listener as never)
  return () => { ipcRenderer.removeListener(channel, listener as never) }
}

const api: TetherApi = {
  getState: () => ipcRenderer.invoke('tether:getState'),
  onState: (cb) => listen<[AppState]>('tether:state', cb),
  setPin: (pin) => ipcRenderer.invoke('tether:setPin', pin),
  unlock: (pin) => ipcRenderer.invoke('tether:unlock', pin),
  installEngine: () => ipcRenderer.invoke('tether:installEngine'),
  openMirror: () => ipcRenderer.invoke('tether:openMirror'),
  trust: (serialNo) => ipcRenderer.invoke('tether:trust', serialNo),
  forget: (serialNo) => ipcRenderer.invoke('tether:forget', serialNo),
  lockdown: () => ipcRenderer.invoke('tether:lockdown'),
  setIdle: (minutes) => ipcRenderer.invoke('tether:setIdle', minutes),
  getActivity: () => ipcRenderer.invoke('tether:getActivity'),
  attach: (view) => ipcRenderer.invoke('tether:attach', view),
  detach: (view) => ipcRenderer.invoke('tether:detach', view),
  onVideo: (cb) => listen<[ViewId, VideoMsg]>('tether:video', cb),
  onAudio: (cb) => listen<[Uint8Array]>('tether:audio', cb),
  input: (view, e) => ipcRenderer.send('tether:input', view, e),
  onGo: (cb) => listen<['home' | 'mirror']>('tether:go', cb),
  listApps: () => ipcRenderer.invoke('tether:listApps'),
  openApp: (pkg, name) => ipcRenderer.invoke('tether:openApp', pkg, name),
  setAppOptions: (pkg, opts) => ipcRenderer.invoke('tether:setAppOptions', pkg, opts),
  pin: (pkg, name) => ipcRenderer.invoke('tether:pin', pkg, name),
  unpin: (pkg) => ipcRenderer.invoke('tether:unpin', pkg),
  saveLayout: (name, index) => ipcRenderer.invoke('tether:saveLayout', name, index),
  launchLayout: (index) => ipcRenderer.invoke('tether:launchLayout', index),
  deleteLayout: (index) => ipcRenderer.invoke('tether:deleteLayout', index),
}

contextBridge.exposeInMainWorld('tether', api)
