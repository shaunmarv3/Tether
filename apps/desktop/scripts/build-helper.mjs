// Dev-only: compile helper/IconDump.java into resources/tether-icons.jar (a dex the phone runs with app_process).
// Needs a JDK (javac) and the Android SDK (platforms/android-35 + build-tools/35.0.0); users get the built jar.
// Run: node apps/desktop/scripts/build-helper.mjs
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sdk = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
const androidJar = join(sdk, 'platforms', 'android-35', 'android.jar')
const d8 = join(sdk, 'build-tools', '35.0.0', 'lib', 'd8.jar') // run with java: d8.bat breaks on paths with spaces
const work = mkdtempSync(join(tmpdir(), 'tether-helper-'))
try {
  execFileSync('javac', ['--release', '11', '-cp', androidJar, '-d', work, join(here, '../helper/IconDump.java')], { stdio: 'inherit' })
  execFileSync('java', ['-cp', d8, 'com.android.tools.r8.D8', '--release', '--min-api', '26', '--lib', androidJar, '--output', join(work, 'out.jar'), join(work, 'IconDump.class')],
    { stdio: 'inherit' })
  copyFileSync(join(work, 'out.jar'), join(here, '../resources/tether-icons.jar'))
  console.log('wrote resources/tether-icons.jar')
} finally {
  rmSync(work, { recursive: true, force: true })
}
