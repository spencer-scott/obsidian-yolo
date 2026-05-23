import { Sparkles } from 'lucide-react'
import React from 'react'

type DotLoaderProps = {
  text?: string
  variant?: 'sparkles' | 'dots'
  className?: string
}

export default function DotLoader({
  text = 'Thinking',
  variant = 'sparkles',
  className = '',
}: DotLoaderProps) {
  if (variant === 'dots') {
    return (
      <span
        className={`yolo-dot-loader-minimal ${className}`.trim()}
        aria-label="Loading"
      >
        <span />
        <span />
        <span />
      </span>
    )
  }

  return (
    <div
      className={`yolo-thinking-loader ${className}`.trim()}
      aria-label="Loading"
    >
      <div className="yolo-thinking-icon">
        <Sparkles className="yolo-thinking-icon-svg" size={20} />
      </div>
      <div className="yolo-thinking-text">{text}</div>
    </div>
  )
}
