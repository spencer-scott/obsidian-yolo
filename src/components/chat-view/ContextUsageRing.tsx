import { type ButtonHTMLAttributes, forwardRef } from 'react'

import { formatTokenCount } from '../../utils/llm/formatTokenCount'

// viewBox 20x20 with radius 9 circle + stroke-width 2, so the stroke outer
// edge aligns flush with the viewBox boundary, avoiding a 1px visual gap.
const RING_RADIUS = 9
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

const clampRatio = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0
  }
  if (value <= 0) {
    return 0
  }
  if (value >= 1) {
    return 1
  }
  return value
}

const getUsageTone = (ratio: number) => {
  if (ratio >= 0.9) {
    return 'danger'
  }
  if (ratio >= 0.7) {
    return 'warning'
  }
  return 'normal'
}

export type ContextUsageRingProps = {
  promptTokens: number
  maxContextTokens: number
  label: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

/**
 * Compact ring showing prompt-token usage against the model context window.
 * Rendered as a `<button>` so it can act as a Popover trigger.
 *
 * IMPORTANT: when used as `<Popover.Trigger asChild>`, Radix's `Slot` clones
 * this component and merges Radix-injected props (onClick / onKeyDown /
 * onPointerDown / aria-haspopup / aria-controls / id / data-state, …) onto the
 * resulting element. We must spread the full prop bag through to the
 * underlying `<button>` — picking out individual props would silently drop the
 * trigger's click/key handlers. That's why the type is the full
 * `ButtonHTMLAttributes` rather than a hand-picked subset.
 */
const ContextUsageRing = forwardRef<HTMLButtonElement, ContextUsageRingProps>(
  function ContextUsageRing(
    { promptTokens, maxContextTokens, label, className, title, ...rest },
    ref,
  ) {
    const ratio = clampRatio(promptTokens / maxContextTokens)
    const dashOffset = RING_CIRCUMFERENCE * (1 - ratio)
    const tone = getUsageTone(ratio)
    const percentLabel = `${Math.round(ratio * 100)}%`
    const titleLabel = `${label}: ${formatTokenCount(promptTokens)} / ${formatTokenCount(maxContextTokens)} (${percentLabel})`

    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={
          className
            ? `yolo-context-usage-ring ${className}`
            : 'yolo-context-usage-ring'
        }
        data-tone={tone}
        aria-label={titleLabel}
        title={title ?? titleLabel}
      >
        <svg
          className="yolo-context-usage-ring__svg"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <circle
            className="yolo-context-usage-ring__track"
            cx="10"
            cy="10"
            r={RING_RADIUS}
          />
          <circle
            className="yolo-context-usage-ring__progress"
            cx="10"
            cy="10"
            r={RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="yolo-context-usage-ring__sr-only">{percentLabel}</span>
      </button>
    )
  },
)

export default ContextUsageRing
