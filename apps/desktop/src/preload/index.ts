import { contextBridge, ipcRenderer, webUtils } from 'electron'
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
  changePassword: (current, next) => ipcRenderer.invoke('tether:changePassword', current, next),
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
  listDir: (dir) => ipcRenderer.invoke('tether:listDir', dir),
  countPlaces: () => ipcRenderer.invoke('tether:countPlaces'),
  sendFiles: (paths, dir) => ipcRenderer.invoke('tether:sendFiles', paths, dir),
  previewFile: (path) => ipcRenderer.invoke('tether:previewFile', path),
  previewStep: (delta) => ipcRenderer.invoke('tether:previewStep', delta),
  pickAndSend: (dir) => ipcRenderer.invoke('tether:pickAndSend', dir),
  saveToPc: (paths) => ipcRenderer.invoke('tether:saveToPc', paths),
  deleteFiles: (paths) => ipcRenderer.invoke('tether:deleteFiles', paths),
  newFolder: (path) => ipcRenderer.invoke('tether:newFolder', path),
  installApk: (path) => ipcRenderer.invoke('tether:installApk', path),
  openSaveFolder: () => ipcRenderer.invoke('tether:openSaveFolder'),
  pathForFile: (f) => webUtils.getPathForFile(f),
  listNotifications: () => ipcRenderer.invoke('tether:listNotifications'),
  clearNotification: (key) => ipcRenderer.invoke('tether:clearNotification', key),
  copyClip: (id) => ipcRenderer.invoke('tether:copyClip', id),
  sendClip: (id) => ipcRenderer.invoke('tether:sendClip', id),
  pasteToPhone: () => ipcRenderer.invoke('tether:pasteToPhone'),
  clearClips: () => ipcRenderer.invoke('tether:clearClips'),
  setClipSettings: (s) => ipcRenderer.invoke('tether:setClipSettings', s),
  screenshot: () => ipcRenderer.invoke('tether:screenshot'),
  screenOff: () => ipcRenderer.invoke('tether:screenOff'),
  saveRecording: (data) => ipcRenderer.invoke('tether:saveRecording', data),
  pilotAnswer: (id, yes, text) => ipcRenderer.invoke('tether:pilotAnswer', id, yes, text),
  pilotAskSends: (on) => ipcRenderer.invoke('tether:pilotAskSends', on),
  pilotStop: () => ipcRenderer.invoke('tether:pilotStop'),
  pilotConnect: () => ipcRenderer.invoke('tether:pilotConnect'),
  pilotDisconnect: () => ipcRenderer.invoke('tether:pilotDisconnect'),
}

contextBridge.exposeInMainWorld('tether', api)
