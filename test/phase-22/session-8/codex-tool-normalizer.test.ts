import { describe, expect, it } from 'vitest'

import { normalizeCommandExecutionTool } from '../../../src/shared/codex-tool-normalizer'

describe('normalizeCommandExecutionTool', () => {
  it('upgrades numbered nl|sed pipelines to Read with exact ranges', () => {
    const result = normalizeCommandExecutionTool({
      command:
        "nl -ba src/renderer/src/components/sessions/ToolCard.tsx | sed -n '40,120p;220,250p;570,620p;875,915p'"
    })

    expect(result).toEqual({
      toolName: 'Read',
      input: {
        file_path: 'src/renderer/src/components/sessions/ToolCard.tsx',
        line_ranges: [
          { start: 40, end: 120 },
          { start: 220, end: 250 },
          { start: 570, end: 620 },
          { start: 875, end: 915 }
        ]
      }
    })
  })

  it('leaves unsupported numbered sed scripts as Bash', () => {
    const result = normalizeCommandExecutionTool({
      command: "nl -ba src/index.ts | sed -n '40,120p;/needle/p'"
    })

    expect(result).toEqual({
      toolName: 'Bash',
      input: {
        command: "nl -ba src/index.ts | sed -n '40,120p;/needle/p'"
      }
    })
  })
})
