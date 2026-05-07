import { createDiffBlocks, createInlineDiffLines } from './diff'

describe('createDiffBlocks', () => {
  it('keeps normal paragraph edits as inline diffs', () => {
    const blocks = createDiffBlocks('Alpha beta gamma', 'Alpha beta delta')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'modified',
      presentation: 'inline',
      blockType: 'paragraph',
      originalValue: 'Alpha beta gamma',
      modifiedValue: 'Alpha beta delta',
    })
  })

  it('renders markdown tables as a block diff', () => {
    const blocks = createDiffBlocks(
      ['| Name | Score |', '| --- | --- |', '| Alice | 1 |'].join('\n'),
      ['| Name | Score |', '| --- | --- |', '| Alice | 2 |'].join('\n'),
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'modified',
      presentation: 'block',
      blockType: 'table',
      originalValue: [
        '| Name | Score |',
        '| --- | --- |',
        '| Alice | 1 |',
      ].join('\n'),
      modifiedValue: [
        '| Name | Score |',
        '| --- | --- |',
        '| Alice | 2 |',
      ].join('\n'),
    })
  })

  it('renders fenced code blocks as a block diff', () => {
    const blocks = createDiffBlocks(
      ['```ts', 'const value = 1', '```'].join('\n'),
      ['```ts', 'const value = 2', '```'].join('\n'),
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'modified',
      presentation: 'block',
      blockType: 'codeFence',
      originalValue: ['```ts', 'const value = 1', '```'].join('\n'),
      modifiedValue: ['```ts', 'const value = 2', '```'].join('\n'),
    })
  })

  it('keeps unchanged heading outside the modified body block', () => {
    const blocks = createDiffBlocks(
      ['## Goals', '1. Finalise sprint backlog'].join('\n'),
      [
        '## Goals',
        '1. Finalize the sprint backlog for the next sprint.',
      ].join('\n'),
    )

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({ type: 'unchanged', value: '## Goals' })
    expect(blocks[1]).toMatchObject({
      type: 'modified',
      presentation: 'block',
      blockType: 'list',
      originalValue: '1. Finalise sprint backlog',
      modifiedValue:
        '1. Finalize the sprint backlog for the next sprint.',
    })
  })

  it('keeps unchanged intro lines outside translated paragraph diffs', () => {
    const blocks = createDiffBlocks(
      [
        '### 03 Solution / Feature Scope',
        '**This PRD scope: Phase 1 MVP**',
        'Use the **Agent simulation** approach, leveraging automated scripts to simulate manual browser operations.',
      ].join('\n'),
      [
        '### 03 Solution / Feature Scope',
        '**This PRD scope: Phase 1 MVP**',
        'Adopt the **Agent simulation** approach, using automated scripts to simulate human browser operations.',
      ].join('\n'),
    )

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toEqual({
      type: 'unchanged',
      value: ['### 03 Solution / Feature Scope', '**This PRD scope: Phase 1 MVP**'].join(
        '\n',
      ),
    })
    expect(blocks[1]).toMatchObject({
      type: 'modified',
      presentation: 'inline',
      blockType: 'paragraph',
      originalValue:
        'Use the **Agent simulation** approach, leveraging automated scripts to simulate manual browser operations.',
      modifiedValue:
        'Adopt the **Agent simulation** approach, using automated scripts to simulate human browser operations.',
    })
  })

  it('splits list diffs by item instead of marking the whole list', () => {
    const blocks = createDiffBlocks(
      ['- Keep alpha', '- Translate beta', '- Keep gamma'].join('\n'),
      ['- Keep alpha', '- Traduire beta', '- Keep gamma'].join('\n'),
    )

    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'unchanged', value: '- Keep alpha' })
    expect(blocks[1]).toMatchObject({
      type: 'modified',
      presentation: 'block',
      blockType: 'list',
      originalValue: '- Translate beta',
      modifiedValue: '- Traduire beta',
    })
    expect(blocks[2]).toEqual({ type: 'unchanged', value: '- Keep gamma' })
  })

  it('keeps insertion separate from a nearby modification inside one hunk', () => {
    const blocks = createDiffBlocks(
      'Keep paragraph',
      ['Inserted paragraph', '', 'Keep paragraph updated'].join('\n'),
    )

    const contentBlocks = blocks.filter(
      (block) =>
        block.type !== 'modified' ||
        block.blockType !== 'blank' ||
        (block.modifiedValue ?? '').length > 0,
    )

    expect(contentBlocks).toHaveLength(2)
    expect(contentBlocks[0]).toMatchObject({
      type: 'modified',
      originalValue: undefined,
      modifiedValue: 'Inserted paragraph',
    })
    expect(contentBlocks[1]).toMatchObject({
      type: 'modified',
      originalValue: 'Keep paragraph',
      modifiedValue: 'Keep paragraph updated',
    })
  })

  it('preserves unchanged content around structured block diffs', () => {
    const blocks = createDiffBlocks(
      [
        'Intro',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        'Outro',
      ].join('\n'),
      [
        'Intro',
        '',
        '| A | B |',
        '| --- | --- |',
        '| 1 | 3 |',
        '',
        'Outro',
      ].join('\n'),
    )

    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toEqual({ type: 'unchanged', value: 'Intro\n' })
    expect(blocks[1]).toMatchObject({
      type: 'modified',
      presentation: 'block',
      blockType: 'table',
    })
    expect(blocks[2]).toEqual({ type: 'unchanged', value: '\nOutro' })
  })
})

