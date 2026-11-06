// Strings from main/core can arrive in capitals ("NO PHONE · PLUG IN A USB CABLE").
// The UI is sentence case everywhere, so all-caps strings are turned into a sentence.
const KEEP: Record<string, string> = Object.fromEntries(
  ['USB', 'PC', 'AI', 'APK', 'APKs', 'ADB', 'OK', 'SD', 'PIN', 'ID', 'Tether', 'Wi-Fi', 'MB', 'GB', 'KB', 'MS', 'FPS', 'OTP']
    .map((w) => [w.toLowerCase(), w]),
)

export function sentence(s: string): string {
  if (/[a-z]/.test(s)) return s
  const low = s.toLowerCase().replace(/[a-z]+(?:-[a-z]+)*/g, (w) => KEEP[w] ?? w)
  return low.replace(/[a-zA-Z]/, (c) => c.toUpperCase())
}
