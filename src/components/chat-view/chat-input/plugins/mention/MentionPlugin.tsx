/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license.
 * Original source: https://github.com/facebook/lexical
 *
 * Modified from the original code
 */

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $createTextNode, COMMAND_PRIORITY_NORMAL, TextNode } from 'lexical'
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  Cpu,
  FileIcon,
  FileText,
  FolderClosedIcon,
  Infinity as InfinityIcon,
  MessageSquare,
} from 'lucide-react'
import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { JSX as ReactJSX } from 'react/jsx-runtime'
import { createPortal } from 'react-dom'

import { PROVIDER_PRESET_INFO } from '../../../../../constants'
import { useApp } from '../../../../../contexts/app-context'
import { useLanguage } from '../../../../../contexts/language-context'
import { useSettings } from '../../../../../contexts/settings-context'
import { Assistant } from '../../../../../types/assistant.types'
import { ChatModel } from '../../../../../types/chat-model.types'
import {
  Mentionable,
  MentionableFolder,
  MentionableModel,
} from '../../../../../types/mentionable'
import { renderAssistantIcon } from '../../../../../utils/assistant-icon'
import {
  getMentionableName,
  serializeMentionable,
} from '../../../../../utils/chat/mentionable'
import { SearchableMentionable } from '../../../../../utils/fuzzy-search'
import { CHAT_MODES, type ChatMode } from '../../ChatModeSelect'
import { getMentionableIcon } from '../../utils/get-metionable-icon'
import { MenuOption, MenuTextMatch } from '../shared/LexicalMenu'
import {
  LexicalTypeaheadMenuPlugin,
  useBasicTypeaheadTriggerMatch,
} from '../typeahead-menu/LexicalTypeaheadMenuPlugin'

import { $createMentionNode } from './MentionNode'

const PUNCTUATION =
  '\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%\'"~=<>_:;'
const NAME = '\\b[A-Z][^\\s' + PUNCTUATION + ']'

const DocumentMentionsRegex = {
  NAME,
  PUNCTUATION,
}

const PUNC = DocumentMentionsRegex.PUNCTUATION

const TRIGGERS = ['@'].join('')

// Chars we expect to see in a mention (non-space, non-punctuation).
const VALID_CHARS = '[^' + TRIGGERS + PUNC + '\\s]'

// Non-standard series of chars. Each series must be preceded and followed by
// a valid char.
const VALID_JOINS =
  '(?:' +
  '\\.[ |$]|' + // E.g. "r. " in "Mr. Smith"
  ' |' + // E.g. " " in "Josh Duck"
  '[' +
  PUNC +
  ']|' + // E.g. "-' in "Salier-Hellendag"
  ')'

const LENGTH_LIMIT = 75

const AtSignMentionsRegex = new RegExp(
  `(^|\\s|\\()([${TRIGGERS}]((?:${VALID_CHARS}${VALID_JOINS}){0,${LENGTH_LIMIT}}))$`,
)

// 50 is the longest alias length limit.
const ALIAS_LENGTH_LIMIT = 50

// Regex used to match alias.
const AtSignMentionsRegexAliasRegex = new RegExp(
  `(^|\\s|\\()([${TRIGGERS}]((?:${VALID_CHARS}){0,${ALIAS_LENGTH_LIMIT}}))$`,
)

// At most, 20 suggestions are shown in the popup.
const SUGGESTION_LIST_LENGTH_LIMIT = 20

function getDisplayFileName(name: string): string {
  return name.toLowerCase().endsWith('.md') ? name.slice(0, -3) : name
}

function getFileParentFolderPath(filePath: string): string {
  const lastSlashIndex = filePath.lastIndexOf('/')
  if (lastSlashIndex <= 0) {
    return '/'
  }
  return `/${filePath.slice(0, lastSlashIndex)}`
}

type MentionMenuMode = 'direct-search' | 'entry'
type MentionMenuScope =
  | 'root'
  | 'assistant'
  | 'file'
  | 'folder'
  | 'mode'
  | 'model'
type MentionEntryOptionType =
  | 'current-file'
  | 'assistant'
  | 'file'
  | 'folder'
  | 'mode'
  | 'model'
type MentionChatMode = ChatMode
type MentionMenuTransitionDirection = 'none' | 'forward' | 'back'

type MentionTypeaheadOptionPayload =
  | {
      kind: 'back'
      label: string
    }
  | {
      kind: 'entry'
      entryType: MentionEntryOptionType
      label: string
      subtitle?: string
    }
  | {
      kind: 'assistant'
      assistant: Assistant
      isCurrent: boolean
    }
  | {
      kind: 'mode'
      mode: MentionChatMode
      label: string
      subtitle?: string
      isCurrent: boolean
    }
  | {
      kind: 'mentionable'
      mentionable: Mentionable
      subtitle?: string
      isSelected?: boolean
    }

function checkForAtSignMentions(
  text: string,
  minMatchLength: number,
): MenuTextMatch | null {
  let match = AtSignMentionsRegex.exec(text)

  if (match === null) {
    match = AtSignMentionsRegexAliasRegex.exec(text)
  }
  if (match !== null) {
    // The strategy ignores leading whitespace but we need to know it's
    // length to add it to the leadOffset
    const maybeLeadingWhitespace = match[1]

    const matchingString = match[3]
    if (matchingString.length >= minMatchLength) {
      return {
        leadOffset: match.index + maybeLeadingWhitespace.length,
        matchingString,
        replaceableString: match[2],
      }
    }
  }
  return null
}

function getPossibleQueryMatch(text: string): MenuTextMatch | null {
  return checkForAtSignMentions(text, 0)
}

class MentionTypeaheadOption extends MenuOption {
  name: string
  subtitle: string | null
  payload: MentionTypeaheadOptionPayload

