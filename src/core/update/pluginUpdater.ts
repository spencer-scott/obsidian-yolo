import {
  App,
  FileSystemAdapter,
  Platform,
  apiVersion,
  normalizePath,
  requestUrl,
  type DataAdapter,
} from 'obsidian'

import type YoloPlugin from '../../main'

import {
  compareVersions,
  normalizePluginVersion,
  type ReleaseAssetUrls,
} from './updateChecker'

const STAGING_ROOT = '.yolo-update-staging'

const RELEASE_FILES = {
  mainJs: 'main.js',
  manifestJson: 'manifest.json',
  stylesCss: 'styles.css',
} as const

type StagedManifest = {
  version: string
  minAppVersion: string
}

export type PluginUpdateState =
  | { status: 'idle' }
  | { status: 'downloading'; version: string; progress: number }
  | { status: 'ready'; version: string }
  | { status: 'applying'; version: string }
  | { status: 'error'; version: string; message: string }

export type StagingStatus =
  | { ready: false }
  | { ready: true; version: string; minAppVersion: string }

export type ApplyStagedUpdateResult =
  | { ok: true }
  | { ok: false; reason: 'not_ready' | 'min_app_version' | 'write_failed' }

export function canSelfUpdate(plugin: YoloPlugin): boolean {
  if (!Platform.isDesktop) {
    return false
  }
  const adapter = plugin.app.vault.adapter
  if (!(adapter instanceof FileSystemAdapter)) {
    return false
  }
  return Boolean(plugin.manifest.dir)
}

export function getStagingDir(pluginDir: string, version: string): string {
  return normalizePath(`${pluginDir}/${STAGING_ROOT}/${version}`)
}

export function getStagingRoot(pluginDir: string): string {
  return normalizePath(`${pluginDir}/${STAGING_ROOT}`)
}

function parseStagedManifest(raw: string): StagedManifest | null {
  try {
    const parsed = JSON.parse(raw) as {
      version?: unknown
      minAppVersion?: unknown
    }
    const version =
      typeof parsed.version === 'string' ? parsed.version.trim() : ''
    const minAppVersion =
      typeof parsed.minAppVersion === 'string'
        ? parsed.minAppVersion.trim()
        : ''
    if (!version) {
      return null
    }
    return { version, minAppVersion }
  } catch {
    return null
  }
}

export function meetsMinAppVersion(
  appVersion: string | undefined,
  minAppVersion: string,
): boolean {
  if (!minAppVersion) {
    return true
  }
  if (!appVersion) {
    return true
  }
  return !compareVersions(appVersion, minAppVersion)
}

export async function getStagingStatus(
  adapter: DataAdapter,
  stagingDir: string,
  expectedVersion?: string,
): Promise<StagingStatus> {
  const mainPath = normalizePath(`${stagingDir}/${RELEASE_FILES.mainJs}`)
  const manifestPath = normalizePath(
    `${stagingDir}/${RELEASE_FILES.manifestJson}`,
  )
  const stylesPath = normalizePath(`${stagingDir}/${RELEASE_FILES.stylesCss}`)

  if (
    !(await adapter.exists(mainPath)) ||
    !(await adapter.exists(manifestPath)) ||
    !(await adapter.exists(stylesPath))
  ) {
    return { ready: false }
  }

  const manifestRaw = await adapter.read(manifestPath)
  const manifest = parseStagedManifest(manifestRaw)
  if (!manifest) {
    return { ready: false }
  }

  const normalized = normalizePluginVersion(manifest.version)
  if (expectedVersion && normalized !== normalizePluginVersion(expectedVersion)) {
    return { ready: false }
  }

  return {
    ready: true,
    version: normalized,
    minAppVersion: manifest.minAppVersion,
  }
}

async function ensureDir(adapter: DataAdapter, dir: string): Promise<void> {
  if (!(await adapter.exists(dir))) {
    await adapter.mkdir(dir)
  }
}

async function removeStagingDir(
  adapter: DataAdapter,
  stagingDir: string,
): Promise<void> {
  if (await adapter.exists(stagingDir)) {
    await adapter.rmdir(stagingDir, true)
  }
}

