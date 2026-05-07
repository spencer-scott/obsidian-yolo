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
import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  FileText,
  GripVertical,
  Lightbulb,
  ListTodo,
  MessageCircle,
  PenLine,
  Settings,
  Sparkles,
  Table,
  Workflow,
} from 'lucide-react'
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

import { SmartSpaceQuickActionsModal } from './modals/SmartSpaceQuickActionsModal'

type QuickAction = {
  id: string
  label: string
  instruction: string
  icon?: string
  category?: 'suggestions' | 'writing' | 'thinking' | 'custom'
  enabled: boolean
}

type QuickActionCategory = NonNullable<QuickAction['category']>

type TranslateFn = (key: string, fallback?: string) => string

const QUICK_ACTION_CATEGORIES: QuickActionCategory[] = [
  'suggestions',
  'writing',
  'thinking',
  'custom',
]

const isQuickActionCategory = (value: string): value is QuickActionCategory =>
  QUICK_ACTION_CATEGORIES.includes(value as QuickActionCategory)

// Available icons mapping
const ICON_OPTIONS = {
  sparkles: {
    component: Sparkles,
    labelKey: 'settings.smartSpace.iconLabels.sparkles',
    fallback: 'Sparkles',
  },
  filetext: {
    component: FileText,
    labelKey: 'settings.smartSpace.iconLabels.file',
    fallback: 'File',
  },
  listtodo: {
    component: ListTodo,
    labelKey: 'settings.smartSpace.iconLabels.todo',
    fallback: 'Todo',
  },
  workflow: {
    component: Workflow,
    labelKey: 'settings.smartSpace.iconLabels.workflow',
    fallback: 'Workflow',
  },
  table: {
    component: Table,
    labelKey: 'settings.smartSpace.iconLabels.table',
    fallback: 'Table',
  },
  penline: {
    component: PenLine,
    labelKey: 'settings.smartSpace.iconLabels.pen',
    fallback: 'Pen',
  },
  lightbulb: {
    component: Lightbulb,
    labelKey: 'settings.smartSpace.iconLabels.lightbulb',
    fallback: 'Lightbulb',
  },
  brain: {
    component: Brain,
    labelKey: 'settings.smartSpace.iconLabels.brain',
    fallback: 'Brain',
  },
  messagecircle: {
    component: MessageCircle,
    labelKey: 'settings.smartSpace.iconLabels.message',
    fallback: 'Message',
  },
  settings: {
    component: Settings,
    labelKey: 'settings.smartSpace.iconLabels.settings',
    fallback: 'Settings',
  },
}

type DefaultActionConfig = {
  id: string
  icon: string
  category: QuickAction['category']
  labelKey: string
  labelFallback: string
  instructionKey: string
  instructionFallback: string
}

