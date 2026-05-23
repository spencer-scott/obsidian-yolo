import {
  YOLO_SNIPPET_CREATOR_TEMPLATE,
  getSnippetsPathAwareTemplate,
} from '../snippets/templates'

import {
  YOLO_OBSIDIAN_OUTPUT_FORMAT_TEMPLATE,
  YOLO_SKILL_CREATOR_TEMPLATE,
  getSkillsPathAwareTemplate,
} from './templates'

type BuiltinLiteSkill = {
  id: string
  name: string
  description: string
  mode: 'always' | 'lazy'
  path: string
  content: string
}

const BUILTIN_SKILLS: BuiltinLiteSkill[] = [
  {
    id: 'obsidian-output-format',
    name: 'Obsidian Output Format',
    description:
      'Enforce Obsidian markdown output contract with <yolo_block> tags. Use whenever returning markdown content, proposing markdown edits, or referencing markdown snippets.',
    mode: 'always',
    path: 'builtin://skills/obsidian-output-format.md',
    content: YOLO_OBSIDIAN_OUTPUT_FORMAT_TEMPLATE,
  },
  {
    id: 'skill-creator',
    name: 'Skill Creator',
    description:
      'Guide for creating effective YOLO skills. Use when users want to create a new skill, update an existing skill, or improve skill quality within their Obsidian vault. Covers skill design principles, anatomy, and the full creation workflow.',
    mode: 'lazy',
    path: 'builtin://skills/skill-creator.md',
    content: YOLO_SKILL_CREATOR_TEMPLATE,
  },
  {
    id: 'snippet-creator',
    name: 'Snippet Creator',
    description:
      "Guide for editing `YOLO/snippets.md`, the user's library of chat snippets (short prompts the user inserts via the chat input's `/` menu, e.g. `/translate`, `/review`). Use when the user asks to add, edit, rename, list, or delete a chat snippet, or describes a recurring prompt they want as a slash shortcut.",
    mode: 'lazy',
    path: 'builtin://skills/snippet-creator.md',
    content: YOLO_SNIPPET_CREATOR_TEMPLATE,
  },
]

const normalize = (value?: string): string => value?.trim().toLowerCase() ?? ''

const renderBuiltinContent = (
  skill: BuiltinLiteSkill,
  options?: { skillsDir?: string; snippetsPath?: string },
): string => {
  if (skill.id === 'skill-creator') {
    return getSkillsPathAwareTemplate(skill.content, options?.skillsDir)
  }
  if (skill.id === 'snippet-creator') {
    return getSnippetsPathAwareTemplate(skill.content, options?.snippetsPath)
  }
  return skill.content
}

export const listBuiltinLiteSkills = (options?: {
  skillsDir?: string
  snippetsPath?: string
}): BuiltinLiteSkill[] => {
  return BUILTIN_SKILLS.map((skill) => ({
    ...skill,
    content: renderBuiltinContent(skill, options),
  }))
}

export const getBuiltinLiteSkillByIdOrName = ({
  id,
  name,
  skillsDir,
  snippetsPath,
}: {
  id?: string
  name?: string
  skillsDir?: string
  snippetsPath?: string
}): BuiltinLiteSkill | null => {
  const normalizedId = normalize(id)
  const normalizedName = normalize(name)
  if (!normalizedId && !normalizedName) {
    return null
  }

  const matched = BUILTIN_SKILLS.find((skill) => {
    if (normalizedId && normalize(skill.id) === normalizedId) {
      return true
    }
    if (normalizedName && normalize(skill.name) === normalizedName) {
      return true
    }
    return false
  })

  if (!matched) {
    return null
  }

  return {
    ...matched,
    content: renderBuiltinContent(matched, { skillsDir, snippetsPath }),
  }
}
