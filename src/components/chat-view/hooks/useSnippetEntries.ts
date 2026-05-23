import { TAbstractFile } from 'obsidian'
import { useEffect, useRef, useState } from 'react'

import { useApp } from '../../../contexts/app-context'
import { useSettings } from '../../../contexts/settings-context'
import { getYoloSnippetsPath } from '../../../core/paths/yoloPaths'
import {
  SnippetEntry,
  loadSnippetEntries,
} from '../../../core/snippets/snippetsManager'

/**
 * Async-loaded snippet list. Re-reads when `YOLO/snippets.md` is created,
 * modified, deleted, or renamed.
 */
export function useSnippetEntries(): SnippetEntry[] {
  const app = useApp()
  const { settings } = useSettings()
  const [entries, setEntries] = useState<SnippetEntry[]>([])
  const requestIdRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const snippetsPath = getYoloSnippetsPath(settings)

    const refresh = () => {
      // Each refresh bumps the request id. Only the latest in-flight load is
      // allowed to write into state, so out-of-order resolutions from rapid
      // file changes cannot overwrite newer results with stale ones.
      const id = ++requestIdRef.current
      loadSnippetEntries(app, { settings })
        .then((loaded) => {
          if (cancelled || id !== requestIdRef.current) return
          setEntries(loaded)
        })
        .catch((error) => {
          if (cancelled || id !== requestIdRef.current) return
          console.error('Failed to load YOLO snippets:', error)
          setEntries([])
        })
    }

    refresh()

    const matchesSnippetsFile = (file: TAbstractFile, oldPath?: string) => {
      return file.path === snippetsPath || oldPath === snippetsPath
    }

    const onCreate = (file: TAbstractFile) => {
      if (matchesSnippetsFile(file)) refresh()
    }
    const onModify = (file: TAbstractFile) => {
      if (matchesSnippetsFile(file)) refresh()
    }
    const onDelete = (file: TAbstractFile) => {
      if (matchesSnippetsFile(file)) refresh()
    }
    const onRename = (file: TAbstractFile, oldPath: string) => {
      if (matchesSnippetsFile(file, oldPath)) refresh()
    }

    app.vault.on('create', onCreate)
    app.vault.on('modify', onModify)
    app.vault.on('delete', onDelete)
    app.vault.on('rename', onRename)

    return () => {
      cancelled = true
      app.vault.off('create', onCreate)
      app.vault.off('modify', onModify)
      app.vault.off('delete', onDelete)
      app.vault.off('rename', onRename)
    }
  }, [app, settings])

  return entries
}
