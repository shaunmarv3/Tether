import { beforeEach, describe, expect, it, vi } from 'vitest'
import { run, runToFile } from '../src/run'
import { countPlaces, installApk, isDevicePath, listDir, makeDir, parseLs, pullFiles, pushFiles, removeFiles, screenshot, sdCards, shq } from '../src/files'

vi.mock('../src/run', () => ({ run: vi.fn(), runToFile: vi.fn() }))

// Real CMF Phone 1 / Android 16 toybox output (names anonymized, columns kept), CRLF from adb shell.
const crlf = (s: string) => s.replace(/\n/g, '\r\n') + '\r\n'
const LS_SDCARD = crlf(`total 80
drwxrws--x  5 media_rw media_rw  3452 2024-07-25 13:29 Android
drwxrws---  7 u0_a205  media_rw  3452 2026-04-26 14:28 DCIM
drwxrws--- 12 u0_a205  media_rw 20480 2026-10-30 15:35 Download
drwxrws---  2 u0_a205  media_rw  3452 2025-03-12 10:12 Comics\x20
-rw-rw----  1 u0_a205  media_rw  9389 2026-10-11 12:07 ui.xml`)
const LS_DOWNLOAD = crlf(`total 304746
-rw-rw---- 1 u0_a205 media_rw       32 2025-01-28 09:54 .cfg1.data
-rwxrwx--- 1 u0_a205 media_rw   143489 2024-09-20 10:23 1) Time Table - Sem 1.pdf
drwxrwx--- 3 u0_a205 media_rw     3452 2025-04-16 13:57 Notes
-rwxrwx--- 1 u0_a205 media_rw   457842 2025-04-09 09:11 1000039661.jpg`)
const LS_LINK = crlf('lrw-r--r--   1 root   root        21 2009-01-01 05:30 sdcard -> /storage/self/primary')
const LS_MISSING = 'ls: /sdcard/nope: No such file or directory\n' // exit code 1, on stderr

const S = 'R58M1234ABC'
beforeEach(() => vi.mocked(run).mockReset())

describe('shq', () => {
  it('single-quotes for the device shell', () => {
    expect(shq('a b')).toBe("'a b'")
    expect(shq("it's")).toBe("'it'\\''s'")
    expect(shq('$(reboot)')).toBe("'$(reboot)'")
  })
})

describe('isDevicePath', () => {
  it('accepts shared storage paths', () => {
    for (const p of ['/sdcard/', '/sdcard/DCIM/Camera', '/storage/emulated/0/Download/a b.jpg', '/storage/6137-3639/DCIM']) expect(isDevicePath(p), p).toBe(true)
  })
  it('rejects anything else', () => {
    for (const p of ['sdcard/x', '/data/x', '/sdcard/../data', '/sdcard/a\nb', '/sdcard/a\0b', 42, '/sdcardx/y', '/storage/self/x', '/storage/6137-3639']) {
      expect(isDevicePath(p), String(p)).toBe(false)
    }
  })
})

describe('parseLs', () => {
  it('reads dirs, files, sizes and dates; keeps spaces in names', () => {
    expect(parseLs(LS_SDCARD)).toEqual([
      { name: 'Android', dir: true, size: 3452, mtime: '2024-07-25T13:29' },
      { name: 'DCIM', dir: true, size: 3452, mtime: '2026-04-26T14:28' },
      { name: 'Download', dir: true, size: 20480, mtime: '2026-10-30T15:35' },
      { name: 'Comics ', dir: true, size: 3452, mtime: '2025-03-12T10:12' },
      { name: 'ui.xml', dir: false, size: 9389, mtime: '2026-10-11T12:07' },
    ])
    expect(parseLs(LS_DOWNLOAD).map((e) => e.name)).toEqual(['.cfg1.data', '1) Time Table - Sem 1.pdf', 'Notes', '1000039661.jpg'])
  })
  it('names a symlink without its target; skips . and ..', () => {
    expect(parseLs(LS_LINK)).toEqual([{ name: 'sdcard', dir: false, size: 21, mtime: '2009-01-01T05:30' }])
    expect(parseLs(crlf('drwx------ 2 a b 3452 2024-07-25 13:29 .\ndrwx------ 2 a b 3452 2024-07-25 13:29 ..'))).toEqual([])
  })
})

describe('listDir', () => {
  it('quotes the path as one shell string; dirs first', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: LS_DOWNLOAD, stderr: '' })
    const list = await listDir('adb', S, '/sdcard/a b')
    expect(run).toHaveBeenCalledWith('adb', ['-s', S, 'shell', "ls -la '/sdcard/a b'"])
    expect(list.map((e) => e.name)).toEqual(['Notes', '.cfg1.data', '1) Time Table - Sem 1.pdf', '1000039661.jpg'])
  })
  it('a missing folder → FOLDER NOT FOUND', async () => {
    vi.mocked(run).mockResolvedValue({ code: 1, stdout: '', stderr: LS_MISSING })
    await expect(listDir('adb', S, '/sdcard/nope')).rejects.toThrow('FOLDER NOT FOUND')
  })
  it('a bad path never reaches adb', async () => {
    await expect(listDir('adb', S, '/sdcard/../data')).rejects.toThrow()
    await expect(listDir('adb', 'x;y', '/sdcard/')).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })
})