describe('createInlineDiffLines', () => {
  it('prefers whole-line replacement for cross-language rewrites', () => {
    const [line] = createInlineDiffLines(
      [
        'Mode Variety: Covering single-player campaign, multiplayer PvP, and large-scale battle royale (Warzone).',
      ],
      ['Mode Diversity: Including single-player story, multiplayer battles, and large-scale battle royale (Warzone).'],
    )

    expect(line).toEqual({
      type: 'modified',
      tokens: [
        {
          type: 'del',
          text: 'Mode Variety: Covering single-player campaign, multiplayer PvP, and large-scale battle royale (Warzone).',
        },
        {
          type: 'add',
          text: 'Mode Diversity: Including single-player story, multiplayer battles, and large-scale battle royale (Warzone).',
        },
      ],
    })
  })

  it('keeps sentence anchors while diffing changed sentence bodies', () => {
    const [line] = createInlineDiffLines(
      ['Intro sentence. Keep this part. Closing note.'],
      ['Intro sentence. Replace this part. Closing note.'],
    )

    expect(line).toEqual({
      type: 'modified',
      tokens: [
        { type: 'same', text: 'Intro sentence. ' },
        { type: 'del', text: 'Keep' },
        { type: 'add', text: 'Replace' },
        { type: 'same', text: ' this part. Closing note.' },
      ],
    })
  })

  it('shows fine-grained inline replacements for minor wording edits', () => {
    const [line] = createInlineDiffLines(
      ['Today I walked in the park, then bought coffee.'],
      ['Today I jogged in the park, then bought hot coffee.'],
    )

    expect(line).toEqual({
      type: 'modified',
      tokens: [
        { type: 'same', text: 'Today I ' },
        { type: 'del', text: 'walked' },
        { type: 'add', text: 'jogged' },
        { type: 'same', text: ' in the park, then bought ' },
        { type: 'add', text: 'hot ' },
        { type: 'same', text: 'coffee.' },
      ],
    })
  })

  it('uses segmenter-aware word diff for lines with clear token boundaries', () => {
    const [line] = createInlineDiffLines(
      ['Please open the settings panel, then save the current draft.'],
      ['Please open the preference settings panel, then save the current draft.'],
    )

    expect(line).toEqual({
      type: 'modified',
      tokens: [
        { type: 'same', text: 'Please open the ' },
        { type: 'add', text: 'preference ' },
        { type: 'same', text: 'settings panel, then save the current draft.' },
      ],
    })
  })

  it('splits long additions into smaller punctuation-based change tokens', () => {
    const [line] = createInlineDiffLines(
      ['Genshin achieved success.'],
      ['Genshin achieved success. The world-building enriches Teyvat. Teyvat is worth long-term exploration.'],
    )

    expect(line).toEqual({
      type: 'modified',
      tokens: [
        { type: 'same', text: 'Genshin achieved success.' },
        { type: 'add', text: ' The world-building enriches Teyvat. Teyvat is worth long-term exploration.' },
      ],
    })
  })
})
