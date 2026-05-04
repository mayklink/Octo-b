/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import {
  mapCodexEventToStreamEvents,
  contentStreamKindFromMethod
} from '../../../src/main/services/codex-event-mapper'
import type { CodexManagerEvent } from '../../../src/main/services/codex-app-server-manager'

// ── Helpers ──────────────────────────────────────────────────────

function makeEvent(overrides: Partial<CodexManagerEvent>): CodexManagerEvent {
  return {
    id: 'evt-1',
    kind: 'notification',
    provider: 'codex',
    threadId: 'thread-1',
    createdAt: new Date().toISOString(),
    method: '',
    ...overrides
  }
}

const OCTOB_SESSION = 'octob-session-abc'

describe('typed event mapper migration', () => {
  // ── Step 1: thread/name/updated with ThreadNameUpdatedNotification ──

  describe('thread/name/updated with ThreadNameUpdatedNotification', () => {
    it('typed payload with threadName produces session.updated with title', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: { threadId: 'thread-1', threadName: 'My Session' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'session.updated',
        sessionId: OCTOB_SESSION,
        data: { title: 'My Session', info: { title: 'My Session' } }
      })
    })

    it('threadName undefined returns empty result', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: { threadId: 'thread-1' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(0)
    })

    it('threadName empty string returns empty result', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: { threadId: 'thread-1', threadName: '' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(0)
    })
  })

  // ── Step 2: typed delta notifications ──

  describe('typed delta notifications', () => {
    it('AgentMessageDeltaNotification shape produces text part', () => {
      const event = makeEvent({
        method: 'item/agentMessage/delta',
        payload: { threadId: 'thread-1', turnId: 't1', itemId: 'i1', delta: 'Hello' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('message.part.updated')
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'Hello' })
      expect(data.delta).toBe('Hello')
    })

    it('ReasoningTextDeltaNotification shape produces reasoning part', () => {
      const event = makeEvent({
        method: 'item/reasoning/textDelta',
        payload: { threadId: 'thread-1', turnId: 't1', itemId: 'i1', delta: 'Thinking...' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'reasoning', text: 'Thinking...' })
      expect(data.delta).toBe('Thinking...')
    })

    it('ReasoningSummaryTextDeltaNotification shape produces reasoning part', () => {
      const event = makeEvent({
        method: 'item/reasoning/summaryTextDelta',
        payload: {
          threadId: 'thread-1',
          turnId: 't1',
          itemId: 'i1',
          delta: 'Summary text',
          summaryIndex: 0
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'reasoning', text: 'Summary text' })
      expect(data.delta).toBe('Summary text')
    })

    it('CommandExecutionOutputDeltaNotification with itemId produces tool card with outputDelta', () => {
      const event = makeEvent({
        method: 'item/commandExecution/outputDelta',
        itemId: 'tool-42',
        payload: { threadId: 'thread-1', turnId: 't1', itemId: 'tool-42', delta: 'output line' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('message.part.updated')
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.callID).toBe('tool-42')
      expect(part.tool).toBe('Bash')
      expect(part.state).toEqual({ status: 'running', outputDelta: 'output line' })
    })

    it('FileChangeOutputDeltaNotification with itemId produces tool card with outputDelta', () => {
      const event = makeEvent({
        method: 'item/fileChange/outputDelta',
        itemId: 'tool-fc-7',
        payload: { threadId: 'thread-1', turnId: 't1', itemId: 'tool-fc-7', delta: 'diff content' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.callID).toBe('tool-fc-7')
      expect(part.tool).toBe('fileChange')
      expect(part.state).toEqual({ status: 'running', outputDelta: 'diff content' })
    })

    it('PlanDeltaNotification shape produces text part', () => {
      const event = makeEvent({
        method: 'item/plan/delta',
        payload: { threadId: 'thread-1', turnId: 't1', itemId: 'i1', delta: 'plan step 1' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'plan step 1' })
      expect(data.delta).toBe('plan step 1')
    })

    it('backward compat: structured delta object { type, text } still works', () => {
      const event = makeEvent({
        method: 'item/agentMessage/delta',
        payload: {
          delta: { type: 'text', text: 'fallback' }
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'fallback' })
      expect(data.delta).toBe('fallback')
    })

    it('backward compat: payload.assistantText still works', () => {
      const event = makeEvent({
        method: 'item/agentMessage/delta',
        payload: { assistantText: 'payload assistant text' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'payload assistant text' })
      expect(data.delta).toBe('payload assistant text')
    })

    it('backward compat: payload.reasoningText still works', () => {
      const event = makeEvent({
        method: 'item/reasoning/textDelta',
        payload: { reasoningText: 'payload reasoning text' }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'reasoning', text: 'payload reasoning text' })
      expect(data.delta).toBe('payload reasoning text')
    })
  })

  // ── Step 3: turn/completed with TurnCompletedNotification ──

  describe('turn/completed with TurnCompletedNotification', () => {
    it('extracts error.message from TurnError object', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: {
          threadId: 'thread-1',
          turn: {
            id: 'turn-1',
            items: [],
            status: 'failed',
            error: {
              message: 'Rate limit exceeded',
              codexErrorInfo: null,
              additionalDetails: null
            },
            startedAt: null,
            completedAt: null,
            durationMs: null
          }
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      const errorEvent = result.find((e: any) => e.type === 'session.error')
      expect(errorEvent).toBeDefined()
      expect((errorEvent as any).data.error).toBe('Rate limit exceeded')
    })

    it('status completed produces idle status with no error event', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: {
          threadId: 'thread-1',
          turn: {
            id: 'turn-1',
            items: [],
            status: 'completed',
            error: null,
            startedAt: null,
            completedAt: null,
            durationMs: null
          }
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      const statusEvents = result.filter((e) => e.type === 'session.status')
      expect(statusEvents).toHaveLength(1)
      expect(statusEvents[0].statusPayload).toEqual({ type: 'idle' })

      const errorEvents = result.filter((e) => e.type === 'session.error')
      expect(errorEvents).toHaveLength(0)
    })

    it('status interrupted produces idle status with no error event', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: {
          threadId: 'thread-1',
          turn: {
            id: 'turn-1',
            items: [],
            status: 'interrupted',
            error: null,
            startedAt: null,
            completedAt: null,
            durationMs: null
          }
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      const statusEvents = result.filter((e) => e.type === 'session.status')
      expect(statusEvents).toHaveLength(1)
      expect(statusEvents[0].statusPayload).toEqual({ type: 'idle' })

      const errorEvents = result.filter((e) => e.type === 'session.error')
      expect(errorEvents).toHaveLength(0)
    })

    it('status failed with string error (legacy flat payload) still works via fallback', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: {
          turn: { status: 'failed', error: 'Legacy error string' }
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      const errorEvent = result.find((e: any) => e.type === 'session.error')
      expect(errorEvent).toBeDefined()
      expect((errorEvent as any).data.error).toBe('Legacy error string')
    })

    it('turn with usage and cost at payload level produces message.updated', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: {
          threadId: 'thread-1',
          turn: {
            id: 'turn-1',
            items: [],
            status: 'completed',
            error: null,
            startedAt: null,
            completedAt: null,
            durationMs: null
          },
          usage: { inputTokens: 100, outputTokens: 50 },
          cost: 0.003
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      const usageEvents = result.filter((e) => e.type === 'message.updated')
      expect(usageEvents).toHaveLength(1)
      expect((usageEvents[0].data as any).usage).toEqual({
        inputTokens: 100,
        outputTokens: 50
      })
      expect((usageEvents[0].data as any).cost).toBe(0.003)
    })

    it('empty payload defaults to completed with idle status', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: {}
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      const statusEvents = result.filter((e) => e.type === 'session.status')
      expect(statusEvents).toHaveLength(1)
      expect(statusEvents[0].statusPayload).toEqual({ type: 'idle' })

      const errorEvents = result.filter((e) => e.type === 'session.error')
      expect(errorEvents).toHaveLength(0)
    })
  })

  // ── Step 4: item/started and item/completed with typed ThreadItem ──

  describe('item/started and item/completed with typed ThreadItem', () => {
    it('commandExecution item started produces Bash tool card with stripped command', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-1',
            command: "/bin/zsh -lc 'ls -la'",
            cwd: '/home/user',
            processId: null,
            source: 'agent',
            status: 'running',
            commandActions: [],
            aggregatedOutput: null,
            exitCode: null,
            durationMs: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.tool).toBe('Bash')
      expect(part.callID).toBe('cmd-1')
      expect(part.state.status).toBe('running')
      expect(part.state.input).toEqual(expect.objectContaining({ command: 'ls -la' }))
    })

    it('commandExecution item started maps sed reads to Read with line context', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-read-1',
            command: "/bin/zsh -lc 'sed -n \"1,80p\" main.py'",
            cwd: '/home/user',
            processId: null,
            source: 'agent',
            status: 'running',
            commandActions: [
              {
                type: 'read',
                command: 'sed -n "1,80p" main.py',
                name: 'main.py',
                path: 'main.py'
              }
            ],
            aggregatedOutput: null,
            exitCode: null,
            durationMs: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Read')
      expect(part.state.input).toEqual(
        expect.objectContaining({
          file_path: 'main.py',
          offset: 1,
          limit: 79
        })
      )
    })

    it('commandExecution item started maps rg --files to Glob', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-glob-1',
            command: 'rg --files .',
            cwd: '/home/user',
            processId: null,
            source: 'agent',
            status: 'running',
            commandActions: [
              {
                type: 'listFiles',
                command: 'rg --files .',
                path: '.'
              }
            ],
            aggregatedOutput: null,
            exitCode: null,
            durationMs: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Glob')
      expect(part.state.input).toEqual(
        expect.objectContaining({
          pattern: '*',
          path: '.'
        })
      )
    })

    it('fileChange item started produces fileChange tool card', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'fileChange',
            id: 'fc-1',
            changes: [{ file: 'foo.ts', diff: '+line' }],
            status: 'applied'
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('fileChange')
      expect(part.callID).toBe('fc-1')
    })

    it('mcpToolCall item started produces MCP tool card', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'mcpToolCall',
            id: 'mcp-1',
            server: 'my-server',
            tool: 'my-tool',
            status: 'running',
            arguments: { key: 'value' },
            result: null,
            error: null,
            durationMs: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('MCP')
      expect(part.callID).toBe('mcp-1')
    })

    it('dynamicToolCall item started produces Tool card', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'dynamicToolCall',
            id: 'dyn-1',
            tool: 'custom-tool',
            arguments: { foo: 'bar' },
            status: 'running',
            contentItems: null,
            success: null,
            durationMs: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Tool')
      expect(part.callID).toBe('dyn-1')
    })

    it('collabAgentToolCall item started produces Task card', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'collabAgentToolCall',
            id: 'collab-1',
            tool: 'spawn',
            status: 'running',
            senderThreadId: 'thread-1',
            receiverThreadIds: ['thread-2'],
            prompt: 'do something',
            model: null,
            reasoningEffort: null,
            agentsStates: {}
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Task')
      expect(part.callID).toBe('collab-1')
    })

    it('webSearch item started produces WebSearch card', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'webSearch',
            id: 'ws-1',
            query: 'how to test',
            action: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('WebSearch')
      expect(part.callID).toBe('ws-1')
    })

    it('commandExecution item completed with aggregatedOutput', () => {
      const event = makeEvent({
        method: 'item/completed',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-2',
            command: 'echo hello',
            cwd: '/tmp',
            processId: 'p1',
            source: 'agent',
            status: 'completed',
            commandActions: [],
            aggregatedOutput: 'hello\n',
            exitCode: 0,
            durationMs: 500
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.state.status).toBe('completed')
      expect(part.state.output).toBe('hello\n')
    })

    it('commandExecution item completed with failed status produces error state', () => {
      const event = makeEvent({
        method: 'item/completed',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-3',
            command: 'false',
            cwd: '/tmp',
            processId: 'p2',
            source: 'agent',
            status: 'failed',
            commandActions: [],
            aggregatedOutput: 'command not found',
            exitCode: 1,
            durationMs: 100
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.state.status).toBe('error')
      expect(part.state.error).toBe('command not found')
    })

    it('backward compat: legacy item with toolName still works', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: { toolName: 'shell', type: 'commandExecution', id: 'x' }
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.callID).toBe('x')
    })
  })

  // ── Step 5: approval requests with typed params ──

  describe('approval requests with typed params', () => {
    it('commandExecution approval with typed params extracts command and itemId', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/commandExecution/requestApproval',
        itemId: 'cmd-99',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'cmd-99',
          command: "/bin/zsh -lc 'npm test'",
          cwd: '/project'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Bash')
      expect(part.callID).toBe('cmd-99')
      expect(part.state.status).toBe('running')
      expect(part.state.input).toEqual(expect.objectContaining({ command: 'npm test' }))
    })

    it('commandExecution approval maps rg --files fallback to Glob', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/commandExecution/requestApproval',
        itemId: 'cmd-glob-approval',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'cmd-glob-approval',
          command: "/bin/zsh -lc 'rg --files .'",
          cwd: '/project'
        }
      })

      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)

      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Glob')
      expect(part.state.input).toEqual(
        expect.objectContaining({
          pattern: '*',
          path: '.'
        })
      )
    })

    it('fileChange approval with typed params', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/fileChange/requestApproval',
        itemId: 'fc-99',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'fc-99',
          reason: 'needs write access'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('fileChange')
      expect(part.callID).toBe('fc-99')
    })

    it('extracts itemId from typed payload when event.itemId is absent', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/commandExecution/requestApproval',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'cmd-from-payload',
          command: 'echo hello'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.callID).toBe('cmd-from-payload')
    })

    it('backward compat: legacy item wrapper still works for commandExecution approval', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/commandExecution/requestApproval',
        itemId: 'legacy-1',
        payload: {
          item: { id: 'legacy-1', command: 'ls' }
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Bash')
      expect(part.callID).toBe('legacy-1')
    })

    it('fileRead approval uses existing asObject path (no generated type)', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/fileRead/requestApproval',
        itemId: 'fr-1',
        payload: {
          item: { id: 'fr-1' },
          itemId: 'fr-1'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Read')
      expect(part.callID).toBe('fr-1')
    })
  })

  // ── Step 6: terminal interaction with typed notification ──

  describe('terminal interaction with typed notification', () => {
    it('typed terminal interaction notification produces Bash tool card', () => {
      const event = makeEvent({
        method: 'item/commandExecution/terminalInteraction',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'ti-1',
          processId: 'proc-42',
          stdin: 'y\n'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.callID).toBe('ti-1')
      expect(part.tool).toBe('Bash')
      expect(part.state.status).toBe('running')
    })

    it('missing itemId returns empty result', () => {
      const event = makeEvent({
        method: 'item/commandExecution/terminalInteraction',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          processId: 'proc-42',
          stdin: 'y\n'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(0)
    })

    it('event.itemId takes precedence over payload itemId', () => {
      const event = makeEvent({
        method: 'item/commandExecution/terminalInteraction',
        itemId: 'from-event',
        payload: {
          threadId: 'thread-1',
          turnId: 'turn-1',
          itemId: 'from-payload',
          processId: 'proc-42',
          stdin: 'y\n'
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.callID).toBe('from-event')
    })
  })

  // ── Step 7: backward compatibility regression tests ──

  describe('backward compatibility', () => {
    it('turn/completed with flat string error (no turn object) still works', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: { state: 'failed', error: 'Connection lost' }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      const errorEvent = result.find((e: any) => e.type === 'session.error')
      expect(errorEvent).toBeDefined()
      expect((errorEvent as any).data.error).toBe('Connection lost')
      const idleEvent = result.find((e: any) => e.type === 'session.status')
      expect(idleEvent).toBeDefined()
      expect(idleEvent!.statusPayload).toEqual({ type: 'idle' })
    })

    it('turn/completed with no turn object defaults to completed', () => {
      const event = makeEvent({
        method: 'turn/completed',
        payload: { some: 'other data' }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      const errorEvents = result.filter((e: any) => e.type === 'session.error')
      expect(errorEvents).toHaveLength(0)
      const statusEvents = result.filter((e: any) => e.type === 'session.status')
      expect(statusEvents).toHaveLength(1)
      expect(statusEvents[0].statusPayload).toEqual({ type: 'idle' })
    })

    it('item.started (dot variant) with legacy toolName still maps', () => {
      const event = makeEvent({
        method: 'item.started',
        payload: {
          item: { toolName: 'run_shell', type: 'commandExecution', id: 'legacy-cmd' }
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.tool).toBe('Bash')
      expect(part.callID).toBe('legacy-cmd')
    })

    it('content delta with structured delta object still works', () => {
      const event = makeEvent({
        method: 'item/agentMessage/delta',
        payload: { delta: { type: 'text', text: 'structured fallback' } }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'structured fallback' })
    })

    it('content delta with reasoning type in structured delta', () => {
      const event = makeEvent({
        method: 'item/reasoning/textDelta',
        payload: { delta: { type: 'reasoning', text: 'thinking deeply' } }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'reasoning', text: 'thinking deeply' })
    })

    it('content delta with assistantText at payload level still works', () => {
      const event = makeEvent({
        method: 'item/agentMessage/delta',
        payload: { assistantText: 'from assistantText field' }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'from assistantText field' })
    })

    it('content delta with reasoningText at payload level still works', () => {
      const event = makeEvent({
        method: 'item/reasoning/textDelta',
        payload: { reasoningText: 'from reasoningText field' }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'reasoning', text: 'from reasoningText field' })
    })

    it('content delta via event.textDelta field still works', () => {
      const event = makeEvent({
        method: 'item/agentMessage/delta',
        textDelta: 'from textDelta'
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const data = result[0].data as any
      expect(data.part).toEqual({ type: 'text', text: 'from textDelta' })
    })

    it('approval with legacy item wrapper still works', () => {
      const event = makeEvent({
        kind: 'request',
        method: 'item/commandExecution/requestApproval',
        itemId: 'wrap-1',
        payload: {
          item: { id: 'wrap-1', command: '/bin/zsh -lc \'git status\'' }
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.tool).toBe('Bash')
      expect(part.callID).toBe('wrap-1')
      expect(part.state.status).toBe('running')
    })

    it('item/completed with legacy item output format still works', () => {
      const event = makeEvent({
        method: 'item/completed',
        payload: {
          item: { type: 'commandExecution', id: 'leg-1', toolName: 'shell', status: 'completed', output: 'legacy output' }
        }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.state.status).toBe('completed')
      expect(part.state.output).toBe('legacy output')
    })

    it('thread/name/updated with legacy payload format (no threadId) still works', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: { threadName: 'Legacy Title' }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'session.updated',
        sessionId: OCTOB_SESSION,
        data: { title: 'Legacy Title', info: { title: 'Legacy Title' } }
      })
    })

    it('terminal interaction falls back to asObject when typed fields missing', () => {
      const event = makeEvent({
        method: 'item/commandExecution/terminalInteraction',
        itemId: 'fallback-ti',
        payload: { item: { id: 'fallback-ti', type: 'commandExecution' } }
      })
      const result = mapCodexEventToStreamEvents(event, OCTOB_SESSION)
      expect(result).toHaveLength(1)
      const part = (result[0].data as any).part
      expect(part.type).toBe('tool')
      expect(part.callID).toBe('fallback-ti')
      expect(part.tool).toBe('Bash')
    })
  })
})