/** Removes the entire update staging tree so only one release is kept at a time. */
export async function clearStagingRoot(
  adapter: DataAdapter,
  pluginDir: string,
): Promise<void> {
  await removeStagingDir(adapter, getStagingRoot(pluginDir))
}

async function downloadBinary(
  url: string,
): Promise<ArrayBuffer> {
  const response = await requestUrl({ url, method: 'GET' })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Download failed (${response.status})`)
  }
  return response.arrayBuffer
}

async function downloadText(url: string): Promise<string> {
  const response = await requestUrl({ url, method: 'GET' })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Download failed (${response.status})`)
  }
  return response.text
}

export async function downloadReleaseToStaging(params: {
  adapter: DataAdapter
  pluginDir: string
  version: string
  assets: ReleaseAssetUrls
  onProgress?: (progress: number) => void
}): Promise<void> {
  const { adapter, pluginDir, version, assets, onProgress } = params
  const stagingDir = getStagingDir(pluginDir, version)

  await clearStagingRoot(adapter, pluginDir)
  await ensureDir(adapter, stagingDir)

  try {
    onProgress?.(0)
    const mainBuffer = await downloadBinary(assets.mainJs)
    await adapter.writeBinary(
      normalizePath(`${stagingDir}/${RELEASE_FILES.mainJs}`),
      mainBuffer,
    )
    onProgress?.(60)

    const stylesText = await downloadText(assets.stylesCss)
    await adapter.write(
      normalizePath(`${stagingDir}/${RELEASE_FILES.stylesCss}`),
      stylesText,
    )
    onProgress?.(80)

    const manifestText = await downloadText(assets.manifestJson)
    await adapter.write(
      normalizePath(`${stagingDir}/${RELEASE_FILES.manifestJson}`),
      manifestText,
    )
    onProgress?.(100)

    const status = await getStagingStatus(adapter, stagingDir, version)
    if (!status.ready) {
      throw new Error('Staged release failed integrity check')
    }
  } catch (error) {
    await clearStagingRoot(adapter, pluginDir)
    throw error
  }
}

async function copyStagedFile(
  adapter: DataAdapter,
  stagingDir: string,
  pluginDir: string,
  fileName: string,
  binary: boolean,
): Promise<void> {
  const source = normalizePath(`${stagingDir}/${fileName}`)
  const target = normalizePath(`${pluginDir}/${fileName}`)
  if (binary) {
    const content = await adapter.readBinary(source)
    await adapter.writeBinary(target, content)
    return
  }
  const content = await adapter.read(source)
  await adapter.write(target, content)
}

export async function applyStagedUpdate(
  app: App,
  plugin: YoloPlugin,
  version: string,
): Promise<ApplyStagedUpdateResult> {
  const pluginDir = plugin.manifest.dir
  if (!pluginDir) {
    return { ok: false, reason: 'write_failed' }
  }

  const adapter = app.vault.adapter
  const stagingDir = getStagingDir(pluginDir, version)
  const status = await getStagingStatus(adapter, stagingDir, version)
  if (!status.ready) {
    return { ok: false, reason: 'not_ready' }
  }

  if (
    status.minAppVersion &&
    !meetsMinAppVersion(apiVersion, status.minAppVersion)
  ) {
    return { ok: false, reason: 'min_app_version' }
  }

  try {
    await copyStagedFile(
      adapter,
      stagingDir,
      pluginDir,
      RELEASE_FILES.mainJs,
      true,
    )
    await copyStagedFile(
      adapter,
      stagingDir,
      pluginDir,
      RELEASE_FILES.stylesCss,
      false,
    )
    await copyStagedFile(
      adapter,
      stagingDir,
      pluginDir,
      RELEASE_FILES.manifestJson,
      false,
    )
  } catch {
    return { ok: false, reason: 'write_failed' }
  }

  await clearStagingRoot(adapter, pluginDir)

  // Reload the whole app so Obsidian loads the newly written plugin files.
  // Do not disable/enable from inside the plugin being replaced: disablePlugin
  // unloads this code before the async chain finishes and leaves the update
  // toast stuck on "Installing…".
  window.location.reload()

  return { ok: true }
}
