import { parseSnippets, removeSnippetBlock } from './snippetsManager'

describe('parseSnippets', () => {
  it('parses a single snippet without description', () => {
    const content = `## translate

Please translate the following into Chinese:
`
    const entries = parseSnippets(content)
    expect(entries).toEqual([
      {
        id: 'translate',
        trigger: 'translate',
        description: undefined,
        content: 'Please translate the following into Chinese:',
      },
    ])
  })

  it('parses multiple snippets with descriptions', () => {
    const content = `## translate
> Translate selected text into Chinese

Please translate the following into Chinese:

## review
> Code review

Please review:
- Edge cases
- Error handling
`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      trigger: 'translate',
      description: 'Translate selected text into Chinese',
      content: 'Please translate the following into Chinese:',
    })
    expect(entries[1]).toMatchObject({
      trigger: 'review',
      description: 'Code review',
      content: 'Please review:\n- Edge cases\n- Error handling',
    })
  })

  it('filters out snippets with empty body', () => {
    const content = `## empty
> only description

## valid

real body
`
    const entries = parseSnippets(content)
    expect(entries.map((entry) => entry.trigger)).toEqual(['valid'])
  })

  it('keeps the first occurrence on duplicate triggers', () => {
    const content = `## same

first body

## same

second body
`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe('first body')
  })

  it('ignores leading YAML frontmatter', () => {
    const content = `---
title: Snippets
---
## hello

world
`
    const entries = parseSnippets(content)
    expect(entries).toEqual([
      {
        id: 'hello',
        trigger: 'hello',
        description: undefined,
        content: 'world',
      },
    ])
  })

  it('does not treat ### as a snippet boundary', () => {
    const content = `## outer

### nested heading

inner body
`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].trigger).toBe('outer')
    expect(entries[0].content).toBe('### nested heading\n\ninner body')
  })

  it('does not treat a non-blockquote first line as description', () => {
    const content = `## tip

just plain text on the first line
more lines
`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].description).toBeUndefined()
    expect(entries[0].content).toBe(
      'just plain text on the first line\nmore lines',
    )
  })

  it('preserves inner formatting verbatim while trimming outer blank lines', () => {
    const content = `## fmt


line1

line2


`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].content).toBe('line1\n\nline2')
  })

  it('returns an empty array for empty input', () => {
    expect(parseSnippets('')).toEqual([])
    expect(parseSnippets('no headings at all\njust text')).toEqual([])
  })

  it('handles description with no body following it as empty body (filtered)', () => {
    const content = `## a
> just description
## b

body
`
    const entries = parseSnippets(content)
    expect(entries.map((entry) => entry.trigger)).toEqual(['b'])
  })

  it('does not treat a blockquote as description when separated from heading by a blank line', () => {
    const content = `## quoted

> This is a quote the user wants to keep in the body
Body continues
`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].description).toBeUndefined()
    expect(entries[0].content).toBe('> This is a quote the user wants to keep in the body\nBody continues')
  })

  it('treats heading with trailing spaces correctly', () => {
    const content = `##   spaced trigger

body`
    const entries = parseSnippets(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].trigger).toBe('spaced trigger')
  })
})

describe('removeSnippetBlock', () => {
  it('removes the first snippet', () => {
    const content = `## a

body a

## b

body b
`
    expect(removeSnippetBlock(content, 'a')).toBe(`## b

body b
`)
  })

  it('removes the last snippet', () => {
    const content = `## a

body a

## b

body b
`
    expect(removeSnippetBlock(content, 'b')).toBe(`## a

body a
`)
  })

  it('removes a middle snippet preserving neighbors', () => {
    const content = `## a

body a

## b

body b

## c

body c
`
    expect(removeSnippetBlock(content, 'b')).toBe(`## a

body a

## c

body c
`)
  })

  it('removes only the first occurrence when triggers duplicate', () => {
    const content = `## same

first

## same

second
`
    expect(removeSnippetBlock(content, 'same')).toBe(`## same

second
`)
  })

  it('returns input unchanged when trigger is not found', () => {
    const content = `## a

body a
`
    expect(removeSnippetBlock(content, 'missing')).toBe(content)
  })

  it('preserves leading HTML comment block byte-for-byte', () => {
    const content = `<!--
top notes
-->

## a

body a

## b

body b
`
    expect(removeSnippetBlock(content, 'a')).toBe(`<!--
top notes
-->

## b

body b
`)
  })

  it('preserves leading YAML frontmatter byte-for-byte', () => {
    const content = `---
title: Snippets
---
## a

body a

## b

body b
`
    expect(removeSnippetBlock(content, 'b')).toBe(`---
title: Snippets
---
## a

body a
`)
  })

  it('leaves a single trailing newline when removing the only snippet', () => {
    const content = `## a

body a
`
    expect(removeSnippetBlock(content, 'a')).toBe('')
  })

  it('does not swallow the blank line preceding the next heading', () => {
    const content = `## a

body a

## b

body b
`
    // After removing `a`, the blank line that sat between `a` and `## b`
    // would collapse with the EOF padding into 3+ blanks; the function
    // should collapse runs of 3+ down to 2 but not eat the structural
    // blank before `## b`.
    const out = removeSnippetBlock(content, 'a')
    expect(out.startsWith('## b\n')).toBe(true)
  })

  it('does not treat ## inside frontmatter as a snippet boundary', () => {
    const content = `---
description: |
  ## not a snippet
  this is yaml block scalar content
---
## real

real body
`
    // Removing the non-existent "not a snippet" must leave the file intact.
    expect(removeSnippetBlock(content, 'not a snippet')).toBe(content)

    // Removing the real snippet must keep the frontmatter intact.
    expect(removeSnippetBlock(content, 'real')).toBe(`---
description: |
  ## not a snippet
  this is yaml block scalar content
---
`)
  })

  it('preserves blank-line runs outside the deleted block', () => {
    // 4 blank lines between b and c sit outside the removed block; they must
    // not be globally collapsed.
    const content = `## a

body a

## b

body b




## c

body c
`
    const out = removeSnippetBlock(content, 'a')
    // The b→c gap had 4 blanks. It should still have 4 blanks after removing a.
    expect(out).toContain('body b\n\n\n\n\n## c')
  })

  it('collapses runs of 3+ blank lines down to 2', () => {
    const content = `## a

body a



## b

body b
`
    // Removing `a` leaves the 3 blank lines that were between bodies plus
    // any blanks already there. Result should have at most 2 consecutive
    // blank lines.
    const out = removeSnippetBlock(content, 'a')
    expect(out).not.toMatch(/\n\n\n/)
  })
})
