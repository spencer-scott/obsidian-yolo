import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import React, { useMemo, useState } from 'react'

import { useLanguage } from '../../contexts/language-context'
import { usePlugin } from '../../contexts/plugin-context'
import { useSettings } from '../../contexts/settings-context'
import { ObsidianButton } from '../common/ObsidianButton'
import { ObsidianDropdown } from '../common/ObsidianDropdown'
import { ObsidianSetting } from '../common/ObsidianSetting'
import { ObsidianTextArea } from '../common/ObsidianTextArea'
import { ObsidianTextInput } from '../common/ObsidianTextInput'
import { ConfirmModal } from '../modals/ConfirmModal'

import { SelectionChatActionsModal } from './modals/SelectionChatActionsModal'

type SelectionChatAction = {
  id: string
  label: string
  instruction: string
  enabled: boolean
  mode?: SelectionChatActionMode
  rewriteBehavior?: SelectionChatActionRewriteBehavior
  assistantId?: string
}

// Sentinel for the "follow current selection" option in the assistant dropdown.
// Maps to `assistantId === undefined` when persisted.
const FOLLOW_CURRENT_ASSISTANT_VALUE = '__follow_current__'

type SelectionChatActionMode = 'ask' | 'rewrite' | 'chat-input' | 'chat-send'
type SelectionChatActionRewriteBehavior = 'custom' | 'preset'

type TranslateFn = (key: string, fallback?: string) => string

type DefaultActionConfig = {
  id: string
  labelKey: string
  labelFallback: string
  mode?: SelectionChatActionMode
  rewriteBehavior?: SelectionChatActionRewriteBehavior
  allowEmptyInstruction?: boolean
}

const DEFAULT_ACTION_CONFIGS: DefaultActionConfig[] = [
  {
    id: 'explain',
    labelKey: 'selection.actions.explain',
    labelFallback: 'Explain in depth',
    mode: 'ask',
  },
  {
    id: 'suggest',
    labelKey: 'selection.actions.suggest',
    labelFallback: 'Provide suggestions',
    mode: 'ask',
  },
  {
    id: 'translate-to-chinese',
    labelKey: 'selection.actions.translateToChinese',
    labelFallback: 'Translate to Chinese',
    mode: 'ask',
  },
]

const FIXED_ACTION_IDS = new Set(['custom-rewrite'])

const DEFAULT_ACTION_LOOKUP: Record<string, DefaultActionConfig> =
  Object.fromEntries(
    DEFAULT_ACTION_CONFIGS.map((config) => [config.id, config]),
  )

const resolveSelectionActionMode = (
  action: SelectionChatAction,
): SelectionChatActionMode => {
  if (action.mode) return action.mode
  if (action.id === 'rewrite' || action.id === 'custom-rewrite') {
    return 'rewrite'
  }
  if (action.id === 'chat-send') {
    return 'chat-send'
  }
  if (action.id === 'chat-input' || action.id === 'add-to-sidebar') {
    return 'chat-input'
  }
  return 'ask'
}

const resolveRewriteBehavior = (
  action: SelectionChatAction,
  mode: SelectionChatActionMode,
): SelectionChatActionRewriteBehavior | undefined => {
  if (mode !== 'rewrite') return undefined
  if (action.rewriteBehavior) return action.rewriteBehavior
  if (action.id === 'custom-rewrite') return 'custom'
  return 'preset'
}

const normalizeActionMode = (value: string): SelectionChatActionMode => {
  if (value === 'rewrite') return 'rewrite'
  if (value === 'chat-input') return 'chat-input'
  if (value === 'chat-send') return 'chat-send'
  return 'ask'
}

