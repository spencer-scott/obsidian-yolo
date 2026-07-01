import { ParsedTagContent, parseTagContents } from './parse-tag-content'

describe('parseYoloBlocks', () => {
  it('should parse a string with yolo_block elements', () => {
    const input = `Some text before
<yolo_block language="markdown" filename="example.md">
# Example Markdown

This is a sample markdown content for testing purposes.

## Features

- Lists
- **Bold text**
- *Italic text*
- [Links](https://example.com)

### Code Block
\`\`\`python
print("Hello, world!")
\`\`\`
</yolo_block>
Some text after`

    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Some text before' },
      {
        type: 'yolo_block',
        content: `# Example Markdown

This is a sample markdown content for testing purposes.

## Features

- Lists
- **Bold text**
- *Italic text*
- [Links](https://example.com)

### Code Block
\`\`\`python
print("Hello, world!")
\`\`\``,
        language: 'markdown',
        filename: 'example.md',
      },
      { type: 'string', content: 'Some text after' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle empty yolo_block elements', () => {
    const input = `
      <yolo_block language="python"></yolo_block>
    `

    const expected: ParsedTagContent[] = [
      { type: 'string', content: '      ' },
      {
        type: 'yolo_block',
        content: '',
        language: 'python',
        filename: undefined,
      },
      { type: 'string', content: '    ' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle input without yolo_block elements', () => {
    const input = 'Just a regular string without any yolo_block elements.'

    const expected: ParsedTagContent[] = [{ type: 'string', content: input }]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should ignore inline literal yolo_block mentions and still parse real blocks', () => {
    const input = `Here is how to use \`<yolo_block>\`:

<yolo_block filename="example.md">
<<<<<<< REPLACE
[old]
old content
=======
[new]
new content
>>>>>>> END
</yolo_block>`

    expect(parseTagContents(input)).toEqual([
      { type: 'string', content: 'Here is how to use `<yolo_block>`:\n' },
      {
        type: 'yolo_block',
        content: `<<<<<<< REPLACE
[old]
old content
=======
[new]
new content
>>>>>>> END`,
        filename: 'example.md',
        language: undefined,
        startLine: undefined,
        endLine: undefined,
      },
    ])
  })

  it('should handle multiple yolo_block elements', () => {
    const input = `Start
<yolo_block language="python" filename="script.py">
def greet(name):
    print(f"Hello, {name}!")
</yolo_block>
Middle
<yolo_block language="markdown" filename="example.md">
# Using tildes for code blocks

Did you know that you can use tildes for code blocks?

~~~python
print("Hello, world!")
~~~
</yolo_block>
End`

    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      {
        type: 'yolo_block',
        content: `def greet(name):
    print(f"Hello, {name}!")`,
        language: 'python',
        filename: 'script.py',
      },
      { type: 'string', content: 'Middle' },
      {
        type: 'yolo_block',
        content: `# Using tildes for code blocks

Did you know that you can use tildes for code blocks?

~~~python
print("Hello, world!")
~~~`,
        language: 'markdown',
        filename: 'example.md',
      },
      { type: 'string', content: 'End' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle unfinished yolo_block with only opening tag', () => {
    const input = `Start
<yolo_block language="markdown">
# Unfinished yolo_block

Some text after without closing tag`
    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      {
        type: 'yolo_block',
        content: `# Unfinished yolo_block

Some text after without closing tag`,
        language: 'markdown',
        filename: undefined,
      },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle yolo_block with startline and endline attributes', () => {
    const input = `<yolo_block language="markdown" startline="2" endline="5"></yolo_block>`
    const expected: ParsedTagContent[] = [
      {
        type: 'yolo_block',
        content: '',
        language: 'markdown',
        startLine: 2,
        endLine: 5,
      },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should unwrap nested yolo_block references', () => {
    const input = `<yolo_block language="markdown">
<yolo_block filename="Clinical-Medicine-KB/Basic-Medicine/Pathophysiology/Shock.md" language="markdown" startline="1782" endline="1784"></yolo_block>
</yolo_block>`

    const expected: ParsedTagContent[] = [
      {
        type: 'yolo_block',
        content: '',
        filename:
          'Clinical-Medicine-KB/Basic-Medicine/Pathophysiology/Shock.md',
        language: 'markdown',
        startLine: 1782,
        endLine: 1784,
      },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should keep outer block when nested tags are mixed with text', () => {
    const input = `<yolo_block language="markdown">
Please refer to the quote below:
<yolo_block filename="example.md" language="markdown" startline="1" endline="2"></yolo_block>
</yolo_block>`

    const expected: ParsedTagContent[] = [
      {
        type: 'yolo_block',
        content: `Please refer to the quote below:
<yolo_block filename="example.md" language="markdown" startline="1" endline="2"></yolo_block>`,
        language: 'markdown',
        filename: undefined,
      },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })
})

describe('parseThink', () => {
  it('should parse a string with think elements', () => {
    const input = `Start
<think>Thinking...</think>
End`
    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      { type: 'think', content: 'Thinking...' },
      { type: 'string', content: 'End' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle unfinished think with only opening tag', () => {
    const input = `Start
<think>Thinking...
Some text after without closing tag`
    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      {
        type: 'think',
        content: 'Thinking...\nSome text after without closing tag',
      },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle multiple think elements', () => {
    const input = `Start
<think>First thought</think>
Some text after
<think>Second thought</think>
End`
    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      { type: 'think', content: 'First thought' },
      { type: 'string', content: 'Some text after' },
      { type: 'think', content: 'Second thought' },
      { type: 'string', content: 'End' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })
})

describe('parseYoloBlockAndThink', () => {
  it('should parse a string with yolo_block and think elements', () => {
    const input = `Start
<think>Thinking...</think>

<yolo_block language="markdown" filename="example.md">
# Example Markdown

This is a sample markdown content for testing purposes.

## Features

- Lists
- **Bold text**
- *Italic text*
- [Links](https://example.com)
</yolo_block>
End`

    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      { type: 'think', content: 'Thinking...' },
      { type: 'string', content: '' },
      {
        type: 'yolo_block',
        content: `# Example Markdown

This is a sample markdown content for testing purposes.

## Features

- Lists
- **Bold text**
- *Italic text*
- [Links](https://example.com)`,
        language: 'markdown',
        filename: 'example.md',
        startLine: undefined,
        endLine: undefined,
      },
      { type: 'string', content: 'End' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })

  it('should handle nested yolo_block and think elements', () => {
    const input = `Start
<think>Thinking...
<yolo_block language="markdown" filename="example.md">
# Example Markdown

This is a sample markdown content for testing purposes.

## Features
</yolo_block>
</think>
End`
    const expected: ParsedTagContent[] = [
      { type: 'string', content: 'Start' },
      {
        type: 'think',
        content: `Thinking...
<yolo_block language="markdown" filename="example.md">
# Example Markdown

This is a sample markdown content for testing purposes.

## Features
</yolo_block>`,
      },
      { type: 'string', content: 'End' },
    ]

    const result = parseTagContents(input)
    expect(result).toEqual(expected)
  })
})
