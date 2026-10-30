import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it, vi } from 'vitest'
import { mirrorArgs, Sessions } from '../src/sessions'

const engine = { adb: 'C:\e\adb.exe', scrcpy: 'C:\e\scrcpy.exe' }

function fakeSpawn() {
  const children: (EventEmitter & { stderr: EventEmitter; kill: ReturnType<typeof vi.fn> })[] = []
  const fn = vi.fn(() => {
    const c = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() })
    children.push(c)
    return c as unknown as ChildProcess
  })
  return { fn, children }
}

describe('mirrorArgs', () => {
  it('builds the mirror flags', () => {
    expect(mirrorArgs('A1B2', 'CMF Phone 1')).toEqual(['-s', 'A1B2', '--turn-screen-off', '--keep-active', '--window-title=CMF Phone 1'])
  })
  it('throws on a bad serial', () => {
    expect(() => mirrorArgs('a;b', 'x')).toThrow()
  })
})

describe('Sessions', () => {
  it('openMirror twice spawns once, with our adb', () => {
    const { fn } = fakeSpawn()
    const s = new Sessions(fn)
    s.openMirror(engine, 'A1B2', 'Phone')
    s.openMirror(engine, 'A1B2', 'Phone')
    expect(fn).toHaveBeenCalledTimes(1)
    const [bin, , opts] = fn.mock.calls[0] as unknown as [string, string[], { env: NodeJS.ProcessEnv }]
    expect(bin).toBe(engine.scrcpy)
    expect(opts.env.ADB).toBe(engine.adb)
    expect(s.isOpen('A1B2')).toBe(true)
  })

  it('exit clears state', () => {
    const { fn, children } = fakeSpawn()
    const s = new Sessions(fn)
    const change = vi.fn()
    s.on('change', change)
    s.openMirror(engine, 'A1B2', 'Phone')
    children[0].emit('exit', 0)
    expect(s.isOpen('A1B2')).toBe(false)
    expect(change).toHaveBeenCalled()
    expect(s.lastError).toBeNull()
  })

  it('failed exit keeps the error', () => {
    const { fn, children } = fakeSpawn()
    const s = new Sessions(fn)
    s.openMirror(engine, 'A1B2', 'Phone')
    children[0].stderr.emit('data', Buffer.from('INFO: hi\nERROR: Could not open video stream\n'))
    children[0].emit('exit', 1)
    expect(s.lastError).toBe('ERROR: Could not open video stream')
  })

  it('closeAll kills every child', () => {
    const { fn, children } = fakeSpawn()
    const s = new Sessions(fn)
    s.openMirror(engine, 'A', 'Phone')
    s.openMirror(engine, 'B', 'Phone')
    s.closeAll()
    expect(children.every((c) => c.kill.mock.calls.length === 1)).toBe(true)
  })

  it('closeAll returns the count and its kills are not errors', () => {
    const { fn, children } = fakeSpawn()
    const s = new Sessions(fn)
    s.openMirror(engine, 'A', 'Phone')
    expect(s.closeAll()).toBe(1)
    children[0].emit('exit', 1)
    expect(s.isOpen('A')).toBe(false)
    expect(s.lastError).toBeNull()
  })

  it('a crash without closeAll still sets the error', () => {
    const { fn, children } = fakeSpawn()
    const s = new Sessions(fn)
    s.openMirror(engine, 'A', 'Phone')
    children[0].emit('exit', 1)
    expect(s.lastError).toBe('scrcpy exited with code 1')
  })
})

describe('Sessions errors', () => {
  it('spawn error is caught and reported', () => {
    const { fn, children } = fakeSpawn()
    const s = new Sessions(fn)
    s.openMirror(engine, 'A', 'Phone')
    expect(() => children[0].emit('error', new Error('spawn ENOENT'))).not.toThrow()
    expect(s.isOpen('A')).toBe(false)
    expect(s.lastError).toBe('spawn ENOENT')
  })
})
