import { App } from 'obsidian'

import { ReactModal } from '../common/ReactModal'

export type ConfirmModalOptions = {
  title: string
  message: string
  ctaText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
}

type ConfirmModalComponentProps = {
  message: string
  ctaText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel?: () => void
}

export class ConfirmModal extends ReactModal<ConfirmModalComponentProps> {
  constructor(app: App, options: ConfirmModalOptions) {
    super({
      app: app,
      Component: ConfirmModalComponent,
      props: {
        message: options.message,
        ctaText: options.ctaText,
        cancelText: options.cancelText,
        onConfirm: options.onConfirm,
        onCancel: options.onCancel,
      },
      options: {
        title: options.title,
      },
    })
  }
}

function ConfirmModalComponent({
  message,
  ctaText,
  cancelText,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmModalComponentProps & { onClose: () => void }) {
  return (
    <div>
      <div className="yolo-prewrap">{message}</div>
      <div className="modal-button-container">
        <button
          className="mod-warning"
          onClick={() => {
            try {
              onConfirm()
            } finally {
              onClose()
            }
          }}
        >
          {ctaText ?? 'Confirm'}
        </button>
        <button
          className="mod-cancel"
          onClick={() => {
            try {
              onCancel?.()
            } finally {
              onClose()
            }
          }}
        >
          {cancelText ?? 'Cancel'}
        </button>
      </div>
    </div>
  )
}
