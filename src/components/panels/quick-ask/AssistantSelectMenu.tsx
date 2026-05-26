import { Check, User } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

import { useLanguage } from '../../../contexts/language-context'
import { Assistant } from '../../../types/assistant.types'
import { renderAssistantIcon } from '../../../utils/assistant-icon'

type AssistantSelectMenuProps = {
  assistants: Assistant[]
  currentAssistantId?: string
  onSelect: (assistant: Assistant | null) => void
  onClose: () => void
  compact?: boolean
}

export function AssistantSelectMenu({
  assistants,
  currentAssistantId,
  onSelect,
  onClose,
  compact = false,
}: AssistantSelectMenuProps) {
  const { t } = useLanguage()
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (currentAssistantId) {
      const index = assistants.findIndex((a) => a.id === currentAssistantId)
      return index >= 0 ? index + 1 : 0 // +1 because "No Assistant" is at index 0
    }
    return 0
  })

  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Total items = "No Assistant" + all assistants
  const totalItems = assistants.length + 1

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % totalItems)
          break
        case 'ArrowUp':
          event.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems)
          break
        case 'Enter':
          event.preventDefault()
          if (selectedIndex === 0) {
            onSelect(null) // No assistant
          } else {
            onSelect(assistants[selectedIndex - 1])
          }
          break
        case 'Escape':
          event.preventDefault()
          onClose()
          break
      }
    },
    [assistants, onClose, onSelect, selectedIndex, totalItems],
  )

  // Scroll selected item into view
  useEffect(() => {
    const item = itemRefs.current[selectedIndex]
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  // Focus the list on mount
  useEffect(() => {
    listRef.current?.focus()
  }, [])

  return (
    <div
      className={`yolo-quick-ask-assistant-menu ${compact ? 'compact' : ''}`}
    >
      {!compact && (
        <div className="yolo-quick-ask-assistant-menu-title">
          {t('quickAsk.selectAssistant', 'Select an assistant')}
        </div>
      )}
      <div
        ref={listRef}
        className="yolo-quick-ask-assistant-list"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="listbox"
        aria-activedescendant={`assistant-item-${selectedIndex}`}
      >
        {/* No Assistant option */}
        <div
          ref={(el) => (itemRefs.current[0] = el)}
          id="assistant-item-0"
          className={`yolo-quick-ask-assistant-item ${
            selectedIndex === 0 ? 'selected' : ''
          } ${!currentAssistantId ? 'current' : ''}`}
          onClick={() => onSelect(null)}
          onMouseEnter={() => setSelectedIndex(0)}
          role="option"
          aria-selected={selectedIndex === 0}
        >
          <div className="yolo-quick-ask-assistant-item-icon">
            <User size={14} />
          </div>
          <div className="yolo-quick-ask-assistant-item-content">
            <div className="yolo-quick-ask-assistant-item-name">
              {t('quickAsk.noAssistant', 'No Assistant')}
            </div>
            {!compact && (
              <div className="yolo-quick-ask-assistant-item-description">
                {t(
                  'quickAsk.noAssistantDescription',
                  'Use default system prompt',
                )}
              </div>
            )}
          </div>
          {!currentAssistantId && (
            <div className="yolo-quick-ask-assistant-item-check">
              <Check size={12} />
            </div>
          )}
        </div>

        {/* Assistant options */}
        {assistants.map((assistant, index) => {
          const itemIndex = index + 1
          const isCurrent = assistant.id === currentAssistantId
          const isSelected = selectedIndex === itemIndex

          return (
            <div
              key={assistant.id}
              ref={(el) => (itemRefs.current[itemIndex] = el)}
              id={`assistant-item-${itemIndex}`}
              className={`yolo-quick-ask-assistant-item ${
                isSelected ? 'selected' : ''
              } ${isCurrent ? 'current' : ''}`}
              onClick={() => onSelect(assistant)}
              onMouseEnter={() => setSelectedIndex(itemIndex)}
              role="option"
              aria-selected={isSelected}
            >
              <div className="yolo-quick-ask-assistant-item-icon">
                {renderAssistantIcon(assistant.icon, 14)}
              </div>
              <div className="yolo-quick-ask-assistant-item-content">
                <div className="yolo-quick-ask-assistant-item-name">
                  {assistant.name}
                </div>
                {!compact && assistant.description && (
                  <div className="yolo-quick-ask-assistant-item-description">
                    {assistant.description}
                  </div>
                )}
              </div>
              {isCurrent && (
                <div className="yolo-quick-ask-assistant-item-check">
                  <Check size={12} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!compact && (
        <div className="yolo-quick-ask-assistant-menu-hint">
          {t(
            'quickAsk.navigationHint',
            '↑↓ to navigate, Enter to select, Esc to cancel',
          )}
        </div>
      )}
    </div>
  )
}
