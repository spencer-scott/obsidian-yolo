import {
  materializeTextEditPlan,
  recoverLikelyEscapedBackslashSequences,
} from './textEditEngine'

describe('materializeTextEditPlan', () => {
  it('applies replace operations with exact matching', () => {
    const result = materializeTextEditPlan({
      content: 'Hello world',
      plan: {
        operations: [
          {
            type: 'replace',
            oldText: 'Hello world',
            newText: 'Hello universe',
          },
        ],
      },
    })

    expect(result.newContent).toBe('Hello universe')
    expect(result.appliedCount).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.operationResults[0]?.matchedRange).toEqual({
      start: 0,
      end: 11,
    })
    expect(result.operationResults[0]?.newRange).toEqual({
      start: 0,
      end: 14,
    })
  })

  it('applies insert_after operations', () => {
    const result = materializeTextEditPlan({
      content: 'Intro\n\nBody',
      plan: {
        operations: [
          {
            type: 'insert_after',
            anchor: 'Intro',
            content: 'Inserted paragraph',
          },
        ],
      },
    })

    expect(result.newContent).toBe('Intro\nInserted paragraph\n\nBody')
    expect(result.appliedCount).toBe(1)
    expect(result.operationResults[0]?.newRange).toEqual({
      start: 6,
      end: 24,
    })
  })

  it('does not add an extra blank line for list insert_after operations', () => {
    const result = materializeTextEditPlan({
      content: ['- A', '- B', '- C'].join('\n'),
      plan: {
        operations: [
          {
            type: 'insert_after',
            anchor: '- B',
            content: '- B.1',
          },
        ],
      },
    })

    expect(result.newContent).toBe(['- A', '- B', '- B.1', '- C'].join('\n'))
    expect(result.appliedCount).toBe(1)
  })

  it('applies append operations', () => {
    const result = materializeTextEditPlan({
      content: '# Title',
      plan: {
        operations: [
          {
            type: 'append',
            content: 'More text',
          },
        ],
      },
    })

    expect(result.newContent).toBe('# Title\n\nMore text')
    expect(result.appliedCount).toBe(1)
    expect(result.operationResults[0]?.newRange).toEqual({
      start: 9,
      end: 18,
    })
  })

  it('applies replace_lines operations by 1-based inclusive range', () => {
    const result = materializeTextEditPlan({
      content: ['# Title', 'alpha', 'beta', 'gamma'].join('\n'),
      plan: {
        operations: [
          {
            type: 'replace_lines',
            startLine: 2,
            endLine: 3,
            newText: ['delta', 'epsilon'].join('\n'),
          },
        ],
      },
    })

    expect(result.newContent).toBe(
      ['# Title', 'delta', 'epsilon', 'gamma'].join('\n'),
    )
    expect(result.appliedCount).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.operationResults[0]?.matchMode).toBe('lineRange')
    expect(result.operationResults[0]?.matchedRange).toEqual({
      start: 8,
      end: 19,
    })
  })

  it('deletes the requested line range when replace_lines newText is empty', () => {
    const result = materializeTextEditPlan({
      content: ['one', 'two', 'three'].join('\n'),
      plan: {
        operations: [
          {
            type: 'replace_lines',
            startLine: 2,
            endLine: 3,
            newText: '',
          },
        ],
      },
    })

    expect(result.newContent).toBe('one')
    expect(result.appliedCount).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.operationResults[0]?.newRange).toEqual({
      start: 3,
      end: 3,
    })
  })

  it('rejects replace_lines operations when the requested lines are out of bounds', () => {
    const result = materializeTextEditPlan({
      content: ['a', 'b'].join('\n'),
      plan: {
        operations: [
          {
            type: 'replace_lines',
            startLine: 2,
            endLine: 3,
            newText: 'x',
          },
        ],
      },
    })

    expect(result.appliedCount).toBe(0)
    expect(result.errors[0]).toContain('out of bounds')
  })

  it('uses loose matching for smart quotes and line endings', () => {
    const result = materializeTextEditPlan({
      content: 'He said “hello”.\r\n',
      plan: {
        operations: [
          {
            type: 'replace',
            oldText: 'He said "hello".\n',
            newText: 'He said "hi".\n',
          },
        ],
      },
    })

    expect(result.newContent).toBe('He said "hi".\n')
    expect(result.operationResults[0]?.matchMode).toBe(
      'lineEndingAndTrimLineEnd',
    )
  })

  it('reports occurrence mismatches as errors', () => {
    const result = materializeTextEditPlan({
      content: 'repeat\nrepeat',
      plan: {
        operations: [
          {
            type: 'replace',
            oldText: 'repeat',
            newText: 'done',
          },
        ],
      },
    })

    expect(result.appliedCount).toBe(0)
    expect(result.errors[0]).toContain('expectedOccurrences mismatch')
  })

  it('applies fuzzy replacement when a unique paragraph candidate exceeds threshold', () => {
    const content = [
      '# Notes',
      '',
      '### Knowledge Distillation & Consolidation',
      'The main purpose of a journal is learning and reflection. Do not create entries blindly; only record when a valuable topic arises or entirely new knowledge is learned.',
      '',
      'Your core competitive advantage lies not in initial settings, but in the structured consolidation of interaction data.',
      '',
      'Tail remains unchanged.',
    ].join('\n')

    const result = materializeTextEditPlan({
      content,
      plan: {
        operations: [
          {
            type: 'replace',
            oldText: [
              '### Knowledge Distillation & Consolidation',
              'The main purpose of a journal is learning and reflection. Do not create entries blindly; only record when a valuable topic arises or new knowledge is learned.',
              '',
              'Your core competitive advantage lies not in initial settings, but in the structured consolidation of interaction data.',
            ].join('\n'),
            newText: '### Knowledge Distillation\n\nUpdated specification.',
          },
        ],
      },
    })

    expect(result.appliedCount).toBe(1)
    expect(result.errors).toEqual([])
    expect(result.operationResults[0]?.matchMode).toBe('fuzzyUniqueParagraph')
    expect(result.newContent).toContain('Updated specification.')
    expect(result.newContent).toContain('Tail remains unchanged.')
  })

  it('rejects fuzzy replacement when multiple paragraph candidates exceed threshold', () => {
    const content = [
      'Paragraph A: Keep the same text for ambiguity testing, and ensure enough words to trigger the fuzzy matching mechanism.',
      '',
      'Paragraph A: Keep the same text for ambiguity testing, and ensure enough words to trigger the fuzzy matching mechanism.',
    ].join('\n')

    const result = materializeTextEditPlan({
      content,
      plan: {
        operations: [
          {
            type: 'replace',
            oldText:
              'Paragraph A: Keep the same text for ambiguity testing, and ensure enough words to trigger the fuzzy matching mechanism!',
            newText: 'Unique replacement target.',
          },
        ],
      },
    })

    expect(result.appliedCount).toBe(0)
    expect(result.errors[0]).toContain('fuzzyCandidatesAboveThreshold=2')
  })
})

describe('recoverLikelyEscapedBackslashSequences', () => {
  it('restores likely escaped control characters', () => {
    expect(recoverLikelyEscapedBackslashSequences('foo\bbar')).toBe('foo\\bbar')
  })
})
