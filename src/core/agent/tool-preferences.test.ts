import {
  getAssistantToolApprovalMode,
  getDefaultEnabledForTool,
  getEnabledAssistantToolNames,
  getExplicitlyEnabledAssistantToolNames,
  isAssistantToolEnabled,
} from './tool-preferences'

const JS_SANDBOX_FQN = 'yolo_local__js_eval'

describe('tool-preferences defaults', () => {
  describe('getDefaultEnabledForTool', () => {
    it('returns true for built-in tools not in the deny-list', () => {
      expect(getDefaultEnabledForTool('yolo_local__fs_read')).toBe(true)
      expect(getDefaultEnabledForTool('yolo_local__load_tool_schemas')).toBe(
        true,
      )
    })

    it('returns false for built-in tools in the deny-list', () => {
      expect(
        getDefaultEnabledForTool('yolo_local__context_prune_tool_results'),
      ).toBe(false)
      expect(getDefaultEnabledForTool('yolo_local__context_compact')).toBe(
        false,
      )
      expect(getDefaultEnabledForTool('yolo_local__js_eval')).toBe(false)
    })

    it('returns false for third-party MCP tools', () => {
      expect(getDefaultEnabledForTool('Gemini__get_all_tabs')).toBe(false)
      expect(getDefaultEnabledForTool('some_server__some_tool')).toBe(false)
    })

    it('returns false for malformed tool names', () => {
      expect(getDefaultEnabledForTool('not_a_qualified_name')).toBe(false)
    })

    it('returns false for unknown short names on the local server', () => {
      // Finding 2: server-only check used to default-enable arbitrary
      // `yolo_local__*` strings; tighten by also requiring the short name to
      // exist in LOCAL_FILE_TOOL_SHORT_NAMES.
      expect(getDefaultEnabledForTool('yolo_local__unknown_tool')).toBe(false)
      expect(getDefaultEnabledForTool('yolo_local__fs_write_legacy')).toBe(
        false,
      )
    })
  })

  describe('isAssistantToolEnabled', () => {
    it('falls back to defaults for tools with no explicit preference', () => {
      const assistant = { toolPreferences: {}, enabledToolNames: [] }
      expect(isAssistantToolEnabled(assistant, 'yolo_local__fs_read')).toBe(
        true,
      )
      expect(
        isAssistantToolEnabled(assistant, 'yolo_local__context_compact'),
      ).toBe(false)
      expect(isAssistantToolEnabled(assistant, 'Gemini__get_all_tabs')).toBe(
        false,
      )
    })

    it('explicit preferences override defaults', () => {
      expect(
        isAssistantToolEnabled(
          {
            toolPreferences: {
              yolo_local__fs_read: { enabled: false },
            },
            enabledToolNames: [],
          },
          'yolo_local__fs_read',
        ),
      ).toBe(false)
      expect(
        isAssistantToolEnabled(
          {
            toolPreferences: {
              yolo_local__context_compact: { enabled: true },
            },
            enabledToolNames: [],
          },
          'yolo_local__context_compact',
        ),
      ).toBe(true)
      expect(
        isAssistantToolEnabled(
          {
            toolPreferences: {
              Gemini__get_all_tabs: { enabled: true },
            },
            enabledToolNames: [],
          },
          'Gemini__get_all_tabs',
        ),
      ).toBe(true)
    })

    it('legacy enabledToolNames is promoted to enabled via preferences merge', () => {
      const assistant = {
        toolPreferences: {},
        enabledToolNames: ['Gemini__get_all_tabs'],
      }
      expect(isAssistantToolEnabled(assistant, 'Gemini__get_all_tabs')).toBe(
        true,
      )
    })

    it('handles null / undefined assistant', () => {
      expect(isAssistantToolEnabled(null, 'yolo_local__fs_read')).toBe(true)
      expect(isAssistantToolEnabled(undefined, 'yolo_local__fs_read')).toBe(
        true,
      )
      expect(isAssistantToolEnabled(null, 'yolo_local__context_compact')).toBe(
        false,
      )
    })
  })

  describe('getEnabledAssistantToolNames', () => {
    it('returns all default-on built-ins for a fresh assistant', () => {
      const result = getEnabledAssistantToolNames({
        toolPreferences: {},
        enabledToolNames: [],
      })
      expect(result).toContain('yolo_local__fs_read')
      expect(result).toContain('yolo_local__fs_edit')
      expect(result).toContain('yolo_local__load_tool_schemas')
      expect(result).not.toContain('yolo_local__context_prune_tool_results')
      expect(result).not.toContain('yolo_local__context_compact')
      expect(result).not.toContain('yolo_local__js_eval')
    })

    it('explicit disable removes a tool from the result', () => {
      const result = getEnabledAssistantToolNames({
        toolPreferences: {
          yolo_local__fs_edit: { enabled: false },
        },
        enabledToolNames: [],
      })
      expect(result).toContain('yolo_local__fs_read')
      expect(result).not.toContain('yolo_local__fs_edit')
    })

    it('explicit enable for a deny-listed tool brings it back', () => {
      const result = getEnabledAssistantToolNames({
        toolPreferences: {
          yolo_local__context_compact: { enabled: true },
        },
        enabledToolNames: [],
      })
      expect(result).toContain('yolo_local__context_compact')
    })

    it('includes explicitly-enabled third-party tools alongside defaults', () => {
      const result = getEnabledAssistantToolNames({
        toolPreferences: {
          Gemini__get_all_tabs: { enabled: true },
          Gemini__close_tab: { enabled: false },
        },
        enabledToolNames: [],
      })
      expect(result).toContain('Gemini__get_all_tabs')
      expect(result).not.toContain('Gemini__close_tab')
      expect(result).toContain('yolo_local__fs_read')
    })

    it('excludes all built-in tools when includeBuiltinTools is false', () => {
      // Finding 1: the helper feeds persistence + display badges. Honoring
      // `includeBuiltinTools` keeps the saved snapshot and "N tools" count in
      // sync with what the runtime will actually expose.
      const result = getEnabledAssistantToolNames({
        toolPreferences: {
          yolo_local__fs_read: { enabled: true },
          Gemini__get_all_tabs: { enabled: true },
        },
        enabledToolNames: [],
        includeBuiltinTools: false,
      })
      expect(result).not.toContain('yolo_local__fs_read')
      expect(result).not.toContain('yolo_local__fs_edit')
      expect(result).toContain('Gemini__get_all_tabs')
    })

    it('includes built-ins when includeBuiltinTools is true or undefined', () => {
      const withFlag = getEnabledAssistantToolNames({
        toolPreferences: {},
        enabledToolNames: [],
        includeBuiltinTools: true,
      })
      const withoutFlag = getEnabledAssistantToolNames({
        toolPreferences: {},
        enabledToolNames: [],
      })
      expect(withFlag).toContain('yolo_local__fs_read')
      expect(withoutFlag).toContain('yolo_local__fs_read')
    })
  })

  describe('getAssistantToolApprovalMode (js_eval global cap override)', () => {
    const assistant = {
      toolPreferences: {
        [JS_SANDBOX_FQN]: {
          enabled: true,
          approvalMode: 'full_access' as const,
        },
      },
      enabledToolNames: [],
    }

    it('keeps the saved full_access mode when no extension capability is on', () => {
      expect(
        getAssistantToolApprovalMode(assistant, JS_SANDBOX_FQN, {
          jsSandboxSettings: {},
        }),
      ).toBe('full_access')
    })

    it('forces require_approval when any extension capability is on globally', () => {
      for (const cap of [
        'allowFetch',
        'allowVaultRead',
        'allowDbQuery',
        'allowExternalScripts',
      ] as const) {
        expect(
          getAssistantToolApprovalMode(assistant, JS_SANDBOX_FQN, {
            jsSandboxSettings: { [cap]: true },
          }),
        ).toBe('require_approval')
      }
    })

    it('does not override approval mode for other tools', () => {
      const withFsRead = {
        toolPreferences: {
          ...assistant.toolPreferences,
          yolo_local__fs_read: {
            enabled: true,
            approvalMode: 'full_access' as const,
          },
        },
        enabledToolNames: [],
      }
      expect(
        getAssistantToolApprovalMode(withFsRead, 'yolo_local__fs_read', {
          jsSandboxSettings: { allowFetch: true },
        }),
      ).toBe('full_access')
    })
  })

  describe('getExplicitlyEnabledAssistantToolNames', () => {
    it('returns only explicit-on preferences, never defaults', () => {
      const result = getExplicitlyEnabledAssistantToolNames({
        toolPreferences: {
          Gemini__get_all_tabs: { enabled: true },
          Gemini__close_tab: { enabled: false },
        },
        enabledToolNames: [],
      })
      expect(result).toEqual(['Gemini__get_all_tabs'])
    })

    it('returns empty for a fresh assistant with no preferences', () => {
      expect(
        getExplicitlyEnabledAssistantToolNames({
          toolPreferences: {},
          enabledToolNames: [],
        }),
      ).toEqual([])
    })

    it('promotes legacy enabledToolNames into the explicit set', () => {
      const result = getExplicitlyEnabledAssistantToolNames({
        toolPreferences: {},
        enabledToolNames: ['yolo_local__fs_read', 'Gemini__get_all_tabs'],
      })
      expect(result).toContain('yolo_local__fs_read')
      expect(result).toContain('Gemini__get_all_tabs')
    })
  })
})
