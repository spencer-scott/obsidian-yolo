import { Platform } from 'obsidian'

/**
 * Opens a URL in the user's system default browser, bypassing the global
 * `window.open` hijack installed by Obsidian's "Web viewer" core plugin or by
 * third-party browser plugins (such as Surfing).
 *
 * On desktop this hands the URL straight to the OS via Electron's
 * `shell.openExternal`. Mobile has no Electron, so it falls back to
 * `window.open` (Obsidian itself routes that to the system browser).
 */
export function openExternalLink(url: string): void {
  if (Platform.isDesktopApp) {
    try {
      // `electron` is a global require injected by the Obsidian desktop runtime.
      // esbuild.config.mjs marks it external, so it never enters the mobile bundle.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- desktop-only runtime API injected by Obsidian
      const { shell } = require('electron') as {
        shell: { openExternal: (url: string) => Promise<void> }
      }
      void shell.openExternal(url)
      return
    } catch {
      // Fallback when Electron is unavailable; desktop should never reach here.
    }
  }
  window.open(url, '_blank')
}
