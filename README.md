# Tether

**Your Android phone, inside your Windows PC.**

Tether is a Windows tray app that mirrors and controls your Android phone over
a USB cable. It's like AnyDesk for your own phone: the phone sits at full height
beside your pages, every phone app can open in its own PC window, and files and
clipboard are shared both ways.

---

## Install

1. Download **`Tether-Setup-<version>.exe`** from this repo's
   [Releases](../../releases) page, or build it yourself (see
   [Build from source](#build-from-source)).
2. Run it and click **Next**. It installs for your Windows user only, so no admin prompt.
   The installer is not code-signed, so Windows SmartScreen warns the first
   time: click **More info → Run anyway**.
3. Tether opens and walks you through first run:
   1. **Set a password** (8+ characters). You type it every time Tether opens
      (you can turn that off on the Security page).
   2. **Download the engine:** scrcpy + adb from scrcpy's official GitHub
      release (~11 MB, once). Its SHA-256 is checked before anything runs.
   3. **Connect your phone** over USB (see [Phone setup](#phone-setup-one-time)),
      then click **Trust this phone**.

Tether lives in the system tray. Closing the window keeps it running; quit it
from the tray icon.

### Uninstall

**Settings → Apps → Installed apps → Tether → Uninstall.** Your data in
`%LOCALAPPDATA%\Tether` (password, trusted phones, layouts, the engine) is
kept. Delete that folder to remove it too.

---

## How it works

Tether is a single app on the PC. **Nothing gets installed on the phone.** It
builds on [scrcpy](https://github.com/Genymobile/scrcpy) and Android's own
`adb`, and shows the phone screen inside its own windows. App icons come from a
tiny helper (`apps/desktop/helper/IconDump.java`) that runs once with
`app_process`, like scrcpy's server, and is removed right after; the icons are
kept on the PC.

```
Windows PC                                  Android phone
┌──────────────────────────────┐            ┌─────────────────────────┐
│ Tether (Electron tray app)   │            │ adbd (built into        │
│   └─ @tether/core            │    USB     │ Android)                │
│        ├─ adb  ──────────────┼────────────┼─ scrcpy-server (pushed │
│        └─ scrcpy client ─────┤            │   per session, removed  │
└──────────────────────────────┘            │   afterwards)           │
                                            └─────────────────────────┘
```

## AI pilot (Claude Code)

Tether can let [Claude Code](https://claude.com/claude-code) use your phone: open
**AI Pilot** and click **Connect Claude Code**, then ask Claude Code for a phone
task (for example "reply to Mom on WhatsApp: on my way"). The rules live in
Tether, not in the AI:

- Nothing happens until you **Allow** a plan, and only the apps in it can be used.
- Sends and reactions show who and what first (you can edit the message); a
  wrong chat stops the task. A switch lets sends to the planned chat skip the popup.
- Deletes, installs, settings and system panels ask you; lock screens wait for
  you to unlock them; money apps and payment buttons are always blocked.
- **Stop** at any time (Ctrl+Alt+X, or Stop in the title bar). Locking Tether or unplugging the phone stops it too.

Text Claude reads from the phone goes to Anthropic like the rest of your Claude Code chat.

## Requirements

- **PC:** Windows 10/11, 64-bit
- **Phone:** Android 5.0+ (Android 11+ for phone audio)
- USB debugging enabled on the phone (see below)

## Phone setup (one time)

1. **Settings → About phone → tap "Build number" 7 times** to unlock Developer options.
2. **Developer options → USB debugging: ON.**
3. Plug the phone in, tick **"Always allow from this computer"** and accept **"Allow USB debugging?"**
4. *Optional:* Android 11+ forgets a PC after 7 days without a connection. To keep this PC trusted, turn on
   **Developer options → "Disable adb authorization timeout"** (Tether's Security page can do it for you).
   The other side: a stolen PC then stays trusted until you tap "Revoke USB debugging authorisations".
5. *Xiaomi / Redmi / POCO:* also turn on **"USB debugging (Security settings)"**, then reboot.

## Security

- Every PC has to be approved on the phone before it can connect.
- Tether only shows or controls phones you trusted in Tether.
- USB only. Nothing listens on the internet.
- The app is protected by a password (8+ characters) and locks when Windows locks or the PC sits idle.
  You can turn the password off; Windows lock and idle still close the phone windows and stop the AI.
- A one-click **Lockdown** button disconnects everything.

## Project layout

```
apps/desktop     Electron tray app (UI)
packages/core    device manager · adb wrapper · scrcpy client · AI pilot guard
packages/mcp     tether-mcp: the phone tools Claude Code sees (talks only to the running Tether)
```

## Build from source

Requires Node.js 22+.

```bash
npm ci          # install exactly what package-lock.json lists
npm run dev     # run Tether from source
npm test        # core tests
npm run dist    # installer → apps/desktop/release/Tether-Setup-<version>.exe
```

The icon helper ships prebuilt (`apps/desktop/resources/tether-icons.jar`). To rebuild it you need a JDK and the
Android SDK (platform 35 + build-tools 35.0.0): `node apps/desktop/scripts/build-helper.mjs`.

## Credits

Built on [scrcpy](https://github.com/Genymobile/scrcpy) by Genymobile
(Apache 2.0) and Android platform-tools.