describe('countPlaces', () => {
  it('counts every folder in one call, null when missing', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: crlf('444\n-\n9'), stderr: '' })
    expect(await countPlaces('adb', S, ['/sdcard/DCIM/Camera', '/sdcard/DCIM/Screenshots', '/sdcard/Documents'])).toEqual([444, null, 9])
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('file actions', () => {
  it('removeFiles quotes every path after --', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await removeFiles('adb', S, ['/sdcard/x', "/sdcard/it's"])
    expect(run).toHaveBeenCalledWith('adb', ['-s', S, 'shell', "rm -f -- '/sdcard/x' '/sdcard/it'\\''s'"])
    await expect(removeFiles('adb', S, ['/sdcard/x', '/data/y'])).rejects.toThrow()
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('pushFiles sends one by one, collects failures, dates the sent ones now', async () => {
    vi.mocked(run).mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }).mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'no space' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
    expect(await pushFiles('adb', S, ['C:\\a.jpg', 'C:\\b c.mp4'], '/sdcard/Download')).toEqual({ sent: 1, failed: ['C:\\b c.mp4'] })
    expect(vi.mocked(run).mock.calls[0][1]).toEqual(['-s', S, 'push', 'C:\\a.jpg', '/sdcard/Download/'])
    // adb keeps the PC file's date (touch → shows as new); adb files stay hidden as "pending" until scanned
    expect(vi.mocked(run).mock.calls[2][1]).toEqual(['-s', S, 'shell', "touch -c -- '/sdcard/Download/a.jpg'; " +
      "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file:///storage/emulated/0/Download/a.jpg' >/dev/null"])
  })
  it('pushFiles scans odd names as safe file URIs, SD card paths as they are', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await pushFiles('adb', S, ['C:\\it\'s a #1.jpg'], '/storage/6137-3639/DCIM/')
    expect(vi.mocked(run).mock.calls[1][1][3]).toBe("touch -c -- '/storage/6137-3639/DCIM/it'\\''s a #1.jpg'; " +
      "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file:///storage/6137-3639/DCIM/it'\\''s%20a%20%231.jpg' >/dev/null")
  })
  it('sdCards lists removable volumes only', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '6137-3639\r\nemulated\r\nsdcard0\r\nself\r\n', stderr: '' })
    expect(await sdCards('adb', S)).toEqual(['/storage/6137-3639/'])
    expect(run).toHaveBeenCalledWith('adb', ['-s', S, 'shell', 'ls /storage'])
  })
  it('pullFiles saves into the PC folder', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    expect(await pullFiles('adb', S, ['/sdcard/DCIM/Camera/a.jpg'], 'C:\\Users\\x\\Downloads\\Tether')).toEqual({ saved: 1, failed: [] })
    expect(vi.mocked(run).mock.calls[0][1]).toEqual(['-s', S, 'pull', '/sdcard/DCIM/Camera/a.jpg', 'C:\\Users\\x\\Downloads\\Tether'])
  })
  it('makeDir', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await makeDir('adb', S, '/sdcard/New folder')
    expect(run).toHaveBeenCalledWith('adb', ['-s', S, 'shell', "mkdir '/sdcard/New folder'"])
  })
  it('installApk: Success resolves, Failure [...] rejects with the reason', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: 'Performing Streamed Install\r\nSuccess\r\n', stderr: '' })
    await installApk('adb', S, 'C:\\x.apk')
    expect(vi.mocked(run).mock.calls[0][1]).toEqual(['-s', S, 'install', '-r', 'C:\\x.apk'])
    vi.mocked(run).mockResolvedValue({ code: 1, stdout: '', stderr: 'adb: failed to install C:\\x.apk: Failure [INSTALL_FAILED_VERSION_DOWNGRADE]' })
    await expect(installApk('adb', S, 'C:\\x.apk')).rejects.toThrow('INSTALL FAILED · INSTALL_FAILED_VERSION_DOWNGRADE')
  })
  it('screenshot streams screencap to a file', async () => {
    vi.mocked(runToFile).mockResolvedValue({ code: 0, stderr: '' })
    await screenshot('adb', S, 'C:\\s.png')
    expect(runToFile).toHaveBeenCalledWith('adb', ['-s', S, 'exec-out', 'screencap', '-p'], 'C:\\s.png')
  })
})