const generateId = () => {
  return `action_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

const getDefaultSelectionChatActions = (
  t: TranslateFn,
): SelectionChatAction[] => {
  return DEFAULT_ACTION_CONFIGS.map((config) => {
    const label = t(config.labelKey, config.labelFallback)
    return {
      id: config.id,
      label,
      instruction: config.allowEmptyInstruction ? '' : label,
      enabled: true,
      mode: config.mode ?? 'ask',
      rewriteBehavior: config.rewriteBehavior,
    }
  })
}

type SelectionChatActionsSettingsProps = {
  variant?: 'settings' | 'composer'
}

export function SelectionChatActionsSettings({
  variant = 'settings',
}: SelectionChatActionsSettingsProps) {
  const plugin = usePlugin()
  const { settings } = useSettings()
  const { t } = useLanguage()
  const selectionChatActions =
    settings.continuationOptions.selectionChatActions ||
    getDefaultSelectionChatActions(t)
  const actionsCountLabel = t(
    'settings.selectionChat.actionsCount',
    '{count} quick commands configured',
  ).replace(
    '{count}',
    String(
      selectionChatActions.filter((action) => !FIXED_ACTION_IDS.has(action.id))
        .length,
    ),
  )
  const handleOpenModal = () => {
    const modal = new SelectionChatActionsModal(plugin.app, plugin)
    modal.open()
  }

  if (variant === 'composer') {
    return (
      <div className="yolo-smart-space-settings">
        <div className="yolo-smart-space-settings-row">
          <div className="yolo-settings-desc">{actionsCountLabel}</div>
          <ObsidianButton
            text={t('settings.selectionChat.configureActions', 'Configure quick commands')}
            onClick={handleOpenModal}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="yolo-smart-space-settings">
      <ObsidianSetting
        name={t(
          'settings.selectionChat.quickActionsTitle',
          'Cursor Chat Quick Commands',
        )}
        desc={t(
          'settings.selectionChat.quickActionsDesc',
          'Customize quick commands and prompts shown after selecting text',
        )}
        className="yolo-settings-card"
      >
        <div className="yolo-settings-desc">{actionsCountLabel}</div>
        <ObsidianButton
          text={t('settings.selectionChat.configureActions', 'Configure quick commands')}
          onClick={handleOpenModal}
        />
      </ObsidianSetting>
    </div>
  )
}

export function SelectionChatActionsSettingsContent() {
  const plugin = usePlugin()
  const { settings, setSettings } = useSettings()
  const { t } = useLanguage()
  const [editingAction, setEditingAction] =
    useState<SelectionChatAction | null>(null)
  const [isAddingAction, setIsAddingAction] = useState(false)
  const actionModeOptions: Record<SelectionChatActionMode, string> = {
    ask: t('settings.selectionChat.actionModeAsk', 'Quick Ask Q&A'),
    rewrite: t('settings.selectionChat.actionModeRewrite', 'Quick Ask Rewrite'),
    'chat-input': t(
      'settings.selectionChat.actionModeChatInput',
      'Add to chat input',
    ),
    'chat-send': t(
      'settings.selectionChat.actionModeChatSend',
      'Add to chat input and send',
    ),
  }
  const actionRewriteTypeOptions: Record<
    SelectionChatActionRewriteBehavior,
    string
  > = {
    custom: t(
      'settings.selectionChat.actionRewriteTypeCustom',
      'Custom instruction (popup input)',
    ),
    preset: t(
      'settings.selectionChat.actionRewriteTypePreset',
      'Preset instruction (generate directly)',
    ),
  }
  const assistantOptions = useMemo<Record<string, string>>(() => {
    const followCurrentLabel = t(
      'settings.selectionChat.actionAssistantFollowCurrent',
      'Follow current selection',
    )
    const options: Record<string, string> = {
      [FOLLOW_CURRENT_ASSISTANT_VALUE]: followCurrentLabel,
    }
    for (const assistant of settings.assistants ?? []) {
      options[assistant.id] = assistant.name || assistant.id
    }
    return options
  }, [settings.assistants, t])
  const resolveAssistantDropdownValue = (value?: string) =>
    value && assistantOptions[value] ? value : FOLLOW_CURRENT_ASSISTANT_VALUE
  const normalizeAssistantDropdownValue = (value: string) =>
    value === FOLLOW_CURRENT_ASSISTANT_VALUE ? undefined : value
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  const selectionChatActions = (
    settings.continuationOptions.selectionChatActions ||
    getDefaultSelectionChatActions(t)
  ).map((action) => {
    const config = DEFAULT_ACTION_LOOKUP[action.id]
    let label = action.label
    let instruction = action.instruction
    const mode = resolveSelectionActionMode(action)
    const rewriteBehavior = resolveRewriteBehavior(action, mode)

    if (config) {
      const localizedLabel = t(config.labelKey, config.labelFallback)
      if (
        label === config.labelFallback ||
        label === localizedLabel ||
        !label
      ) {
        label = localizedLabel
      }
      if (
        (mode !== 'rewrite' || rewriteBehavior === 'preset') &&
        (instruction === config.labelFallback ||
          instruction === localizedLabel ||
          !instruction)
      ) {
        instruction = localizedLabel
      }
    }

    return {
      ...action,
      label,
      instruction,
      enabled: true,
      mode,
      rewriteBehavior,
    }
  })

  const editableActions = selectionChatActions.filter(
    (action: SelectionChatAction) => !FIXED_ACTION_IDS.has(action.id),
  )

  const getInstructionDesc = (mode: SelectionChatActionMode) =>
    mode === 'rewrite'
      ? t(
          'settings.selectionChat.actionInstructionRewriteDesc',
          'Rewrite instruction (required only for “Preset instruction” type)',
        )
      : t('settings.selectionChat.actionInstructionDesc', 'Instruction sent to the AI')

  const getInstructionPlaceholder = (mode: SelectionChatActionMode) =>
    mode === 'rewrite'
      ? t(
          'settings.selectionChat.actionInstructionRewritePlaceholder',
          'e.g., Use a more concise tone, preserve Markdown structure.',
        )
      : t(
          'settings.selectionChat.actionInstructionPlaceholder',
          'e.g., Please explain the selected content in depth.',
        )

  const canSaveAction = (action: SelectionChatAction | null) => {
    if (!action) return false
    const mode = action.mode ?? 'ask'
    const rewriteBehavior = action.rewriteBehavior ?? 'preset'
    const hasLabel = Boolean(action.label?.trim())
    const hasInstruction = Boolean(action.instruction?.trim())
    if (mode === 'rewrite') {
      return rewriteBehavior === 'preset'
        ? hasLabel && hasInstruction
        : hasLabel
    }
    return hasLabel && hasInstruction
  }

  const actionIds = editableActions.map((action) => action.id)

  const handleSaveActions = async (newActions: SelectionChatAction[]) => {
    await setSettings({
      ...settings,
      continuationOptions: {
        ...settings.continuationOptions,
        selectionChatActions: newActions.map((action) => ({
          ...action,
          enabled: true,
        })),
      },
    })
  }

  const handleAddAction = () => {
    const newAction: SelectionChatAction = {
      id: generateId(),
      label: '',
      instruction: '',
      enabled: true,
      mode: 'ask',
      rewriteBehavior: 'preset',
    }
    setEditingAction(newAction)
    setIsAddingAction(true)
  }

  const handleSaveAction = async () => {
    const mode = editingAction?.mode ?? 'ask'
    const rewriteBehavior = editingAction?.rewriteBehavior ?? 'preset'
    const hasLabel = Boolean(editingAction?.label?.trim())
    const hasInstruction = Boolean(editingAction?.instruction?.trim())
    if (
      !editingAction ||
      !hasLabel ||
      (mode === 'rewrite'
        ? rewriteBehavior === 'preset' && !hasInstruction
        : !hasInstruction)
    ) {
      return
    }

    let newActions: SelectionChatAction[]
    if (isAddingAction) {
      newActions = [...editableActions, { ...editingAction, enabled: true }]
    } else {
      newActions = editableActions.map((action) =>
        action.id === editingAction.id
          ? { ...editingAction, enabled: true }
          : { ...action, enabled: true },
      )
    }

    try {
      await handleSaveActions(newActions)
      setEditingAction(null)
      setIsAddingAction(false)
    } catch (error: unknown) {
      console.error('Failed to save Cursor Chat quick action', error)
    }
  }

  const handleDeleteAction = async (id: string) => {
    const newActions = editableActions.filter((action) => action.id !== id)
    try {
      await handleSaveActions(newActions)
    } catch (error: unknown) {
      console.error('Failed to delete Cursor Chat quick action', error)
    }
  }

  const handleDuplicateAction = async (action: SelectionChatAction) => {
    const newAction = {
      ...action,
      id: generateId(),
      label: `${action.label}${t('settings.selectionChat.copySuffix', ' (copy)')}`,
      enabled: true,
    }
    const newActions = [...editableActions, newAction]
    try {
      await handleSaveActions(newActions)
    } catch (error: unknown) {
      console.error('Failed to duplicate Cursor Chat quick action', error)
    }
  }

  const triggerDropSuccess = (movedId: string) => {
    const tryFind = (attempt = 0) => {
      const movedItem = document.querySelector(
        `div[data-action-id="${movedId}"]`,
      )
      if (movedItem) {
        movedItem.classList.add('yolo-quick-action-drop-success')
        window.setTimeout(() => {
          movedItem.classList.remove('yolo-quick-action-drop-success')
        }, 700)
      } else if (attempt < 8) {
        window.setTimeout(() => tryFind(attempt + 1), 50)
      }
    }
    requestAnimationFrame(() => tryFind())
  }

  const handleQuickActionDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) {
      return
    }

    const oldIndex = editableActions.findIndex(
      (action) => action.id === active.id,
    )
    const newIndex = editableActions.findIndex(
      (action) => action.id === over.id,
    )
    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    const reorderedActions = arrayMove(editableActions, oldIndex, newIndex)

    try {
      await handleSaveActions(reorderedActions)
      triggerDropSuccess(String(active.id))
    } catch (error: unknown) {
      console.error('Failed to reorder Cursor Chat actions', error)
    }
  }

  const handleResetToDefault = () => {
    let confirmed = false

    const modal = new ConfirmModal(plugin.app, {
      title: t(
        'settings.selectionChat.resetConfirmTitle',
        'Reset Cursor Chat actions',
      ),
      message: t(
        'settings.selectionChat.confirmReset',
        'Are you sure you want to reset to default quick commands? This will delete all custom settings.',
      ),
      ctaText: t('common.confirm'),
      onConfirm: () => {
        confirmed = true
      },
    })

    modal.onClose = () => {
      if (!confirmed) return
      Promise.resolve(
        setSettings({
          ...settings,
          continuationOptions: {
            ...settings.continuationOptions,
            selectionChatActions: undefined,
          },
        }),
      ).catch((error: unknown) => {
        console.error('Failed to reset Cursor Chat quick actions', error)
      })
    }

    modal.open()
  }

  return (
    <div className="yolo-smart-space-settings">
      <ObsidianSetting
        name={t(
          'settings.selectionChat.quickActionsTitle',
          'Cursor Chat Quick Commands',
        )}
        desc={t(
          'settings.selectionChat.quickActionsDesc',
          'Customize quick commands and prompts shown after selecting text',
        )}
      >
        <ObsidianButton
          text={t('settings.selectionChat.addAction', 'Add action')}
          onClick={handleAddAction}
        />
        <ObsidianButton
          text={t('settings.selectionChat.resetToDefault', 'Reset to default')}
          onClick={handleResetToDefault}
        />
      </ObsidianSetting>

      {isAddingAction && editingAction && (
        <div className="yolo-quick-action-editor yolo-quick-action-editor-new">
          <ObsidianSetting
            name={t('settings.selectionChat.actionLabel', 'Action name')}
            desc={t(
              'settings.selectionChat.actionLabelDesc',
              'Text displayed in the quick command',
            )}
          >
            <ObsidianTextInput
              value={editingAction.label}
              placeholder={t(
                'settings.selectionChat.actionLabelPlaceholder',
                'e.g., Explain in depth',
              )}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        label: value,
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.selectionChat.actionMode', 'Execution mode')}
            desc={t(
              'settings.selectionChat.actionModeDesc',
              'The first two use Quick Ask: Q&A sends automatically, rewrite enters preview mode. The last two use Chat: choose to fill the chat input only, or send directly.',
            )}
          >
            <ObsidianDropdown
              value={editingAction.mode ?? 'ask'}
              options={actionModeOptions}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        mode: normalizeActionMode(value),
                        rewriteBehavior:
                          value === 'rewrite'
                            ? (prev.rewriteBehavior ?? 'preset')
                            : prev.rewriteBehavior,
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          {(editingAction.mode ?? 'ask') === 'rewrite' && (
            <ObsidianSetting
              name={t('settings.selectionChat.actionRewriteType', 'Rewrite type')}
              desc={t(
                'settings.selectionChat.actionRewriteTypeDesc',
                'Choose whether the rewrite requires an input instruction',
              )}
            >
              <ObsidianDropdown
                value={editingAction.rewriteBehavior ?? 'preset'}
                options={actionRewriteTypeOptions}
                onChange={(value) =>
                  setEditingAction((prev) =>
                    prev
                      ? {
                          ...prev,
                          rewriteBehavior:
                            value === 'custom' ? 'custom' : 'preset',
                        }
                      : prev,
                  )
                }
              />
            </ObsidianSetting>
          )}

          <ObsidianSetting
            name={t('settings.selectionChat.actionAssistant', 'Assistant')}
            desc={t(
              'settings.selectionChat.actionAssistantDesc',
              'Assistant to use when running this command; leave empty to follow the current selection.',
            )}
          >
            <ObsidianDropdown
              value={resolveAssistantDropdownValue(editingAction.assistantId)}
              options={assistantOptions}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        assistantId: normalizeAssistantDropdownValue(value),
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.selectionChat.actionInstruction', 'Prompt')}
            desc={getInstructionDesc(editingAction.mode ?? 'ask')}
            className="yolo-settings-textarea-header"
          />
          <ObsidianSetting className="yolo-settings-textarea">
            <ObsidianTextArea
              value={editingAction.instruction}
              placeholder={getInstructionPlaceholder(
                editingAction.mode ?? 'ask',
              )}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        instruction: value,
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          <div className="yolo-quick-action-editor-buttons">
            <ObsidianButton
              text={t('common.save', 'Save')}
              onClick={() => void handleSaveAction()}
              cta
              disabled={!canSaveAction(editingAction)}
            />
            <ObsidianButton
              text={t('common.cancel', 'Cancel')}
              onClick={() => {
                setEditingAction(null)
                setIsAddingAction(false)
              }}
            />
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => void handleQuickActionDragEnd(event)}
      >
        <SortableContext
          items={actionIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="yolo-quick-actions-list">
            {editableActions.map((action) => {
              const isEditing =
                !isAddingAction && editingAction?.id === action.id
              return (
                <QuickActionItem
                  key={action.id}
                  action={action}
                  isEditing={isEditing}
                  editingAction={editingAction}
                  setEditingAction={setEditingAction}
                  setIsAddingAction={setIsAddingAction}
                  handleDuplicateAction={handleDuplicateAction}
                  handleDeleteAction={handleDeleteAction}
                  handleSaveAction={handleSaveAction}
                  actionModeOptions={actionModeOptions}
                  actionRewriteTypeOptions={actionRewriteTypeOptions}
                  assistantOptions={assistantOptions}
                  resolveAssistantDropdownValue={resolveAssistantDropdownValue}
                  normalizeAssistantDropdownValue={
                    normalizeAssistantDropdownValue
                  }
                  getInstructionDesc={getInstructionDesc}
                  getInstructionPlaceholder={getInstructionPlaceholder}
                  canSaveAction={canSaveAction}
                  t={t}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

type QuickActionItemProps = {
  action: SelectionChatAction
  isEditing: boolean
  editingAction: SelectionChatAction | null
  setEditingAction: React.Dispatch<
    React.SetStateAction<SelectionChatAction | null>
  >
  setIsAddingAction: React.Dispatch<React.SetStateAction<boolean>>
  handleDuplicateAction: (action: SelectionChatAction) => void | Promise<void>
  handleDeleteAction: (id: string) => void | Promise<void>
  handleSaveAction: () => void | Promise<void>
  actionModeOptions: Record<SelectionChatActionMode, string>
  actionRewriteTypeOptions: Record<SelectionChatActionRewriteBehavior, string>
  assistantOptions: Record<string, string>
  resolveAssistantDropdownValue: (value?: string) => string
  normalizeAssistantDropdownValue: (value: string) => string | undefined
  getInstructionDesc: (mode: SelectionChatActionMode) => string
  getInstructionPlaceholder: (mode: SelectionChatActionMode) => string
  canSaveAction: (action: SelectionChatAction | null) => boolean
  t: TranslateFn
}

function QuickActionItem({
  action,
  isEditing,
  editingAction,
  setEditingAction,
  setIsAddingAction,
  handleDuplicateAction,
  handleDeleteAction,
  handleSaveAction,
  actionModeOptions,
  actionRewriteTypeOptions,
  assistantOptions,
  resolveAssistantDropdownValue,
  normalizeAssistantDropdownValue,
  getInstructionDesc,
  getInstructionPlaceholder,
  canSaveAction,
  t,
}: QuickActionItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: action.id, disabled: isEditing })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const currentEditing = isEditing ? editingAction : null

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        data-action-id={action.id}
        className={`yolo-quick-action-item ${isEditing ? 'editing' : ''} ${isDragging ? 'yolo-quick-action-dragging' : ''}`}
        {...attributes}
      >
        <div className="yolo-quick-action-drag-handle">
          <span
            className={`yolo-drag-handle ${isDragging ? 'yolo-drag-handle--active' : ''}`}
            aria-label={t('settings.selectionChat.dragHandleAria', 'Drag to reorder')}
            {...listeners}
          >
            <GripVertical size={16} />
          </span>
        </div>
        <div className="yolo-quick-action-content">
          <div className="yolo-quick-action-header">
            <span className="yolo-quick-action-label">{action.label}</span>
          </div>
        </div>
        <div className="yolo-quick-action-controls">
          <ObsidianButton
            onClick={() => {
              if (isEditing) {
                setEditingAction(null)
              } else {
                setEditingAction(action)
                setIsAddingAction(false)
              }
            }}
            icon={isEditing ? 'x' : 'pencil'}
            tooltip={
              isEditing ? t('common.cancel', 'Cancel') : t('common.edit', 'Edit')
            }
          />
          <ObsidianButton
            onClick={() => void handleDuplicateAction(action)}
            icon="copy"
            tooltip={t('settings.selectionChat.duplicate', 'Duplicate')}
          />
          <ObsidianButton
            onClick={() => void handleDeleteAction(action.id)}
            icon="trash-2"
            tooltip={t('common.delete', 'Delete')}
          />
        </div>
      </div>

      {isEditing && currentEditing && (
        <div className="yolo-quick-action-editor yolo-quick-action-editor-inline">
          <ObsidianSetting
            name={t('settings.selectionChat.actionLabel', 'Action name')}
            desc={t(
              'settings.selectionChat.actionLabelDesc',
              'Text displayed in the quick command',
            )}
          >
            <ObsidianTextInput
              value={currentEditing.label}
              placeholder={t(
                'settings.selectionChat.actionLabelPlaceholder',
                'e.g., Explain in depth',
              )}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        label: value,
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.selectionChat.actionMode', 'Execution mode')}
            desc={t(
              'settings.selectionChat.actionModeDesc',
              'The first two use Quick Ask: Q&A sends automatically, rewrite enters preview mode. The last two use Chat: choose to fill the chat input only, or send directly.',
            )}
          >
            <ObsidianDropdown
              value={currentEditing.mode ?? 'ask'}
              options={actionModeOptions}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        mode: normalizeActionMode(value),
                        rewriteBehavior:
                          value === 'rewrite'
                            ? (prev.rewriteBehavior ?? 'preset')
                            : prev.rewriteBehavior,
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          {(currentEditing.mode ?? 'ask') === 'rewrite' && (
            <ObsidianSetting
              name={t('settings.selectionChat.actionRewriteType', 'Rewrite type')}
              desc={t(
                'settings.selectionChat.actionRewriteTypeDesc',
                'Choose whether the rewrite requires an input instruction',
              )}
            >
              <ObsidianDropdown
                value={currentEditing.rewriteBehavior ?? 'preset'}
                options={actionRewriteTypeOptions}
                onChange={(value) =>
                  setEditingAction((prev) =>
                    prev
                      ? {
                          ...prev,
                          rewriteBehavior:
                            value === 'custom' ? 'custom' : 'preset',
                        }
                      : prev,
                  )
                }
              />
            </ObsidianSetting>
          )}

          <ObsidianSetting
            name={t('settings.selectionChat.actionAssistant', 'Assistant')}
            desc={t(
              'settings.selectionChat.actionAssistantDesc',
              'Assistant to use when running this command; leave empty to follow the current selection.',
            )}
          >
            <ObsidianDropdown
              value={resolveAssistantDropdownValue(currentEditing.assistantId)}
              options={assistantOptions}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        assistantId: normalizeAssistantDropdownValue(value),
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.selectionChat.actionInstruction', 'Prompt')}
            desc={getInstructionDesc(currentEditing.mode ?? 'ask')}
            className="yolo-settings-textarea-header"
          />
          <ObsidianSetting className="yolo-settings-textarea">
            <ObsidianTextArea
              value={currentEditing.instruction}
              placeholder={getInstructionPlaceholder(
                currentEditing.mode ?? 'ask',
              )}
              onChange={(value) =>
                setEditingAction((prev) =>
                  prev
                    ? {
                        ...prev,
                        instruction: value,
                      }
                    : prev,
                )
              }
            />
          </ObsidianSetting>

          <div className="yolo-quick-action-editor-buttons">
            <ObsidianButton
              text={t('common.save', 'Save')}
              onClick={() => void handleSaveAction()}
              cta
              disabled={!canSaveAction(currentEditing)}
            />
            <ObsidianButton
              text={t('common.cancel', 'Cancel')}
              onClick={() => setEditingAction(null)}
            />
          </div>
        </div>
      )}
    </>
  )
}
