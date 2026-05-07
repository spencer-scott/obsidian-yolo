import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CHAT_SCHEMA_VERSION = 1
const DEFAULT_TITLE = 'Long Conversation Performance Test Sample'
const DEFAULT_TURNS = 120
const DEFAULT_ASSISTANT_PARAGRAPHS = 6
const DEFAULT_TARGET_SIZE_MB = 3
const DEFAULT_VAULT_ROOT = path.resolve(process.cwd(), '../../..')
const DEFAULT_DB_ROOT = path.join(
  DEFAULT_VAULT_ROOT,
  'YOLO',
  '.yolo_json_db',
  'chats',
)

function parseArgs(argv) {
  const options = {
    vaultRoot: DEFAULT_VAULT_ROOT,
    dbRoot: DEFAULT_DB_ROOT,
    title: DEFAULT_TITLE,
    turns: DEFAULT_TURNS,
    assistantParagraphs: DEFAULT_ASSISTANT_PARAGRAPHS,
    targetSizeMb: DEFAULT_TARGET_SIZE_MB,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]

    switch (arg) {
      case '--vault-root':
        options.vaultRoot = path.resolve(next)
        options.dbRoot = path.join(
          options.vaultRoot,
          'YOLO',
          '.yolo_json_db',
          'chats',
        )
        index += 1
        break
      case '--db-root':
        options.dbRoot = path.resolve(next)
        index += 1
        break
      case '--title':
        options.title = next
        index += 1
        break
      case '--turns':
        options.turns = Number.parseInt(next, 10)
        index += 1
        break
      case '--assistant-paragraphs':
        options.assistantParagraphs = Number.parseInt(next, 10)
        index += 1
        break
      case '--target-size-mb':
        options.targetSizeMb = Number.parseFloat(next)
        index += 1
        break
      default:
        break
    }
  }

  return options
}

function createTextEditorState(text) {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr',
          format: '',
          indent: 0,
          type: 'paragraph',
          version: 1,
          textFormat: 0,
          textStyle: '',
        },
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

function createUserMessage(turn, topic) {
  const text = [
    `Turn ${turn} question: please continue analyzing the performance bottlenecks of "${topic}" in a real product environment.`,
    'Please focus on rendering, state updates, scrolling, message size, referenced content, and history replay.',
    `I want you to provide a more granular breakdown this turn, and elaborate on the connection between turn ${turn} and the preceding context.`,
  ].join('\n')

  return {
    role: 'user',
    content: createTextEditorState(text),
    promptContent: null,
    id: crypto.randomUUID(),
    mentionables: [],
    selectedSkills: [],
    selectedModelIds: [],
    reasoningLevel: 'off',
  }
}

function createAssistantParagraph(turn, paragraphIndex, topic) {
  return [
    `### Turn ${turn} Analysis Block ${paragraphIndex + 1}`,
    `Long conversation performance stress test around "${topic}": this section is designed to amplify historical message rendering costs. Current observation points include: long Markdown paragraphs, repeated structures, code blocks, lists, and the cumulative impact of multi-paragraph content in the React tree.`,
    `When the conversation enters turn ${turn}, if old messages still fully participate in reconciliation, every change in the input area may cause the main thread to re-traverse the entire message tree, especially when there are many historical user inputs, long assistant replies, and tool outputs, causing overhead to increase significantly.`,
    `Here we add an extra lengthy paragraph to simulate a real user environment: we want to verify that when message volume, paragraph nesting, visible area switching, scroll following, history edit enter/exit, code block highlighting, and quote block rendering all stack together, the UI can still remain smooth, stable, and jitter-free without affecting input responsiveness in other areas of Obsidian.`,
    `Furthermore, this section simulates the real-world scenario of “the model continuously restating prior context and adding details,” so the text is intentionally long, repetitive in structure, and information-dense. This makes it easier to expose frame drops, stuttering, broken auto-scroll, layout jitter, or input lag when the renderer, selectors, memo boundaries, or virtual list strategy are not well-designed.`,
    `Recommendation ${paragraphIndex + 1}: separate historical message display from editor instances, mount heavy components on demand, only render messages near the viewport, restrict streaming updates to the active tail segment, and avoid letting the bottom composer's input state drive a full re-render of the long list.`,
  ].join('\n\n')
}

function createAssistantMessage(turn, topic, assistantParagraphs) {
  const content = Array.from({ length: assistantParagraphs }, (_, index) =>
    createAssistantParagraph(turn, index, topic),
  ).join('\n\n')

  return {
    role: 'assistant',
    content,
    id: crypto.randomUUID(),
    metadata: {
      generationState: 'completed',
      durationMs: 1000 + turn * 17,
    },
  }
}

function approximateConversationSize(messages, title) {
  const conversation = {
    id: crypto.randomUUID(),
    title,
    messages,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schemaVersion: CHAT_SCHEMA_VERSION,
    isPinned: false,
  }
  return Buffer.byteLength(JSON.stringify(conversation), 'utf8')
}

function buildMessages({
  turns,
  topic,
  assistantParagraphs,
  targetSizeMb,
}) {
  const targetSizeBytes = Math.max(1, targetSizeMb) * 1024 * 1024
  let effectiveParagraphs = Math.max(1, assistantParagraphs)
  let messages = []

  while (true) {
    messages = []
    for (let turn = 1; turn <= turns; turn += 1) {
      messages.push(createUserMessage(turn, topic))
      messages.push(createAssistantMessage(turn, topic, effectiveParagraphs))
    }

    if (
      approximateConversationSize(messages, DEFAULT_TITLE) >= targetSizeBytes ||
      effectiveParagraphs >= 48
    ) {
      return {
        messages,
        effectiveParagraphs,
      }
    }

    effectiveParagraphs += 2
  }
}

async function readJson(filePath, fallbackValue) {
  try {
    const content = await readFile(filePath, 'utf8')
    return JSON.parse(content)
  } catch {
    return fallbackValue
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await mkdir(options.dbRoot, { recursive: true })

  const topic = `${options.title} / ${new Date().toISOString().slice(0, 10)}`
  const { messages, effectiveParagraphs } = buildMessages({
    turns: options.turns,
    topic,
    assistantParagraphs: options.assistantParagraphs,
    targetSizeMb: options.targetSizeMb,
  })

  const now = Date.now()
  const conversationId = crypto.randomUUID()
  const conversation = {
    id: conversationId,
    title: options.title,
    messages,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CHAT_SCHEMA_VERSION,
    isPinned: false,
  }

  const conversationPath = path.join(
    options.dbRoot,
    `v${CHAT_SCHEMA_VERSION}_${conversationId}.json`,
  )
  await writeFile(conversationPath, JSON.stringify(conversation, null, 2))

  const indexPath = path.join(options.dbRoot, 'chat_index.json')
  const index = await readJson(indexPath, [])
  const nextIndex = [
    {
      id: conversationId,
      title: options.title,
      updatedAt: now,
      schemaVersion: CHAT_SCHEMA_VERSION,
      isPinned: false,
    },
    ...index.filter((item) => item?.id !== conversationId),
  ]
  await writeFile(indexPath, JSON.stringify(nextIndex, null, 2))

  const fileSize = Buffer.byteLength(JSON.stringify(conversation), 'utf8')
  console.log(
    JSON.stringify(
      {
        conversationId,
        title: options.title,
        turns: options.turns,
        assistantParagraphs: effectiveParagraphs,
        bytes: fileSize,
        megabytes: Number((fileSize / 1024 / 1024).toFixed(2)),
        conversationPath,
        indexPath,
      },
      null,
      2,
    ),
  )
}

await main()
