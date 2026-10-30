// Phone sound: raw 16-bit stereo PCM at 48 kHz from the audio stream, played as it arrives.
import { tether } from './tether'

let tap: MediaStreamAudioDestinationNode | null = null

// The same sound as a MediaStream, for recording the Mirror page. Null while no audio is playing.
export const phoneAudioStream = (): MediaStream | null => tap?.stream ?? null

export function playPhoneAudio(): () => void {
  const ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
  const out = ctx.createMediaStreamDestination()
  tap = out
  let cursor = 0
  const off = tether.onAudio((pcm) => {
    const frames = Math.floor(pcm.byteLength / 4)
    if (!frames) return
    if (ctx.state === 'suspended') void ctx.resume()
    const buf = ctx.createBuffer(2, frames, 48000)
    const data = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    const left = buf.getChannelData(0)
    const right = buf.getChannelData(1)
    for (let i = 0; i < frames; i++) {
      left[i] = data.getInt16(i * 4, true) / 32768
      right[i] = data.getInt16(i * 4 + 2, true) / 32768
    }
    // Small cushion against gaps; if sound falls too far behind, jump back to live.
    const now = ctx.currentTime
    if (cursor < now + 0.02 || cursor > now + 0.25) cursor = now + 0.04
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.connect(out)
    src.start(cursor)
    cursor += buf.duration
  })
  return () => {
    off()
    if (tap === out) tap = null
    void ctx.close()
  }
}