const DEFAULT_ACTION_CONFIGS: DefaultActionConfig[] = [
  {
    id: 'continue',
    icon: 'sparkles',
    category: 'suggestions',
    labelKey: 'chat.customContinueSections.suggestions.items.continue.label',
    labelFallback: 'Continue writing',
    instructionKey:
      'chat.customContinueSections.suggestions.items.continue.instruction',
    instructionFallback:
      'You are a helpful writing assistant. Continue writing from the provided context without repeating or paraphrasing the context. Match the tone, language, and style. Output only the continuation text.',
  },
  {
    id: 'summarize',
    icon: 'filetext',
    category: 'writing',
    labelKey: 'chat.customContinueSections.writing.items.summarize.label',
    labelFallback: 'Add summary',
    instructionKey:
      'chat.customContinueSections.writing.items.summarize.instruction',
    instructionFallback: 'Please write a concise summary of the current content.',
  },
  {
    id: 'todo',
    icon: 'listtodo',
    category: 'writing',
    labelKey: 'chat.customContinueSections.writing.items.todo.label',
    labelFallback: 'Add to-do list',
    instructionKey:
      'chat.customContinueSections.writing.items.todo.instruction',
    instructionFallback: 'Please organize an actionable to-do list based on the current content.',
  },
  {
    id: 'flowchart',
    icon: 'workflow',
    category: 'writing',
    labelKey: 'chat.customContinueSections.writing.items.flowchart.label',
    labelFallback: 'Create flowchart',
    instructionKey:
      'chat.customContinueSections.writing.items.flowchart.instruction',
    instructionFallback: 'Please organize the current key points into a flowchart or step-by-step explanation.',
  },
  {
    id: 'table',
    icon: 'table',
    category: 'writing',
    labelKey: 'chat.customContinueSections.writing.items.table.label',
    labelFallback: 'Create table',
    instructionKey:
      'chat.customContinueSections.writing.items.table.instruction',
    instructionFallback: 'Please organize the current information into a table with appropriate column headers.',
  },
  {
    id: 'freewrite',
    icon: 'penline',
    category: 'writing',
    labelKey: 'chat.customContinueSections.writing.items.freewrite.label',
    labelFallback: 'Free writing',
    instructionKey:
      'chat.customContinueSections.writing.items.freewrite.instruction',
    instructionFallback: 'Please freely continue writing new paragraphs based on the context.',
  },
  {
    id: 'brainstorm',
    icon: 'lightbulb',
    category: 'thinking',
    labelKey: 'chat.customContinueSections.thinking.items.brainstorm.label',
    labelFallback: 'Brainstorm',
    instructionKey:
      'chat.customContinueSections.thinking.items.brainstorm.instruction',
    instructionFallback: 'Please provide some new ideas or angles of approach.',
  },
  {
    id: 'analyze',
    icon: 'brain',
    category: 'thinking',
    labelKey: 'chat.customContinueSections.thinking.items.analyze.label',
    labelFallback: 'Analyze key points',
    instructionKey:
      'chat.customContinueSections.thinking.items.analyze.instruction',
    instructionFallback: 'Please briefly analyze the key points, risks, or opportunities in the current content.',
  },
  {
    id: 'dialogue',
    icon: 'messagecircle',
    category: 'thinking',
    labelKey: 'chat.customContinueSections.thinking.items.dialogue.label',
    labelFallback: 'Follow-up questions',
    instructionKey:
      'chat.customContinueSections.thinking.items.dialogue.instruction',
    instructionFallback: 'Please provide some follow-up questions for deeper discussion.',
  },
]

const DEFAULT_ACTION_LOOKUP: Record<string, DefaultActionConfig> =
  Object.fromEntries(
    DEFAULT_ACTION_CONFIGS.map((config) => [config.id, config]),
  )

