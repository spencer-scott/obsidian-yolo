import {
  Award,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Briefcase,
  Camera,
  Code,
  Coffee,
  Compass,
  Cpu,
  Crown,
  Database,
  Eye,
  File,
  Filter,
  Flame,
  Folder,
  Gift,
  GitBranch,
  Globe,
  Hammer,
  Heart,
  Image,
  Key,
  Lightbulb,
  Lock,
  type LucideIcon,
  Mail,
  Map,
  MessageSquare,
  Music,
  Navigation,
  Package,
  Phone,
  Rocket,
  Search,
  Send,
  Settings,
  Shield,
  Smile,
  Sparkles,
  Star,
  Target,
  Terminal,
  Trophy,
  Umbrella,
  Wand2,
  Wrench,
  Zap,
} from 'lucide-react'
import React from 'react'

import { AssistantIcon } from '../types/assistant.types'

const ICON_MAP: Record<string, LucideIcon> = {
  Bot,
  Sparkles,
  Brain,
  Zap,
  Wand2,
  MessageSquare,
  Lightbulb,
  Rocket,
  Star,
  Heart,
  Smile,
  Coffee,
  Flame,
  Crown,
  Target,
  BookOpen,
  Cpu,
  Database,
  Code,
  Terminal,
  GitBranch,
  Package,
  Settings,
  Wrench,
  Hammer,
  Shield,
  Lock,
  Key,
  Eye,
  Bell,
  Music,
  Camera,
  Image,
  File,
  Folder,
  Search,
  Filter,
  Send,
  Mail,
  Phone,
  Globe,
  Map,
  Compass,
  Navigation,
  Briefcase,
  Award,
  Trophy,
  Gift,
  Umbrella,
}

/**
 * Default assistant icon
 */
export const DEFAULT_ASSISTANT_ICON: AssistantIcon = {
  type: 'lucide',
  value: 'Bot',
}

/**
 * List of common Lucide icons (used by the icon picker)
 */
export const PRESET_LUCIDE_ICONS = Object.keys(ICON_MAP) as readonly string[]

/**
 * List of common emojis (used by the icon picker)
 */
export const PRESET_EMOJIS = [
  '🤖',
  '✨',
  '🧠',
  '⚡',
  '🪄',
  '💬',
  '💡',
  '🚀',
  '⭐',
  '❤️',
  '😊',
  '☕',
  '🔥',
  '👑',
  '🎯',
  '📚',
  '💻',
  '🗄️',
  '💾',
  '🖥️',
  '📱',
  '⌨️',
  '🖱️',
  '🎨',
  '🎭',
  '🎪',
  '🎬',
  '🎮',
  '🎲',
  '🎯',
  '🎪',
  '🎨',
  '🎭',
  '🎪',
  '🎬',
  '🎮',
  '🎲',
  '🏆',
  '🎖️',
  '🏅',
  '🥇',
  '🥈',
  '🥉',
  '🎁',
  '🎈',
  '🎉',
  '🎊',
  '🎃',
  '🎄',
] as const

/**
 * Render an assistant icon
 */
export const renderAssistantIcon = (
  icon: AssistantIcon | undefined,
  size = 16,
  className?: string,
): React.ReactElement => {
  const iconConfig = icon || DEFAULT_ASSISTANT_ICON

  const iconTypeClass =
    iconConfig.type === 'emoji' ? 'yolo-icon-emoji' : 'yolo-icon-lucide'
  const combinedClassName = className
    ? `${className} ${iconTypeClass}`
    : iconTypeClass

  if (iconConfig.type === 'emoji') {
    return (
      <span className={combinedClassName} data-size={String(size)}>
        {iconConfig.value}
      </span>
    )
  }

  const IconComponent =
    ICON_MAP[iconConfig.value] ?? ICON_MAP[DEFAULT_ASSISTANT_ICON.value]
  return <IconComponent size={size} className={combinedClassName} />
}
