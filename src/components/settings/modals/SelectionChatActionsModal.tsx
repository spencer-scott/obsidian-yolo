import { App } from 'obsidian'
import React from 'react'

import { SettingsProvider } from '../../../contexts/settings-context'
import YoloPlugin from '../../../main'
import { ReactModal } from '../../common/ReactModal'
import { SelectionChatActionsSettingsContent } from '../SelectionChatActionsSettings'

type SelectionChatActionsModalComponentProps = {
  plugin: YoloPlugin
}

export class SelectionChatActionsModal extends ReactModal<SelectionChatActionsModalComponentProps> {
  constructor(app: App, plugin: YoloPlugin) {
    super({
      app: app,
      Component: SelectionChatActionsModalComponentWrapper,
      props: { plugin },
      options: {
        title: plugin.t(
          'settings.selectionChat.quickActionsTitle',
          'Cursor Chat quick actions',
        ),
      },
      plugin: plugin,
    })
    this.modalEl.classList.add('yolo-modal--wide')
  }
}

function SelectionChatActionsModalComponentWrapper({
  plugin,
  onClose: _onClose,
}: SelectionChatActionsModalComponentProps & { onClose: () => void }) {
  return (
    <SettingsProvider
      settings={plugin.settings}
      setSettings={(newSettings) => plugin.setSettings(newSettings)}
      addSettingsChangeListener={(listener) =>
        plugin.addSettingsChangeListener(listener)
      }
    >
      <SelectionChatActionsSettingsContent />
    </SettingsProvider>
  )
}
