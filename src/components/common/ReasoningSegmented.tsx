import { useCallback, useRef } from 'react'

import { useLanguage } from '../../contexts/language-context'
import { REASONING_LEVELS, ReasoningLevel } from '../../types/reasoning'
import { getNodeDocument } from '../../utils/dom/window-context'

type ReasoningOption = {
  value: ReasoningLevel
  labelKey: string
  labelFallback: string
  descKey: string
  descFallback: string
}

const LEVEL_META: Record<
  ReasoningLevel,
  {
    labelKey: string
    labelFallback: string
    descKey: string
    descFallback: string
  }
> = {
  off: {
    labelKey: 'reasoning.off',
    labelFallback: 'Off',
    descKey: 'reasoning.offDesc',
    descFallback: 'No thinking, answer directly',
  },
  auto: {
    labelKey: 'reasoning.auto',
    labelFallback: 'Auto',
    descKey: 'reasoning.autoDesc',
    descFallback: 'Let the model decide thinking depth based on the prompt',
  },
  low: {
    labelKey: 'reasoning.low',
    labelFallback: 'Low',
    descKey: 'reasoning.lowDesc',
    descFallback: 'Lightweight thinking, faster response',
  },
  medium: {
    labelKey: 'reasoning.medium',
    labelFallback: 'Medium',
    descKey: 'reasoning.mediumDesc',
    descFallback: 'Balanced thinking depth',
  },
  high: {
    labelKey: 'reasoning.high',
    labelFallback: 'High',
    descKey: 'reasoning.highDesc',
    descFallback: 'Deep thinking, suited for complex problems',
  },
  'extra-high': {
    labelKey: 'reasoning.extraHigh',
    labelFallback: 'Extra high',
    descKey: 'reasoning.extraHighDesc',
    descFallback: 'Maximum thinking, for the toughest reasoning',
  },
}

export const REASONING_OPTIONS: ReasoningOption[] = REASONING_LEVELS.map(
  (value) => ({
    value,
    ...LEVEL_META[value],
  }),
)

type ReasoningSegmentedProps = {
  value: ReasoningLevel
  onChange: (level: ReasoningLevel) => void
  ariaLabel?: string
  /**
   * Optional refs map populated with each segment button. Lets parent (e.g.
   * `ReasoningSelect`'s popover) drive focus management when used inside a
   * dropdown. Standalone callers can ignore it.
   */
  segmentRefs?: React.MutableRefObject<
    Record<ReasoningLevel, HTMLButtonElement | null>
  >
}

/**
 * Inline segmented pill for picking a reasoning level. Used standalone in the
 * settings panel and wrapped by `ReasoningSelect` inside its popover.
 */
export function ReasoningSegmented({
  value,
  onChange,
  ariaLabel,
  segmentRefs,
}: ReasoningSegmentedProps) {
  const { t } = useLanguage()
  const fallbackRefs = useRef<Record<ReasoningLevel, HTMLButtonElement | null>>(
    Object.fromEntries(
      REASONING_LEVELS.map((level) => [level, null]),
    ) as Record<ReasoningLevel, HTMLButtonElement | null>,
  )
  const refs = segmentRefs ?? fallbackRefs

  const focusByDelta = useCallback(
    (currentValue: ReasoningLevel, delta: number) => {
      const values = REASONING_OPTIONS.map((option) => option.value)
      const ownerDoc = getNodeDocument(refs.current[currentValue])
      const focusedValue = values.find(
        (v) =>
          refs.current[v] !== null &&
          refs.current[v] === ownerDoc.activeElement,
      )
      const baseIndex =
        focusedValue !== undefined
          ? values.indexOf(focusedValue)
          : values.indexOf(currentValue)
      const nextIndex = (baseIndex + delta + values.length) % values.length
      const target = refs.current[values[nextIndex]]
      if (target) target.focus({ preventScroll: true })
    },
    [refs],
  )

  const safeValue = REASONING_OPTIONS.some((opt) => opt.value === value)
    ? value
    : 'auto'

  return (
    <div
      className="yolo-segmented yolo-segmented--pill yolo-reasoning-segmented"
      role="radiogroup"
      aria-label={
        ariaLabel ?? t('reasoning.selectReasoning', 'Select reasoning')
      }
      style={
        {
          '--yolo-segment-count': REASONING_OPTIONS.length,
          '--yolo-segment-index': REASONING_OPTIONS.findIndex(
            (opt) => opt.value === safeValue,
          ),
        } as React.CSSProperties
      }
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault()
          focusByDelta(safeValue, 1)
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault()
          focusByDelta(safeValue, -1)
        }
      }}
    >
      <div className="yolo-segmented-glider" aria-hidden="true" />
      {REASONING_OPTIONS.map((option) => {
        const selected = option.value === safeValue
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? 'active' : ''}
            tabIndex={selected ? 0 : -1}
            ref={(element) => {
              refs.current[option.value] = element
            }}
            onClick={() => {
              onChange(option.value)
            }}
          >
            {t(option.labelKey, option.labelFallback)}
          </button>
        )
      })}
    </div>
  )
}
