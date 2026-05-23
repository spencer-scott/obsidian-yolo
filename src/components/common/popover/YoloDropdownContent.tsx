import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { ComponentPropsWithoutRef, RefObject, forwardRef } from 'react'

import {
  YoloPopoverProps,
  resolveYoloPopoverClassName,
  resolveYoloPopoverStyle,
} from './types'

type RadixContentProps = ComponentPropsWithoutRef<typeof DropdownMenu.Content>

export type YoloDropdownContentProps = Omit<RadixContentProps, 'className'> &
  YoloPopoverProps & {
    /**
     * Trigger (or anchor) ref. Used to resolve the Portal container from the
     * trigger's current `ownerDocument.body` — so the popover stays in the
     * same document as its trigger, including after the panel is moved to an
     * Obsidian popout window.
     */
    anchorRef?: RefObject<Node | null>
    /** Explicit Portal container override. Takes precedence over `anchorRef`. */
    container?: HTMLElement
    /** Extra class on the inner Content (escape hatch for consumer-specific tweaks). */
    className?: string
  }

/**
 * Wraps `DropdownMenu.Portal` + `DropdownMenu.Content` with the YOLO popover
 * surface system. All sizing/visual concerns are declared via props; never
 * inherit from a shared CSS class.
 */
export const YoloDropdownContent = forwardRef<
  HTMLDivElement,
  YoloDropdownContentProps
>(function YoloDropdownContent(
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
    <DropdownMenu.Portal container={portalContainer}>
      <DropdownMenu.Content
        ref={ref}
        className={resolveYoloPopoverClassName(variant, className)}
        style={resolveYoloPopoverStyle(
          { minWidth, maxWidth, maxHeight },
          style,
        )}
        {...rest}
      >
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
})