  constructor(payload: MentionTypeaheadOptionPayload) {
    let key = 'unknown'
    let name = ''
    let subtitle: string | null = null

    if (payload.kind === 'back') {
      key = 'entry:back'
      name = payload.label
      subtitle = null
    } else if (payload.kind === 'entry') {
      key = `entry:${payload.entryType}`
      name = payload.label
      subtitle = payload.subtitle ?? null
    } else if (payload.kind === 'assistant') {
      key = `assistant:${payload.assistant.id}`
      name = payload.assistant.name
      subtitle = payload.assistant.description ?? null
    } else if (payload.kind === 'mode') {
      key = `mode:${payload.mode}`
      name = payload.label
      subtitle = payload.subtitle ?? null
    } else {
      const mentionable = payload.mentionable
      switch (mentionable.type) {
        case 'file':
          key = mentionable.file.path
          name = getDisplayFileName(mentionable.file.name)
          subtitle = payload.subtitle ?? null
          break
        case 'folder':
          key = mentionable.folder.path
          name = mentionable.folder.name
          subtitle = payload.subtitle ?? null
          break
        case 'model':
          key = `model:${mentionable.modelId}`
          name = mentionable.name
          subtitle = payload.subtitle ?? mentionable.providerId ?? null
          break
        default:
          key = 'unknown'
          name = ''
          subtitle = null
          break
      }
    }

    super(key)
    this.name = name
    this.subtitle = subtitle
    this.payload = payload
  }
}

function MentionsTypeaheadMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: (event: React.MouseEvent<HTMLElement>) => void
  option: MentionTypeaheadOption
}) {
  let iconNode: ReactNode = null
  const isInlineMetaOption =
    option.payload.kind === 'assistant' ||
    option.payload.kind === 'mode' ||
    (option.payload.kind === 'mentionable' &&
      (option.payload.mentionable.type === 'model' ||
        option.payload.mentionable.type === 'folder' ||
        option.payload.mentionable.type === 'file') &&
      Boolean(option.subtitle))

  if (option.payload.kind === 'back') {
    iconNode = (
      <ArrowLeft size={14} className="yolo-smart-space-mention-option-icon" />
    )
  } else if (option.payload.kind === 'entry') {
    if (option.payload.entryType === 'assistant') {
      iconNode = (
        <Bot size={14} className="yolo-smart-space-mention-option-icon" />
      )
    } else if (option.payload.entryType === 'mode') {
      iconNode = (
        <MessageSquare
          size={14}
          className="yolo-smart-space-mention-option-icon"
        />
      )
    } else if (option.payload.entryType === 'model') {
      iconNode = (
        <Cpu size={14} className="yolo-smart-space-mention-option-icon" />
      )
    } else if (option.payload.entryType === 'file') {
      iconNode = (
        <FileIcon size={14} className="yolo-smart-space-mention-option-icon" />
      )
    } else if (option.payload.entryType === 'current-file') {
      iconNode = (
        <FileText size={14} className="yolo-smart-space-mention-option-icon" />
      )
    } else {
      iconNode = (
        <FolderClosedIcon
          size={14}
          className="yolo-smart-space-mention-option-icon"
        />
      )
    }
  } else if (option.payload.kind === 'assistant') {
    iconNode = renderAssistantIcon(
      option.payload.assistant.icon,
      14,
      'yolo-smart-space-mention-option-icon',
    )
  } else if (option.payload.kind === 'mode') {
    iconNode =
      option.payload.mode === 'agent-full' ? (
        <InfinityIcon
          size={14}
          className="yolo-smart-space-mention-option-icon"
        />
      ) : option.payload.mode === 'agent' ? (
        <Bot size={14} className="yolo-smart-space-mention-option-icon" />
      ) : (
        <MessageSquare
          size={14}
          className="yolo-smart-space-mention-option-icon"
        />
      )
  } else {
    const Icon = getMentionableIcon(option.payload.mentionable)
    if (Icon) {
      iconNode = (
        <Icon size={14} className="yolo-smart-space-mention-option-icon" />
      )
    }
  }

  return (
    <button
      type="button"
      className={`yolo-popover-item yolo-smart-space-mention-option ${
        isSelected ? 'active' : ''
      }`}
      ref={(el) => option.setRefElement(el)}
      role="option"
      aria-selected={isSelected}
      id={`typeahead-item-${index}`}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      data-highlighted={isSelected ? 'true' : undefined}
    >
      {iconNode}
      <div
        className={`yolo-smart-space-mention-option-text${
          isInlineMetaOption
            ? ' yolo-smart-space-mention-option-text--inline-meta'
            : ''
        }`}
      >
        <div className="yolo-smart-space-mention-option-name">
          {option.name}
        </div>
        {option.subtitle && (
          <div
            className={`yolo-smart-space-mention-option-path${
              isInlineMetaOption
                ? ' yolo-smart-space-mention-option-inline-meta'
                : ''
            }`}
          >
            {option.subtitle}
          </div>
        )}
      </div>
      {((option.payload.kind === 'assistant' ||
        option.payload.kind === 'mode') &&
        option.payload.isCurrent) ||
      (option.payload.kind === 'mentionable' && option.payload.isSelected) ? (
        <Check size={12} className="yolo-smart-space-mention-option-check" />
      ) : null}
      {option.payload.kind === 'entry' && (
        <ChevronRight
          size={14}
          className="yolo-smart-space-mention-option-expand"
        />
      )}
    </button>
  )
}

/**
 * Syncs the LexicalMenu internal selectedIndex to outer state so that
 * customKeyHandlers / sub-panel derivation logic can decide preview based
 * on the main panel's keyboard-highlighted item. Wrapped in a standalone
 * component with useEffect to avoid setState cycles in the menuRenderFn
 * render path.
 */
function MainSelectedIndexSync({
  selectedIndex,
  setMainSelectedIndex,
}: {
  selectedIndex: number | null
  setMainSelectedIndex: (index: number | null) => void
}): null {
  useEffect(() => {
    setMainSelectedIndex(selectedIndex)
  }, [selectedIndex, setMainSelectedIndex])
  return null
}

