import type { McpTool } from '../../types/mcp.types'

import { selectAllowedTools } from './tool-selection'

describe('selectAllowedTools', () => {
  it('filters out open_skill when no allowed skills are provided', () => {
    const availableTools: McpTool[] = [
      {
        name: 'yolo_local__open_skill',
        description: 'Open skill',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ]

    const result = selectAllowedTools({
      availableTools,
    })

    expect(result.filteredTools).toEqual([])
    expect(result.hasTools).toBe(false)
    expect(result.hasMemoryTools).toBe(false)
    expect(result.requestTools).toBeUndefined()
  })

  it('keeps open_skill when skill allowlist is present', () => {
    const availableTools: McpTool[] = [
      {
        name: 'yolo_local__open_skill',
        description: 'Open skill',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ]

    const result = selectAllowedTools({
      availableTools,
      allowedSkillIds: ['skill-1'],
    })

    expect(result.filteredTools).toHaveLength(1)
    expect(result.hasTools).toBe(true)
    expect(result.hasMemoryTools).toBe(false)
    expect(result.requestTools).toEqual([
      {
        type: 'function',
        function: {
          name: 'yolo_local__open_skill',
          description: 'Open skill',
          parameters: {
            type: 'object',
            properties: {},
          },
        },
      },
    ])
  })

  it('keeps full schemas for tools left in always mode', () => {
    const availableTools: McpTool[] = [
      {
        name: 'server__tool_a',
        description: 'Tool A',
        inputSchema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
        },
      },
    ]

    const result = selectAllowedTools({
      availableTools,
      allowedToolNames: ['server__tool_a'],
      toolPreferences: {
        server__tool_a: {
          enabled: true,
          approvalMode: 'full_access',
          disclosureMode: 'always',
        },
      },
    })

    expect(result.requestTools?.map((tool) => tool.function.name)).toEqual([
      'server__tool_a',
    ])
    expect(result.requestTools?.[0]?.function.parameters).toEqual({
      type: 'object',
      properties: { foo: { type: 'string' } },
    })
  })

  it('replaces on-demand tools with a permissive stub schema (non-Gemini)', () => {
    const availableTools: McpTool[] = [
      {
        name: 'yolo_local__load_tool_schemas',
        description: 'Search tools',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'server__tool_a',
        description: 'Tool A real schema',
        inputSchema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      },
    ]

    const result = selectAllowedTools({
      availableTools,
      allowedToolNames: ['yolo_local__load_tool_schemas', 'server__tool_a'],
      toolPreferences: {
        yolo_local__load_tool_schemas: { enabled: true },
        server__tool_a: { enabled: true, disclosureMode: 'on_demand' },
      },
      apiType: 'anthropic',
    })

    // Tools field stays frozen: both tools are registered every turn so the
    // prompt-cache prefix never invalidates.
    expect(result.requestTools?.map((tool) => tool.function.name)).toEqual([
      'yolo_local__load_tool_schemas',
      'server__tool_a',
    ])
    const stub = result.requestTools?.find(
      (tool) => tool.function.name === 'server__tool_a',
    )
    expect(stub?.function.parameters).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: true,
    })
    // Stub description must include the on-demand hint so the model knows to
    // call load_tool_schemas first.
    expect(stub?.function.description).toContain('load_tool_schemas')
  })

  it('uses args_json stub form on Gemini', () => {
    const availableTools: McpTool[] = [
      {
        name: 'server__tool_a',
        description: 'Tool A',
        inputSchema: { type: 'object', properties: {} },
      },
    ]

    const result = selectAllowedTools({
      availableTools,
      allowedToolNames: ['server__tool_a'],
      toolPreferences: {
        server__tool_a: { enabled: true, disclosureMode: 'on_demand' },
      },
      apiType: 'gemini',
    })

    const stub = result.requestTools?.[0]
    expect(stub?.function.parameters).toEqual({
      type: 'object',
      properties: {
        args_json: expect.objectContaining({ type: 'string' }),
      },
      required: ['args_json'],
    })
  })

  it('uses full schemas and hides the schema loader when disclosure is disabled', () => {
    const availableTools: McpTool[] = [
      {
        name: 'yolo_local__load_tool_schemas',
        description: 'Search tools',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'server__tool_a',
        description: 'Tool A real schema',
        inputSchema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
          required: ['foo'],
        },
      },
    ]

    const result = selectAllowedTools({
      availableTools,
      allowedToolNames: ['yolo_local__load_tool_schemas', 'server__tool_a'],
      enableToolDisclosure: false,
      toolPreferences: {
        yolo_local__load_tool_schemas: { enabled: true },
        server__tool_a: { enabled: true, disclosureMode: 'on_demand' },
      },
    })

    expect(result.requestTools?.map((tool) => tool.function.name)).toEqual([
      'server__tool_a',
    ])
    expect(result.requestTools?.[0]?.function.parameters).toEqual({
      type: 'object',
      properties: { foo: { type: 'string' } },
      required: ['foo'],
    })
  })

  it('produces the same tools-field hash before and after a load_tool_schemas load', () => {
    const availableTools: McpTool[] = [
      {
        name: 'yolo_local__load_tool_schemas',
        description: 'Search tools',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'server__tool_a',
        description: 'Tool A',
        inputSchema: {
          type: 'object',
          properties: { foo: { type: 'string' } },
        },
      },
    ]
    const params = {
      availableTools,
      allowedToolNames: ['yolo_local__load_tool_schemas', 'server__tool_a'],
      toolPreferences: {
        yolo_local__load_tool_schemas: { enabled: true },
        server__tool_a: { enabled: true, disclosureMode: 'on_demand' as const },
      },
      apiType: 'anthropic' as const,
    }

    // Selection no longer takes loadedToolNames into account at all — the
    // tools field is frozen across the whole conversation.
    const before = selectAllowedTools(params)
    const after = selectAllowedTools(params)

    expect(JSON.stringify(before.requestTools)).toEqual(
      JSON.stringify(after.requestTools),
    )
  })
})
