import { $insertDataTransferForPlainText } from '@lexical/clipboard'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  PASTE_COMMAND,
} from 'lexical'
import { useEffect } from 'react'

export default function PlainTextPastePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent)) return false
        const clipboardData = event.clipboardData
        if (!clipboardData) return false

        if (
          clipboardData.files.length > 0 ||
          Array.from(clipboardData.items).some((item) => item.kind === 'file')
        ) {
          return false
        }

        // Internal Lexical copy: let the default handler use the application/x-lexical-editor channel to preserve mention/skill nodes
        if (clipboardData.types.includes('application/x-lexical-editor')) {
          return false
        }
        // Edge case: x-lexical-editor is stripped but HTML still has mention/skill custom attributes — hand off to the default handler's HTML fallback
        const html = clipboardData.getData('text/html')
        if (
          html &&
          (html.includes('data-lexical-mention') ||
            html.includes('data-lexical-skill'))
        ) {
          return false
        }

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        event.preventDefault()
        $insertDataTransferForPlainText(clipboardData, selection)
        return true
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor])

  return null
}