// Generate unique ID
const generateId = () => {
  return `action_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

const getDefaultQuickActions = (t: TranslateFn): QuickAction[] => {
  return DEFAULT_ACTION_CONFIGS.map((config) => ({
    id: config.id,
    label: t(config.labelKey, config.labelFallback),
    instruction: t(config.instructionKey, config.instructionFallback),
    icon: config.icon,
    category: config.category,
    enabled: true,
  }))
}

// Category display order
const CATEGORY_ORDER: QuickAction['category'][] = [...QUICK_ACTION_CATEGORIES]

type GroupedActions = {
  category: QuickAction['category']
  actions: QuickAction[]
}

type SmartSpaceQuickActionsSettingsProps = {
  variant?: 'settings' | 'composer'
}

export function SmartSpaceQuickActionsSettings({
  variant = 'settings',
}: SmartSpaceQuickActionsSettingsProps) {
  const plugin = usePlugin()
  const { settings } = useSettings()
  const { t } = useLanguage()
  const quickActions =
    settings.continuationOptions.smartSpaceQuickActions ||
    getDefaultQuickActions(t)
  const actionsCountLabel = t(
    'settings.smartSpace.actionsCount',
    '{count} quick actions configured',
  ).replace('{count}', String(quickActions.length))

  const handleOpenModal = () => {
    const modal = new SmartSpaceQuickActionsModal(plugin.app, plugin)
    modal.open()
  }

  if (variant === 'composer') {
    return (
      <div className="smtcmp-smart-space-settings">
        <div className="smtcmp-smart-space-settings-row">
          <div className="smtcmp-settings-desc">{actionsCountLabel}</div>
          <ObsidianButton
            text={t('settings.smartSpace.configureActions', 'Configure quick actions')}
            onClick={handleOpenModal}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="smtcmp-smart-space-settings">
      <ObsidianSetting
        name={t(
          'settings.smartSpace.quickActionsTitle',
          'Smart Space Quick Actions',
        )}
        desc={t(
          'settings.smartSpace.quickActionsDesc',
          'Customize quick actions and prompts shown in Smart Space',
        )}
        className="smtcmp-settings-card"
      >
        <div className="smtcmp-settings-desc">{actionsCountLabel}</div>
        <ObsidianButton
          text={t('settings.smartSpace.configureActions', 'Configure quick actions')}
          onClick={handleOpenModal}
        />
      </ObsidianSetting>
    </div>
  )
}

export function SmartSpaceQuickActionsSettingsContent() {
  const plugin = usePlugin()
  const { settings, setSettings } = useSettings()
  const { t } = useLanguage()
  const categoryOptions = useMemo(
    () => ({
      suggestions: t('settings.smartSpace.categories.suggestions', 'Suggestions'),
      writing: t('settings.smartSpace.categories.writing', 'Writing'),
      thinking: t(
        'settings.smartSpace.categories.thinking',
        'Thinking / Ask / Dialogue',
      ),
      custom: t('settings.smartSpace.categories.custom', 'Custom'),
    }),
    [t],
  )
  const iconOptions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(ICON_OPTIONS).map(([key, value]) => [
          key,
          t(value.labelKey, value.fallback),
        ]),
      ),
    [t],
  )
  const [editingAction, setEditingAction] = useState<QuickAction | null>(null)
  const [isAddingAction, setIsAddingAction] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  // Get current quick actions, or use default ones if not customized
  const quickActions = (
    settings.continuationOptions.smartSpaceQuickActions ||
    getDefaultQuickActions(t)
  ).map((action) => {
    const config = DEFAULT_ACTION_LOOKUP[action.id]
    let label = action.label
    let instruction = action.instruction

    if (config) {
      const localizedLabel = t(config.labelKey, config.labelFallback)
      const localizedInstruction = t(
        config.instructionKey,
        config.instructionFallback,
      )

      if (
        label === config.labelFallback ||
        label === localizedLabel ||
        !label
      ) {
        label = localizedLabel
      }

      if (
        instruction === config.instructionFallback ||
        instruction === localizedInstruction ||
        !instruction
      ) {
        instruction = localizedInstruction
      }
    }

    return {
      ...action,
      label,
      instruction,
      enabled: true,
    }
  })

  // Group actions by category
  const groupedActions: GroupedActions[] = useMemo(() => {
    return CATEGORY_ORDER.map((category) => ({
      category,
      actions: quickActions.filter((action) => action.category === category),
    })).filter((group) => group.actions.length > 0)
  }, [quickActions])
  const quickActionIds = quickActions.map((action) => action.id)

  const handleSaveActions = async (newActions: QuickAction[]) => {
    await setSettings({
      ...settings,
      continuationOptions: {
        ...settings.continuationOptions,
        smartSpaceQuickActions: newActions.map((action) => ({
          ...action,
          enabled: true,
        })),
      },
    })
  }

  const handleAddAction = () => {
    const newAction: QuickAction = {
      id: generateId(),
      label: '',
      instruction: '',
      icon: 'sparkles',
      category: 'custom',
      enabled: true,
    }
    setEditingAction(newAction)
    setIsAddingAction(true)
  }

  const handleSaveAction = async () => {
    if (!editingAction || !editingAction.label || !editingAction.instruction) {
      return
    }

    let newActions: QuickAction[]
    if (isAddingAction) {
      newActions = [...quickActions, { ...editingAction, enabled: true }]
    } else {
      newActions = quickActions.map((action) =>
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
      console.error('Failed to save Smart Space quick action', error)
    }
  }

  const handleDeleteAction = async (id: string) => {
    const newActions = quickActions.filter((action) => action.id !== id)
    try {
      await handleSaveActions(newActions)
    } catch (error: unknown) {
      console.error('Failed to delete Smart Space quick action', error)
    }
  }

  const handleDuplicateAction = async (action: QuickAction) => {
    const newAction = {
      ...action,
      id: generateId(),
      label: `${action.label}${t('settings.smartSpace.copySuffix', ' (copy)')}`,
      enabled: true,
    }
    const newActions = [...quickActions, newAction]
    try {
      await handleSaveActions(newActions)
    } catch (error: unknown) {
      console.error('Failed to duplicate Smart Space quick action', error)
    }
  }

  const triggerDropSuccess = (movedId: string) => {
    const tryFind = (attempt = 0) => {
      const movedItem = document.querySelector(
        `div[data-action-id="${movedId}"]`,
      )
      if (movedItem) {
        movedItem.classList.add('smtcmp-quick-action-drop-success')
        window.setTimeout(() => {
          movedItem.classList.remove('smtcmp-quick-action-drop-success')
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

    const oldIndex = quickActions.findIndex((action) => action.id === active.id)
    const newIndex = quickActions.findIndex((action) => action.id === over.id)
    if (oldIndex < 0 || newIndex < 0) {
      return
    }

    const targetCategory =
      quickActions[newIndex]?.category ?? quickActions[oldIndex]?.category

    const reorderedActions = arrayMove(quickActions, oldIndex, newIndex)
    reorderedActions[newIndex] = {
      ...reorderedActions[newIndex],
      category: targetCategory,
    }

    try {
      await handleSaveActions(reorderedActions)
      triggerDropSuccess(String(active.id))
    } catch (error: unknown) {
      console.error('Failed to reorder Smart Space actions', error)
    }
  }

  const handleResetToDefault = () => {
    let confirmed = false

    const modal = new ConfirmModal(plugin.app, {
      title: t(
        'settings.smartSpace.resetConfirmTitle',
        'Reset Smart Space actions',
      ),
      message: t(
        'settings.smartSpace.confirmReset',
        'Are you sure you want to reset to default quick actions? This will delete all custom settings.',
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
            smartSpaceQuickActions: undefined,
          },
        }),
      ).catch((error: unknown) => {
        console.error('Failed to reset Smart Space quick actions', error)
      })
    }

    modal.open()
  }

  return (
    <div className="smtcmp-smart-space-settings">
      <ObsidianSetting
        name={t(
          'settings.smartSpace.quickActionsTitle',
          'Smart Space Quick Actions',
        )}
        desc={t(
          'settings.smartSpace.quickActionsDesc',
          'Customize quick actions and prompts shown in Smart Space',
        )}
      >
        <ObsidianButton
          text={t('settings.smartSpace.addAction', 'Add action')}
          onClick={handleAddAction}
        />
        <ObsidianButton
          text={t('settings.smartSpace.resetToDefault', 'Reset to default')}
          onClick={handleResetToDefault}
        />
      </ObsidianSetting>

      {/* Add new action form (shown at top when adding) */}
      {isAddingAction && editingAction && (
        <div className="smtcmp-quick-action-editor smtcmp-quick-action-editor-new">
          <ObsidianSetting
            name={t('settings.smartSpace.actionLabel', 'Action name')}
            desc={t(
              'settings.smartSpace.actionLabelDesc',
              'Text displayed in the quick action',
            )}
          >
            <ObsidianTextInput
              value={editingAction.label}
              placeholder={t(
                'settings.smartSpace.actionLabelPlaceholder',
                'e.g., Continue writing',
              )}
              onChange={(value) =>
                setEditingAction({ ...editingAction, label: value })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.smartSpace.actionInstruction', 'Prompt')}
            desc={t(
              'settings.smartSpace.actionInstructionDesc',
              'Instruction sent to the AI',
            )}
            className="smtcmp-settings-textarea-header"
          />
          <ObsidianSetting className="smtcmp-settings-textarea">
            <ObsidianTextArea
              value={editingAction.instruction}
              placeholder={t(
                'settings.smartSpace.actionInstructionPlaceholder',
                'e.g., Please continue expanding the current paragraph while maintaining the original tone and style.',
              )}
              onChange={(value) =>
                setEditingAction({ ...editingAction, instruction: value })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.smartSpace.actionCategory', 'Category')}
            desc={t('settings.smartSpace.actionCategoryDesc', 'Category this action belongs to')}
          >
            <ObsidianDropdown
              value={editingAction.category || 'custom'}
              options={categoryOptions}
              onChange={(value) =>
                setEditingAction({
                  ...editingAction,
                  category: isQuickActionCategory(value) ? value : 'custom',
                })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.smartSpace.actionIcon', 'Icon')}
            desc={t('settings.smartSpace.actionIconDesc', 'Choose an icon')}
          >
            <ObsidianDropdown
              value={editingAction.icon || 'sparkles'}
              options={iconOptions}
              onChange={(value) =>
                setEditingAction({ ...editingAction, icon: value })
              }
            />
          </ObsidianSetting>

          <div className="smtcmp-quick-action-editor-buttons">
            <ObsidianButton
              text={t('common.save', 'Save')}
              onClick={() => void handleSaveAction()}
              cta
              disabled={!editingAction.label || !editingAction.instruction}
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

      {/* Quick Actions List - Grouped by Category */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => void handleQuickActionDragEnd(event)}
      >
        <SortableContext
          items={quickActionIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="smtcmp-quick-actions-list">
            {groupedActions.map((group, groupIndex) => (
              <React.Fragment key={group.category}>
                <div className="smtcmp-quick-actions-group-header">
                  {categoryOptions[group.category || 'custom']}
                </div>

                {group.actions.map((action) => {
                  const IconComponent =
                    ICON_OPTIONS[action.icon as keyof typeof ICON_OPTIONS]
                      ?.component || Sparkles
                  const isEditing =
                    !isAddingAction && editingAction?.id === action.id

                  return (
                    <QuickActionItem
                      key={action.id}
                      action={action}
                      iconComponent={IconComponent}
                      isEditing={isEditing}
                      editingAction={editingAction}
                      setEditingAction={setEditingAction}
                      setIsAddingAction={setIsAddingAction}
                      handleDuplicateAction={handleDuplicateAction}
                      handleDeleteAction={handleDeleteAction}
                      handleSaveAction={handleSaveAction}
                      categoryOptions={categoryOptions}
                      iconOptions={iconOptions}
                      t={t}
                    />
                  )
                })}

                {groupIndex < groupedActions.length - 1 && (
                  <div className="smtcmp-quick-actions-group-divider" />
                )}
              </React.Fragment>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

type QuickActionItemProps = {
  action: QuickAction
  iconComponent: LucideIcon
  isEditing: boolean
  editingAction: QuickAction | null
  setEditingAction: React.Dispatch<React.SetStateAction<QuickAction | null>>
  setIsAddingAction: React.Dispatch<React.SetStateAction<boolean>>
  handleDuplicateAction: (action: QuickAction) => void | Promise<void>
  handleDeleteAction: (id: string) => void | Promise<void>
  handleSaveAction: () => void | Promise<void>
  categoryOptions: Record<string, string>
  iconOptions: Record<string, string>
  t: TranslateFn
}

function QuickActionItem({
  action,
  iconComponent: IconComponent,
  isEditing,
  editingAction,
  setEditingAction,
  setIsAddingAction,
  handleDuplicateAction,
  handleDeleteAction,
  handleSaveAction,
  categoryOptions,
  iconOptions,
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
        className={`smtcmp-quick-action-item ${isEditing ? 'editing' : ''} ${isDragging ? 'smtcmp-quick-action-dragging' : ''}`}
        {...attributes}
      >
        <div className="smtcmp-quick-action-drag-handle">
          <span
            className={`smtcmp-drag-handle ${isDragging ? 'smtcmp-drag-handle--active' : ''}`}
            aria-label={t('settings.smartSpace.dragHandleAria', 'Drag to reorder')}
            {...listeners}
          >
            <GripVertical size={16} />
          </span>
        </div>
        <div className="smtcmp-quick-action-content">
          <div className="smtcmp-quick-action-header">
            <IconComponent size={16} className="smtcmp-quick-action-icon" />
            <span className="smtcmp-quick-action-label">{action.label}</span>
          </div>
        </div>
        <div className="smtcmp-quick-action-controls">
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
            tooltip={t('settings.smartSpace.duplicate', 'Duplicate')}
          />
          <ObsidianButton
            onClick={() => void handleDeleteAction(action.id)}
            icon="trash-2"
            tooltip={t('common.delete', 'Delete')}
          />
        </div>
      </div>

      {isEditing && currentEditing && (
        <div className="smtcmp-quick-action-editor smtcmp-quick-action-editor-inline">
          <ObsidianSetting
            name={t('settings.smartSpace.actionLabel', 'Action name')}
            desc={t(
              'settings.smartSpace.actionLabelDesc',
              'Text displayed in the quick action',
            )}
          >
            <ObsidianTextInput
              value={currentEditing.label}
              placeholder={t(
                'settings.smartSpace.actionLabelPlaceholder',
                'e.g., Continue writing',
              )}
              onChange={(value) =>
                setEditingAction({
                  ...currentEditing,
                  label: value,
                })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.smartSpace.actionInstruction', 'Prompt')}
            desc={t(
              'settings.smartSpace.actionInstructionDesc',
              'Instruction sent to the AI',
            )}
            className="smtcmp-settings-textarea-header"
          />
          <ObsidianSetting className="smtcmp-settings-textarea">
            <ObsidianTextArea
              value={currentEditing.instruction}
              placeholder={t(
                'settings.smartSpace.actionInstructionPlaceholder',
                'e.g., Please continue expanding the current paragraph while maintaining the original tone and style.',
              )}
              onChange={(value) =>
                setEditingAction({
                  ...currentEditing,
                  instruction: value,
                })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.smartSpace.actionCategory', 'Category')}
            desc={t('settings.smartSpace.actionCategoryDesc', 'Category this action belongs to')}
          >
            <ObsidianDropdown
              value={currentEditing.category || 'custom'}
              options={categoryOptions}
              onChange={(value) =>
                setEditingAction({
                  ...currentEditing,
                  category: isQuickActionCategory(value) ? value : 'custom',
                })
              }
            />
          </ObsidianSetting>

          <ObsidianSetting
            name={t('settings.smartSpace.actionIcon', 'Icon')}
            desc={t('settings.smartSpace.actionIconDesc', 'Choose an icon')}
          >
            <ObsidianDropdown
              value={currentEditing.icon || 'sparkles'}
              options={iconOptions}
              onChange={(value) =>
                setEditingAction({
                  ...currentEditing,
                  icon: value,
                })
              }
            />
          </ObsidianSetting>

          <div className="smtcmp-quick-action-editor-buttons">
            <ObsidianButton
              text={t('common.save', 'Save')}
              onClick={() => void handleSaveAction()}
              cta
              disabled={!currentEditing.label || !currentEditing.instruction}
            />
            <ObsidianButton
              text={t('common.cancel', 'Cancel')}
              onClick={() => {
                setEditingAction(null)
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
