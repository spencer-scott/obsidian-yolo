import { Editor } from 'obsidian'
import React, { useState } from 'react'

import { useLanguage } from '../../contexts/language-context'
import { usePlugin } from '../../contexts/plugin-context'
import YoloPlugin from '../../main'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextArea } from '../common/ObsidianTextArea'
import { ReactFloatingPanel } from '../common/ReactFloatingPanel'

export type CustomRewritePanelProps = {
  editor: Editor
  selectedText?: string
  selectionFrom?: { line: number; ch: number }
}

function CustomRewritePanelBody({
  editor,
  selectedText,
  selectionFrom,
  onClose,
}: CustomRewritePanelProps & { onClose: () => void }) {
  const plugin = usePlugin()
  const { t } = useLanguage()
  const [instruction, setInstruction] = useState('')

  const handleConfirm = () => {
    onClose()
    void plugin
      .customRewrite(
        editor,
        instruction.trim().length > 0 ? instruction : undefined,
        selectedText,
        selectionFrom,
      )
      .catch((error) => {
        console.error('[YOLO] Failed to trigger custom rewrite:', error)
      })
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault()
      // Shift+Enter to confirm
      handleConfirm()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    // Enter defaults to newline, keep original behavior (do not intercept)
  }

  return (
    <>
      {/* Input area fills remaining space */}
      <div className="yolo-instruction-editor-container">
        <ObsidianTextArea
          value={instruction}
          placeholder={t('chat.customRewritePromptPlaceholder') ?? ''}
          onChange={(v) => setInstruction(v)}
          inputClassName="yolo-instruction-textarea"
          autoFocus
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Bottom lightweight toolbar */}
      <ObsidianSetting>
        <ObsidianButton
          text={t('common.confirm')}
          onClick={handleConfirm}
          cta
        />
        <ObsidianButton text={t('common.cancel')} onClick={onClose} />
      </ObsidianSetting>
    </>
  )
}

export class CustomRewritePanel {
  private panel: ReactFloatingPanel<CustomRewritePanelProps>

  constructor({
    plugin,
    editor,
    position,
    selectedText,
    selectionFrom,
  }: {
    plugin: YoloPlugin
    editor: Editor
    position?: { x: number; y: number }
    selectedText?: string
    selectionFrom?: { line: number; ch: number }
  }) {
    this.panel = new ReactFloatingPanel<CustomRewritePanelProps>({
      Component: CustomRewritePanelBody,
      props: { editor, selectedText, selectionFrom },
      plugin,
      options: {
        title: plugin.t('commands.customRewrite'),
        initialPosition: position,
        closeOnEscape: true,
        closeOnOutsideClick: true,
        width: 420,
        height: 260,
        minimal: true,
      },
    })
  }

  open() {
    this.panel.open()
  }

  close() {
    this.panel.close()
  }
}
