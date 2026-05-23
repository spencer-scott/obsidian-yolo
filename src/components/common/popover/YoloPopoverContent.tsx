import * as Popover from '@radix-ui/react-popover'
import { ComponentPropsWithoutRef, RefObject, forwardRef } from 'react'

import {
  YoloPopoverProps,
  resolveYoloPopoverClassName,
  resolveYoloPopoverStyle,
} from './types'

type RadixContentProps = ComponentPropsWithoutRef<typeof Popover.Content>

export type YoloPopoverContentProps = Omit<RadixContentProps, 'className'> &
  YoloPopoverProps & {
    /**
     * Trigger (or anchor) ref. Used to resolve the Portal container from the
     * trigger's current `ownerDocument.body` — keeps the popover in the same
     * document as its trigger, including after the panel is moved to an
     * Obsidian popout window.
     */
    anchorRef?: RefObject<Node | null>
    /** Explicit Portal container override. Takes precedence over `anchorRef`. */
    container?: HTMLElement
    /** Extra class on the inner Content (escape hatch). */
    className?: string
  }

/**
 * Wraps `Popover.Portal` + `Popover.Content`. Same surface system as
 * `<YoloDropdownContent>` but for non-menu popovers (Radix Popover primitive).
 */
export const YoloPopoverContent = forwardRef<
  HTMLDivElement,
  YoloPopoverContentProps
>(function YoloPopoverContent(
  {
    variant,
    minWidth,
    maxWidth,
    maxHeight,
    anchorRef,
    container,
    className,
    style,
    children,
    ...rest
  },
  ref,
) {
  const portalContainer =
    container ?? anchorRef?.current?.ownerDocument?.body ?? undefined
  return (
    <Popover.Portal container={portalContainer}>
      <Popover.Content
        ref={ref}
        className={resolveYoloPopoverClassName(variant, className)}
        style={resolveYoloPopoverStyle(
          { minWidth, maxWidth, maxHeight },
          style,
        )}
        {...rest}
      >
        {children}
      </Popover.Content>
    </Popover.Portal>
  )
})
