import { beforeEach, describe, expect, it, vi } from 'vitest'
import { run } from '../src/run'
import { ICON_JAR, parseIcons, readIcons } from '../src/icons'

vi.mock('../src/run', () => ({ run: vi.fn() }))

describe('parseIcons', () => {
  it('reads "<package> <base64 png>" lines, "-" = no icon, ignores anything else (CRLF)', () => {
    const out = 'com.whatsapp aGVsbG8=\r\ncom.example.gone -\r\ncom.example.gone: NameNotFoundException\r\n\r\n'
    expect(parseIcons(out)).toEqual({ 'com.whatsapp': Buffer.from('hello'), 'com.example.gone': null })
  })
})

describe('readIcons', () => {
  beforeEach(() => vi.mocked(run).mockReset())

  it('pushes the helper, runs it with app_process for the packages, then removes it', async () => {
    vi.mocked(run).mockResolvedValue({ code: 0, stdout: 'com.whatsapp aGk=\n', stderr: '' })
    const icons = await readIcons('adb', 'X', 'C:/res/tether-icons.jar', ['com.whatsapp'])
    expect(icons).toEqual({ 'com.whatsapp': Buffer.from('hi') })
    const calls = vi.mocked(run).mock.calls.map((c) => c[1])
    expect(calls[0]).toEqual(['-s', 'X', 'push', 'C:/res/tether-icons.jar', ICON_JAR])
    expect(calls[1]).toEqual(['-s', 'X', 'shell', `CLASSPATH=${ICON_JAR} app_process / IconDump 96 com.whatsapp`])
    expect(calls[2]).toEqual(['-s', 'X', 'shell', 'rm', '-f', ICON_JAR])
  })

  it('refuses bad serials and package names before calling adb (rule 7)', async () => {
    await expect(readIcons('adb', 'x;rm', 'j', ['com.a'])).rejects.toThrow()
    await expect(readIcons('adb', 'X', 'j', ['com.a; reboot'])).rejects.toThrow()
    expect(run).not.toHaveBeenCalled()
  })

  it('removes the helper even when it fails', async () => {
    vi.mocked(run).mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'app_process: boom' })
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
    await expect(readIcons('adb', 'X', 'j', ['com.a'])).rejects.toThrow(/boom/)
    expect(vi.mocked(run).mock.calls[2][1]).toEqual(['-s', 'X', 'shell', 'rm', '-f', ICON_JAR])
  })
})
