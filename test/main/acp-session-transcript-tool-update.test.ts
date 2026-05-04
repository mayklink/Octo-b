import { describe, it, expect } from 'vitest'
import { acpTranscriptRecordToolCall, acpTranscriptUpdateToolCall } from '../../src/main/services/acp-session-transcript'

describe('acpTranscriptUpdateToolCall', () => {
  it('merges rawInput from follow-up updates', () => {
    const messages: unknown[] = []
    acpTranscriptRecordToolCall(messages, 'call-1', 'todo_write', {})

    acpTranscriptUpdateToolCall(messages, 'call-1', 'todo_write', 'running', undefined, {
      todos: [{ id: '1', status: 'pending', content: 'explore repo' }]
    })

    const assistant = messages[messages.length - 1] as Record<string, unknown>
    const parts = assistant.parts as Array<Record<string, unknown>>
    const tool = parts.find((p) => p.type === 'tool')
    expect(tool).toBeDefined()
    const state = tool!.state as Record<string, unknown>
    expect(state.status).toBe('running')
    expect(state.input).toEqual({ todos: [{ id: '1', status: 'pending', content: 'explore repo' }] })
  })
})