export default function NewMentionsPlugin({
  searchResultByQuery,
  onMenuOpenChange,
  menuContainerRef,
  placement = 'top',
  mentionDisplayMode = 'inline',
  onSelectMentionable,
  menuMode = 'direct-search',
  assistants = [],
  currentAssistantId,
  onSelectAssistant,
  currentChatMode,
  onSelectChatMode,
  allowAgentModeOption = true,
  models = [],
  selectedModelIds = [],
  searchFoldersByQuery,
}: {
  searchResultByQuery: (query: string) => SearchableMentionable[]
  onMenuOpenChange?: (isOpen: boolean) => void
  menuContainerRef?: RefObject<HTMLElement>
  placement?: 'top' | 'bottom'
  mentionDisplayMode?: 'inline' | 'badge'
  onSelectMentionable?: (mentionable: Mentionable) => void
  menuMode?: MentionMenuMode
  assistants?: Assistant[]
  currentAssistantId?: string
  onSelectAssistant?: (assistantId: string) => void
  currentChatMode?: MentionChatMode
  onSelectChatMode?: (mode: MentionChatMode) => void
  allowAgentModeOption?: boolean
  models?: ChatModel[]
  selectedModelIds?: string[]
  searchFoldersByQuery?: (query: string) => MentionableFolder[]
}): ReactJSX.Element | null {
  const [editor] = useLexicalComposerContext()
  const app = useApp()
  const { settings } = useSettings()

  const [queryString, setQueryString] = useState<string | null>(null)
  const [menuScope, setMenuScope] = useState<MentionMenuScope>('root')
  const [menuContentTransition, setMenuContentTransition] = useState<{
    direction: MentionMenuTransitionDirection
    nonce: number
  }>({ direction: 'none', nonce: 0 })
  // Hover/arrow-key preview sub-panel state (only active when menuScope === 'root'
  // and not in search/direct-search mode).
  // - hoveredEntry: the top-level entry currently hovered by mouse, written by a ~100ms open timer.
  // - focusSide: which panel has keyboard focus ('main' = default main panel, 'sub' = entered sub-panel).
  // - subHighlightedIndex: keyboard-highlighted item index in the sub-panel.
  // - previewEntry derived: hover takes priority; otherwise the main panel's currently
  //   highlighted entry (if it's an entry type).
  const [hoveredEntry, setHoveredEntry] =
    useState<MentionEntryOptionType | null>(null)
  const [focusSide, setFocusSide] = useState<'main' | 'sub'>('main')
  const [subHighlightedIndex, setSubHighlightedIndex] = useState(0)
  // Current keyboard-highlighted index of the main panel. selectedIndex is available
  // inside menuRenderFn, but customKeyHandlers and sub-panel derivation live in
  // closures outside the render path. Synced via state to drive sub-panel preview
  // when keyboard-navigating the main panel.
  const [mainSelectedIndex, setMainSelectedIndex] = useState<number | null>(
    null,
  )
  // Shared close timer: main panel leave starts it, sub-panel enter cancels it,
  // treating main+sub panels as a single hover region so crossing the gap doesn't trigger close.
  const closeTimerRef = useRef<number | null>(null)
  const openTimerRef = useRef<number | null>(null)
  // Sub-panel DOM container ref, used to measure viewport space and decide flip direction.
  const subPanelRef = useRef<HTMLDivElement | null>(null)
  const mainPanelRef = useRef<HTMLDivElement | null>(null)
  // Popover root container (position:relative), used as the reference for sub-panel
  // absolute positioning; also hosts --yolo-sub-anchor-top / --yolo-sub-anchor-bottom CSS vars.
  const popoverRef = useRef<HTMLDivElement | null>(null)
  // 'right' = default right side; 'left' = flipped to left when space is insufficient; 'hidden' = neither side fits, don't render.
  const [subSide, setSubSide] = useState<'right' | 'left' | 'hidden'>('right')
  const { t } = useLanguage()
  const mentionableUnitLabels = useMemo(
    () => ({
      characters: t('common.characters', 'chars'),
      words: t('common.words', 'words'),
      wordsCharacters: t('common.wordsCharacters', 'words/chars'),
    }),
    [t],
  )

  useEffect(() => {
    return () => {
      onMenuOpenChange?.(false)
    }
  }, [onMenuOpenChange])

  const clearHoverTimers = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])

  const resetSubPreviewState = useCallback(() => {
    clearHoverTimers()
    setHoveredEntry(null)
    setFocusSide('main')
    setSubHighlightedIndex(0)
    setMainSelectedIndex(null)
  }, [clearHoverTimers])

  const animateMenuContent = useCallback(
    (direction: MentionMenuTransitionDirection) => {
      setMenuContentTransition((prev) => ({
        direction,
        nonce: prev.nonce + 1,
      }))
    },
    [],
  )

  useEffect(() => {
    if (queryString === null) {
      setMenuScope('root')
      resetSubPreviewState()
    }
  }, [queryString, resetSubPreviewState])

  // Clean up timers on unmount to avoid React warnings or setState on unmounted components.
  useEffect(() => {
    return () => {
      clearHoverTimers()
    }
  }, [clearHoverTimers])

  const normalizedQuery = useMemo(
    () => (queryString ?? '').trim().toLowerCase(),
    [queryString],
  )

  const providerLabelById = useMemo(
    () =>
      new Map(
        settings.providers.map((provider) => [
          provider.id,
          PROVIDER_PRESET_INFO[provider.presetType]?.label ?? provider.id,
        ]),
      ),
    [settings.providers],
  )

  const results = useMemo(() => {
    if (queryString == null) return []
    return searchResultByQuery(queryString)
  }, [queryString, searchResultByQuery])

  const modelMentionables = useMemo<MentionableModel[]>(
    () =>
      models.map((model) => ({
        type: 'model',
        modelId: model.id,
        name: model.name?.trim() || model.model || model.id,
        providerId: model.providerId,
      })),
    [models],
  )
  const filteredModelMentionables = useMemo(() => {
    if (!normalizedQuery) {
      return modelMentionables
    }

    return modelMentionables.filter((model) => {
      const providerId = model.providerId ?? ''
      const providerLabel = providerLabelById.get(providerId) ?? providerId
      return (
        model.name.toLowerCase().includes(normalizedQuery) ||
        model.modelId.toLowerCase().includes(normalizedQuery) ||
        providerId.toLowerCase().includes(normalizedQuery) ||
        providerLabel.toLowerCase().includes(normalizedQuery)
      )
    })
  }, [modelMentionables, normalizedQuery, providerLabelById])

  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  })

  /**
   * Build the secondary option list for a given top-level entry type (excluding "Back").
   * This function is reused by two code paths:
   * 1) drill-down: user clicks an entry, setMenuScope('xxx'), the main panel is replaced
   *    with [back, ...subOptions]
   * 2) hover/keyboard preview: the right-side sub-panel renders independently using this
   *    function's returned list
   * Both paths produce identical options, preventing behavioral drift. */
  const getSubOptionsForEntry = useCallback(
    (
      entryType: MentionEntryOptionType,
      subQuery: string,
    ): MentionTypeaheadOption[] => {
      const lowerQuery = subQuery.trim().toLowerCase()

      if (entryType === 'mode') {
        const modeOptions: MentionChatMode[] = allowAgentModeOption
          ? [...CHAT_MODES]
          : ['ask']
        return modeOptions
          .map((mode) => {
            const label =
              mode === 'agent-full'
                ? t('chatMode.agentFull', 'Agent (YOLO)')
                : mode === 'agent'
                  ? t('chatMode.agent', 'Agent')
                  : t('chatMode.ask', 'Ask')
            const subtitle =
              mode === 'agent-full'
                ? t(
                    'chatMode.agentFullDesc',
                    'Auto-approve tool calls for complex tasks',
                  )
                : mode === 'agent'
                  ? t('chatMode.agentDesc', 'Enable tool calling capabilities')
                  : t('chatMode.askDesc', 'Ask, refine, create')
            return { mode, label, subtitle }
          })
          .filter((option) => {
            if (!lowerQuery) return true
            return (
              option.label.toLowerCase().includes(lowerQuery) ||
              option.subtitle.toLowerCase().includes(lowerQuery)
            )
          })
          .map(
            (option) =>
              new MentionTypeaheadOption({
                kind: 'mode',
                mode: option.mode,
                label: option.label,
                subtitle: option.subtitle,
                isCurrent: option.mode === (currentChatMode ?? 'ask'),
              }),
          )
      }

      if (entryType === 'assistant') {
        return assistants
          .filter((assistant) => {
            if (!lowerQuery) return true
            const description = assistant.description ?? ''
            return (
              assistant.name.toLowerCase().includes(lowerQuery) ||
              description.toLowerCase().includes(lowerQuery)
            )
          })
          .map(
            (assistant) =>
              new MentionTypeaheadOption({
                kind: 'assistant',
                assistant,
                isCurrent: assistant.id === currentAssistantId,
              }),
          )
      }

      if (entryType === 'model') {
        const filtered = lowerQuery
          ? modelMentionables.filter((model) => {
              const providerId = model.providerId ?? ''
              const providerLabel =
                providerLabelById.get(providerId) ?? providerId
              return (
                model.name.toLowerCase().includes(lowerQuery) ||
                model.modelId.toLowerCase().includes(lowerQuery) ||
                providerId.toLowerCase().includes(lowerQuery) ||
                providerLabel.toLowerCase().includes(lowerQuery)
              )
            })
          : modelMentionables
        return filtered.map(
          (mentionable) =>
            new MentionTypeaheadOption({
              kind: 'mentionable',
              mentionable,
              subtitle:
                mentionable.providerId != null
                  ? (providerLabelById.get(mentionable.providerId) ??
                    mentionable.providerId)
                  : undefined,
              isSelected: selectedModelIds.includes(mentionable.modelId),
            }),
        )
      }

      if (entryType === 'folder') {
        // Prefer searchFoldersByQuery (covers the entire vault folder tree);
        // fall back to folder-type results when not provided (consistent with pre-refactor),
        // drill-down and hover preview reuse the same path to ensure data consistency.
        const folderMentionables: MentionableFolder[] = searchFoldersByQuery
          ? searchFoldersByQuery(subQuery)
          : results.filter(
              (result): result is MentionableFolder => result.type === 'folder',
            )
        return folderMentionables.map(
          (mentionable) =>
            new MentionTypeaheadOption({
              kind: 'mentionable',
              mentionable,
              subtitle: `/${mentionable.folder.path}`,
            }),
        )
      }

      if (entryType === 'file') {
        const fileResults = searchResultByQuery(subQuery).filter(
          (result): result is SearchableMentionable & { type: 'file' } =>
            result.type === 'file',
        )
        return fileResults.map(
          (mentionable) =>
            new MentionTypeaheadOption({
              kind: 'mentionable',
              mentionable,
              subtitle: getFileParentFolderPath(mentionable.file.path),
            }),
        )
      }

      // 'current-file' is a leaf, should not reach here.
      return []
    },
    [
      allowAgentModeOption,
      assistants,
      currentAssistantId,
      currentChatMode,
      modelMentionables,
      providerLabelById,
      results,
      searchFoldersByQuery,
      searchResultByQuery,
      selectedModelIds,
      t,
    ],
  )

  const options = useMemo(() => {
    if (queryString == null) {
      return [] as MentionTypeaheadOption[]
    }

    if (menuMode === 'direct-search') {
      return results
        .map(
          (result) =>
            new MentionTypeaheadOption({
              kind: 'mentionable',
              mentionable: result,
            }),
        )
        .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
    }

    if (menuScope === 'root') {
      if (normalizedQuery) {
        const searchableMentionables = results
          .filter(
            (
              result,
            ): result is SearchableMentionable & { type: 'file' | 'folder' } =>
              result.type === 'file' || result.type === 'folder',
          )
          .map(
            (mentionable) =>
              new MentionTypeaheadOption({
                kind: 'mentionable',
                mentionable,
                subtitle:
                  mentionable.type === 'file'
                    ? getFileParentFolderPath(mentionable.file.path)
                    : `/${mentionable.folder.path}`,
              }),
          )

        const assistantOptions = assistants
          .filter((assistant) => {
            const description = assistant.description ?? ''
            return (
              assistant.name.toLowerCase().includes(normalizedQuery) ||
              description.toLowerCase().includes(normalizedQuery)
            )
          })
          .map(
            (assistant) =>
              new MentionTypeaheadOption({
                kind: 'assistant',
                assistant,
                isCurrent: assistant.id === currentAssistantId,
              }),
          )

        const modelOptions = filteredModelMentionables.map(
          (mentionable) =>
            new MentionTypeaheadOption({
              kind: 'mentionable',
              mentionable,
              subtitle:
                mentionable.providerId != null
                  ? (providerLabelById.get(mentionable.providerId) ??
                    mentionable.providerId)
                  : undefined,
              isSelected: selectedModelIds.includes(mentionable.modelId),
            }),
        )

        return [
          ...searchableMentionables,
          ...assistantOptions,
          ...modelOptions,
        ].slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
      }

      const entryOptions: Array<{
        entryType: MentionEntryOptionType
        label: string
      }> = [
        {
          entryType: 'current-file',
          label: t('chat.mentionMenu.entryCurrentFile', 'Current file'),
        },
        {
          entryType: 'assistant',
          label: t('chat.mentionMenu.entryAssistant', 'Assistants'),
        },
        {
          entryType: 'file',
          label: t('chat.mentionMenu.entryFile', 'Files'),
        },
        {
          entryType: 'folder',
          label: t('chat.mentionMenu.entryFolder', 'Folders'),
        },
      ]
      if (onSelectChatMode) {
        entryOptions.splice(1, 0, {
          entryType: 'mode',
          label: t('chat.mentionMenu.entryMode', 'Mode'),
        })
      }
      entryOptions.push({
        entryType: 'model',
        label: t('chat.mentionMenu.entryModel', 'Models'),
      })
      return entryOptions
        .map(
          (entry) =>
            new MentionTypeaheadOption({
              kind: 'entry',
              entryType: entry.entryType,
              label: entry.label,
            }),
        )
        .slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
    }

    // Drill-down sub-panel: reuse getSubOptionsForEntry to stay consistent with hover preview.
    const scopeEntryMap: Record<
      Exclude<MentionMenuScope, 'root'>,
      MentionEntryOptionType
    > = {
      mode: 'mode',
      assistant: 'assistant',
      model: 'model',
      folder: 'folder',
      file: 'file',
    }
    const entryType = scopeEntryMap[menuScope]
    const subOptions = getSubOptionsForEntry(entryType, queryString ?? '')
    const backOption = new MentionTypeaheadOption({
      kind: 'back',
      label: t('chat.mentionMenu.back', 'Back'),
    })
    // folder scope originally had no slice limit; preserved here to avoid behavior change.
    if (menuScope === 'folder') {
      return [backOption, ...subOptions]
    }
    return [backOption, ...subOptions].slice(0, SUGGESTION_LIST_LENGTH_LIMIT)
  }, [
    assistants,
    currentAssistantId,
    filteredModelMentionables,
    getSubOptionsForEntry,
    menuMode,
    menuScope,
    onSelectChatMode,
    normalizedQuery,
    providerLabelById,
    queryString,
    results,
    selectedModelIds,
    t,
  ])

  const onSelectOption = useCallback(
    (
      selectedOption: MentionTypeaheadOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void,
    ) => {
      if (selectedOption.payload.kind === 'back') {
        if (nodeToReplace) {
          const triggerNode = $createTextNode('@')
          nodeToReplace.replace(triggerNode)
          triggerNode.selectEnd()
        }
        animateMenuContent('back')
        setMenuScope('root')
        return
      }

      if (selectedOption.payload.kind === 'entry') {
        if (selectedOption.payload.entryType === 'current-file') {
          const activeFile = app.workspace.getActiveFile()
          if (!activeFile) {
            closeMenu()
            return
          }
          const currentFileMentionable: Mentionable = {
            type: 'file',
            file: activeFile,
          }

          if (mentionDisplayMode === 'badge') {
            if (nodeToReplace) {
              const emptyNode = $createTextNode('')
              nodeToReplace.replace(emptyNode)
              emptyNode.select()
            }
            onSelectMentionable?.(currentFileMentionable)
            closeMenu()
            return
          }

          const mentionNode = $createMentionNode(
            getMentionableName(currentFileMentionable, {
              unitLabels: mentionableUnitLabels,
              currentFileLabel: t(
                'chat.mentionMenu.entryCurrentFile',
                'Current file',
              ),
            }),
            serializeMentionable(currentFileMentionable),
          )
          if (nodeToReplace) {
            nodeToReplace.replace(mentionNode)
          }
          const spaceNode = $createTextNode(' ')
          mentionNode.insertAfter(spaceNode)
          spaceNode.select()
          closeMenu()
          return
        }

        const nextScope: MentionMenuScope =
          selectedOption.payload.entryType === 'assistant'
            ? 'assistant'
            : selectedOption.payload.entryType === 'mode'
              ? 'mode'
              : selectedOption.payload.entryType === 'model'
                ? 'model'
                : selectedOption.payload.entryType === 'file'
                  ? 'file'
                  : 'folder'
        if (nodeToReplace) {
          const triggerNode = $createTextNode('@')
          nodeToReplace.replace(triggerNode)
          triggerNode.selectEnd()
        }
        animateMenuContent('forward')
        setMenuScope(nextScope)
        // After drill-down the sub-panel's semantics are replaced by the main panel, so hover preview state must be cleared.
        resetSubPreviewState()
        return
      }

      if (selectedOption.payload.kind === 'assistant') {
        if (nodeToReplace) {
          const emptyNode = $createTextNode('')
          nodeToReplace.replace(emptyNode)
          emptyNode.select()
        }
        onSelectAssistant?.(selectedOption.payload.assistant.id)
        closeMenu()
        return
      }

      if (selectedOption.payload.kind === 'mode') {
        if (nodeToReplace) {
          const emptyNode = $createTextNode('')
          nodeToReplace.replace(emptyNode)
          emptyNode.select()
        }
        onSelectChatMode?.(selectedOption.payload.mode)
        closeMenu()
        return
      }

      if (mentionDisplayMode === 'badge') {
        if (nodeToReplace) {
          const emptyNode = $createTextNode('')
          nodeToReplace.replace(emptyNode)
          emptyNode.select()
        }
        onSelectMentionable?.(selectedOption.payload.mentionable)
        closeMenu()
        return
      }

      const mentionNode = $createMentionNode(
        getMentionableName(selectedOption.payload.mentionable, {
          unitLabels: mentionableUnitLabels,
        }),
        serializeMentionable(selectedOption.payload.mentionable),
      )
      if (nodeToReplace) {
        nodeToReplace.replace(mentionNode)
      }

      const spaceNode = $createTextNode(' ')
      mentionNode.insertAfter(spaceNode)

      spaceNode.select()
      closeMenu()
    },
    [
      animateMenuContent,
      app,
      mentionDisplayMode,
      mentionableUnitLabels,
      onSelectAssistant,
      onSelectChatMode,
      onSelectMentionable,
      resetSubPreviewState,
      t,
    ],
  )

  // Derive the currently previewed entry: no preview during search/direct-search/after drill-down.
  // Otherwise hover takes priority; when hover is inactive (keyboard-only scenario), use the
  // main panel's current selectedIndex entry option so the sub-panel refreshes as arrow keys move.
  const shouldRenderSubpanel =
    !normalizedQuery && menuMode !== 'direct-search' && menuScope === 'root'
  let previewEntry: MentionEntryOptionType | null = null
  if (shouldRenderSubpanel) {
    if (hoveredEntry !== null) {
      previewEntry = hoveredEntry
    } else if (mainSelectedIndex !== null) {
      const candidate = options[mainSelectedIndex]
      if (candidate && candidate.payload.kind === 'entry') {
        previewEntry = candidate.payload.entryType
      }
    }
  }
  // Leaf entries don't get a sub-panel.
  const previewEntryEffective =
    previewEntry && previewEntry !== 'current-file' ? previewEntry : null
  const subOptions = useMemo(
    () =>
      previewEntryEffective
        ? getSubOptionsForEntry(previewEntryEffective, '').slice(
            0,
            SUGGESTION_LIST_LENGTH_LIMIT,
          )
        : ([] as MentionTypeaheadOption[]),
    [getSubOptionsForEntry, previewEntryEffective],
  )

  // Enter keyboard sub-panel focus only when the sub-panel is visible; revert to main when going sub -> main or when the sub-panel disappears.
  useEffect(() => {
    if (subOptions.length === 0 || !previewEntryEffective) {
      if (focusSide === 'sub') setFocusSide('main')
      if (subHighlightedIndex !== 0) setSubHighlightedIndex(0)
    } else if (subHighlightedIndex >= subOptions.length) {
      setSubHighlightedIndex(0)
    }
  }, [subOptions.length, previewEntryEffective, focusSide, subHighlightedIndex])

  // Flip measurement: recalculated each time the sub-panel appears, main panel resizes,
  // or viewport resizes. The required width matches the actual rule in popover.css for
  // .yolo-smart-space-mention-subpanel:
  //   width: min(480px, calc(100vw - 24px))
  // Constrained within the Chat container boundary set by LexicalMenu; sidebar Chat does
  // not expand across panes. If neither side has enough space, set to 'hidden' and fall
  // back to drill-down.
  useLayoutEffect(() => {
    if (!previewEntryEffective || subOptions.length === 0) return
    const main = mainPanelRef.current
    if (!main) return
    const win = main.ownerDocument?.defaultView ?? window
    // Parse CSS variable --yolo-chat-typeahead-max-width; only px values are supported.
    // Falls back to 480 on parse failure, consistent with the default in popover.css.
    const parseMaxWidthPx = (raw: string): number => {
      const trimmed = raw.trim()
      if (!trimmed) return 480
      const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed)
      if (!match) return 480
      const value = Number.parseFloat(match[1])
      return Number.isFinite(value) && value > 0 ? value : 480
    }
    const parseOptionalPx = (raw: string): number | null => {
      const trimmed = raw.trim()
      const match = /^(-?\d+(?:\.\d+)?)px$/.exec(trimmed)
      if (!match) return null
      const value = Number.parseFloat(match[1])
      return Number.isFinite(value) ? value : null
    }
    const measure = () => {
      const mainRect = main.getBoundingClientRect()
      const viewportWidth = win.innerWidth
      const gap = 6
      const style = win.getComputedStyle(main)
      // Synced with CSS min(var(--yolo-chat-typeahead-max-width, 480px), 100vw - 24px).
      const maxWidthPx = parseMaxWidthPx(
        style.getPropertyValue('--yolo-chat-typeahead-max-width'),
      )
      const requiredWidth = Math.min(
        maxWidthPx,
        Math.max(0, viewportWidth - 24),
      )
      const boundaryLeft =
        parseOptionalPx(
          style.getPropertyValue('--yolo-typeahead-boundary-left'),
        ) ?? 0
      const boundaryRight =
        parseOptionalPx(
          style.getPropertyValue('--yolo-typeahead-boundary-right'),
        ) ?? viewportWidth
      const effectiveLeft = Math.max(0, boundaryLeft)
      const effectiveRight = Math.min(viewportWidth, boundaryRight)
      const spaceRight = effectiveRight - mainRect.right - gap
      const spaceLeft = mainRect.left - effectiveLeft - gap
      if (spaceRight >= requiredWidth) {
        setSubSide('right')
      } else if (spaceLeft >= requiredWidth) {
        setSubSide('left')
      } else {
        setSubSide('hidden')
      }
    }
    measure()
    win.addEventListener('resize', measure)
    return () => {
      win.removeEventListener('resize', measure)
    }
  }, [previewEntryEffective, subOptions.length, hoveredEntry])

  // Sub-panel anchor measurement: write the current preview entry's top/bottom relative
  // to the popover container as CSS variables. The sub-panel uses placement (top/bottom)
  // to decide bottom-align (top placement, expand upward) or top-align (bottom placement,
  // expand downward). Industry convention: sub-menu expands in the same direction as
  // the main menu. With placement='top', main menu opens upward, so sub-menu also
  // opens upward, bottom-aligned to the hovered item.
  const previewAnchorIndex = useMemo(() => {
    if (!previewEntryEffective) return -1
    return options.findIndex(
      (o) =>
        o.payload.kind === 'entry' &&
        o.payload.entryType === previewEntryEffective,
    )
  }, [options, previewEntryEffective])

  useLayoutEffect(() => {
    const popover = popoverRef.current
    const main = mainPanelRef.current
    if (!popover || !main) return
    if (
      previewAnchorIndex < 0 ||
      subOptions.length === 0 ||
      subSide === 'hidden'
    )
      return
    const items = main.querySelectorAll<HTMLElement>('[role="option"]')
    const item = items[previewAnchorIndex]
    if (!item) return
    const popoverRect = popover.getBoundingClientRect()
    const itemRect = item.getBoundingClientRect()
    const top = Math.round(itemRect.top - popoverRect.top)
    const bottom = Math.round(itemRect.bottom - popoverRect.top)
    popover.setCssProps({
      '--yolo-sub-anchor-top': `${top}px`,
      '--yolo-sub-anchor-bottom': `${bottom}px`,
    })
  }, [previewAnchorIndex, subOptions.length, subSide, placement])

  // Sub-panel item selection: reuses onSelectOption's downstream logic (mode / assistant / mentionable).
  // But this path has no `nodeToReplace` concept since sub-panel items don't come from the main
  // panel's selectOptionAndCleanUp. Solution: call selectOptionAndCleanUp (injected by LexicalMenu)
  // with the sub-panel option. LexicalMenu handles split text node + calls our onSelectOption,
  // producing mention node / badge identical to drill-down.

  // Sub-panel Enter/click selection goes through selectOptionAndCleanUp (provided by
  // LexicalMenu's menuRenderFn). But customKeyHandlers are declared at the
  // LexicalTypeaheadMenuPlugin level, in a different closure from menuRenderFn.
  // Use a ref to expose the latest selectOptionAndCleanUp.
  const selectOptionAndCleanUpRef = useRef<
    ((option: MentionTypeaheadOption) => void) | null
  >(null)
  // Same as above: expose setHighlightedIndex to top-level effects for syncing main panel highlight when hoveredEntry changes.
  const setHighlightedIndexRef = useRef<((index: number) => void) | null>(null)

  // hover open/close helpers
  const HOVER_OPEN_MS = 100
  const HOVER_CLOSE_MS = 150
  const cancelHoverOpen = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
  }, [])
  const scheduleHoverOpen = useCallback(
    (entryType: MentionEntryOptionType, delayMs: number = HOVER_OPEN_MS) => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
      cancelHoverOpen()
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null
        setHoveredEntry(entryType)
      }, delayMs)
    },
    [cancelHoverOpen],
  )
  const scheduleHoverClose = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current)
      openTimerRef.current = null
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setHoveredEntry(null)
      setFocusSide('main')
    }, HOVER_CLOSE_MS)
  }, [])
  const cancelHoverClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const checkForMentionMatch = useCallback(
    (text: string) => {
      const slashMatch = checkForSlashTriggerMatch(text, editor)

      if (slashMatch !== null) {
        return null
      }
      return getPossibleQueryMatch(text)
    },
    [checkForSlashTriggerMatch, editor],
  )

  const getDefaultHighlightedIndex = useCallback(
    (menuOptions: MentionTypeaheadOption[]) => {
      if (menuScope === 'root' || menuMode !== 'entry') {
        return 0
      }
      const firstOption = menuOptions[0]
      if (firstOption?.payload.kind === 'back' && menuOptions.length > 1) {
        return 1
      }
      return 0
    },
    [menuMode, menuScope],
  )

  // scrollIntoView for the sub-panel's keyboard-highlighted item, preventing it from scrolling out of the visible area in long lists.
  useEffect(() => {
    if (focusSide !== 'sub') return
    const option = subOptions[subHighlightedIndex]
    const el = option?.ref?.current
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [focusSide, subHighlightedIndex, subOptions])

  // When switching the previewed entry, reset the sub-panel scroll to top to avoid leftover scrollTop from a previous long list.
  useEffect(() => {
    if (subPanelRef.current) {
      subPanelRef.current.scrollTop = 0
    }
  }, [previewEntryEffective])

  // Only intercept keyboard when the sub-panel is visible and not hidden. Always pass through during IME composition.
  const subPanelActive =
    shouldRenderSubpanel &&
    previewEntryEffective !== null &&
    subOptions.length > 0 &&
    subSide !== 'hidden'

  // Safe triangle: when the mouse moves diagonally from the current hover item to the sub-panel,
  // it passes over other main menu items. A triangle (midpoint of the hovered item's "sub-panel side"
  // edge + the top/bottom endpoints of the sub-panel's "main panel side" edge) determines whether
  // the mouse is on the path toward the sub-panel; when inside the triangle, other entry hovers
  // don't trigger a preview switch.
  // Mouse position recorded when hover is triggered on the anchor item; serves as triangle vertex A.
  // Reset when hoveredEntry changes (see effect below).
  const anchorCursorPosRef = useRef<{ x: number; y: number } | null>(null)
  const lastCursorPosRef = useRef<{ x: number; y: number } | null>(null)
  // Sync ref state to React state so the popover's data-safe-active attribute update drives CSS :hover suppression.
  const [safeActive, setSafeActive] = useState(false)

  // When hoveredEntry changes, use the previous frame's mouse position as vertex A
  // of the new triangle (equivalent to "user's position when entering the anchor",
  // similar to floating-ui's safePolygon approach). Also sync the main panel highlight
  // to the new entry's index (visual catches up after buffer commit).
  // useLayoutEffect prevents a one-frame visual artifact.
  useLayoutEffect(() => {
    if (hoveredEntry !== null && lastCursorPosRef.current) {
      anchorCursorPosRef.current = { ...lastCursorPosRef.current }
    } else if (hoveredEntry === null) {
      anchorCursorPosRef.current = null
      setSafeActive(false)
    }
    if (hoveredEntry !== null && setHighlightedIndexRef.current) {
      const idx = options.findIndex(
        (o) =>
          o.payload.kind === 'entry' && o.payload.entryType === hoveredEntry,
      )
      if (idx >= 0) setHighlightedIndexRef.current(idx)
    }
  }, [hoveredEntry, options])

  // Extracted safe triangle check shared by mousemove and mouseenter,
  // preventing event ordering from causing mouseenter to see stale safe state.
  const updateSafeTriangle = useCallback(
    (px: number, py: number): boolean => {
      if (!subPanelActive || !subPanelRef.current) {
        return false
      }
      const anchor = anchorCursorPosRef.current
      if (!anchor) {
        return false
      }
      const subRect = subPanelRef.current.getBoundingClientRect()
      const ax = anchor.x
      const ay = anchor.y
      const bx = subSide === 'right' ? subRect.left : subRect.right
      const by = subRect.top
      const cx = bx
      const cy = subRect.bottom
      const sign = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        x3: number,
        y3: number,
      ) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3)
      const d1 = sign(px, py, ax, ay, bx, by)
      const d2 = sign(px, py, bx, by, cx, cy)
      const d3 = sign(px, py, cx, cy, ax, ay)
      const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
      const hasPos = d1 > 0 || d2 > 0 || d3 > 0
      return !(hasNeg && hasPos)
    },
    [subPanelActive, subSide],
  )

  const handlePopoverMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      lastCursorPosRef.current = { x: event.clientX, y: event.clientY }
      const active = updateSafeTriangle(event.clientX, event.clientY)
      if (active) {
        cancelHoverOpen()
      }
      setSafeActive(active)
    },
    [cancelHoverOpen, updateSafeTriangle],
  )

  const customKeyHandlers = useMemo(
    () => ({
      onArrowRight: (event: KeyboardEvent): boolean => {
        if (event.isComposing) return false
        if (focusSide === 'main' && subPanelActive) {
          setFocusSide('sub')
          // Always start from the semantically first item: sub-menu content is physically
          // ordered top-to-bottom in list order regardless of whether the menu expands
          // upward or downward. The first item is what the user expects (matching macOS menu behavior).
          setSubHighlightedIndex(0)
          return true
        }
        return false
      },
      onArrowLeft: (event: KeyboardEvent): boolean => {
        if (event.isComposing) return false
        if (focusSide === 'sub') {
          setFocusSide('main')
          return true
        }
        return false
      },
      onArrowDown: (event: KeyboardEvent): boolean => {
        if (event.isComposing) return false
        if (focusSide === 'sub' && subOptions.length > 0) {
          setSubHighlightedIndex((prev) => (prev + 1) % subOptions.length)
          return true
        }
        return false
      },
      onArrowUp: (event: KeyboardEvent): boolean => {
        if (event.isComposing) return false
        if (focusSide === 'sub' && subOptions.length > 0) {
          setSubHighlightedIndex((prev) =>
            prev === 0 ? subOptions.length - 1 : prev - 1,
          )
          return true
        }
        return false
      },
      onEnter: (event: KeyboardEvent | null): boolean => {
        if (event?.isComposing) return false
        if (focusSide === 'sub' && subOptions.length > 0) {
          const option = subOptions[subHighlightedIndex]
          const select = selectOptionAndCleanUpRef.current
          if (option && select) {
            select(option)
            return true
          }
        }
        return false
      },
    }),
    [focusSide, subOptions, subPanelActive, subHighlightedIndex],
  )

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForMentionMatch}
      options={options}
      commandPriority={COMMAND_PRIORITY_NORMAL}
      getDefaultHighlightedIndex={getDefaultHighlightedIndex}
      onOpen={() => onMenuOpenChange?.(true)}
      onClose={() => {
        onMenuOpenChange?.(false)
        resetSubPreviewState()
      }}
      customKeyHandlers={customKeyHandlers}
      menuRenderFn={(
        anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex },
      ) => {
        // Sync the latest selectOptionAndCleanUp to the ref on each render, for use by customKeyHandlers.
        selectOptionAndCleanUpRef.current = selectOptionAndCleanUp
        setHighlightedIndexRef.current = setHighlightedIndex
        if (!anchorElementRef.current || !options.length) return null
        const showSubpanel = subPanelActive
        return createPortal(
          <div
            ref={popoverRef}
            className="yolo-smart-space-mention-popover"
            data-placement={placement}
            data-safe-active={safeActive ? 'true' : undefined}
            onPointerLeave={() => scheduleHoverClose()}
            onPointerEnter={() => cancelHoverClose()}
            onMouseMove={handlePopoverMouseMove}
          >
            <MainSelectedIndexSync
              selectedIndex={selectedIndex}
              setMainSelectedIndex={setMainSelectedIndex}
            />
            <div
              ref={mainPanelRef}
              className="yolo-popover-surface yolo-popover-surface--smart-space yolo-smart-space-mention-dropdown"
            >
              <div
                key={`main:${menuContentTransition.nonce}`}
                className="yolo-smart-space-mention-list"
                role="listbox"
                data-transition={
                  menuContentTransition.direction === 'none'
                    ? undefined
                    : menuContentTransition.direction
                }
                onAnimationEnd={() =>
                  setMenuContentTransition((prev) =>
                    prev.direction === 'none'
                      ? prev
                      : { ...prev, direction: 'none' },
                  )
                }
              >
                {options.map((option, i: number) => {
                  const entryType =
                    option.payload.kind === 'entry'
                      ? option.payload.entryType
                      : null
                  const isEntryOption = entryType !== null
                  const isLeaf = entryType === 'current-file'
                  return (
                    <MentionsTypeaheadMenuItem
                      index={i}
                      isSelected={selectedIndex === i}
                      onClick={() => {
                        setHighlightedIndex(i)
                        if (
                          shouldRenderSubpanel &&
                          isEntryOption &&
                          !isLeaf &&
                          entryType !== null &&
                          subSide !== 'hidden'
                        ) {
                          cancelHoverOpen()
                          cancelHoverClose()
                          setFocusSide('main')
                          setSubHighlightedIndex(0)
                          setHoveredEntry(entryType)
                          return
                        }
                        selectOptionAndCleanUp(option)
                      }}
                      onMouseEnter={(e) => {
                        // Proactively compute safe triangle with current mouse position to avoid
                        // relying on mousemove event timing that could cause mouseenter to see stale safe state.
                        lastCursorPosRef.current = {
                          x: e.clientX,
                          y: e.clientY,
                        }
                        const inSafe = updateSafeTriangle(e.clientX, e.clientY)
                        setSafeActive(inSafe)
                        if (focusSide === 'sub') setFocusSide('main')
                        // Main panel highlight: skip when inside safe triangle to keep visual following hoveredEntry.
                        if (!inSafe) {
                          setHighlightedIndex(i)
                        }
                        if (
                          shouldRenderSubpanel &&
                          isEntryOption &&
                          !isLeaf &&
                          entryType !== null
                        ) {
                          if (inSafe) {
                            // Safe triangle is a true protection zone: while the mouse is still
                            // within the triangle path, other main menu items cannot trigger
                            // a switch via the timer delay.
                            cancelHoverOpen()
                          } else {
                            scheduleHoverOpen(entryType)
                          }
                        } else if (shouldRenderSubpanel && isLeaf) {
                          scheduleHoverClose()
                        }
                      }}
                      key={option.key}
                      option={option}
                    />
                  )
                })}
              </div>
            </div>
            {showSubpanel && (
              <div
                key={`sub:${previewEntryEffective}:${subSide}`}
                ref={subPanelRef}
                className="yolo-popover-surface yolo-popover-surface--smart-space yolo-smart-space-mention-dropdown yolo-smart-space-mention-subpanel"
                data-side={subSide}
                role="listbox"
                onPointerEnter={() => cancelHoverClose()}
                onPointerLeave={() => scheduleHoverClose()}
              >
                <div className="yolo-smart-space-mention-list">
                  {subOptions.map((option, i: number) => (
                    <MentionsTypeaheadMenuItem
                      index={i}
                      isSelected={
                        focusSide === 'sub' && subHighlightedIndex === i
                      }
                      onClick={() => {
                        selectOptionAndCleanUp(option)
                      }}
                      onMouseEnter={() => {
                        setFocusSide('sub')
                        setSubHighlightedIndex(i)
                        cancelHoverClose()
                      }}
                      key={`sub:${option.key}`}
                      option={option}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>,
          menuContainerRef?.current ?? anchorElementRef.current,
        )
      }}
    />
  )
}
