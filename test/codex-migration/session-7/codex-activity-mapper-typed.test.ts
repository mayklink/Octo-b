/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest'
import { mapCodexManagerEventToActivity } from '../../../src/main/services/codex-activity-mapper'
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

const SESSION_ID = 'session-1'
const AGENT_SESSION_ID = 'agent-session-1'

function mapActivity(event: CodexManagerEvent) {
  return mapCodexManagerEventToActivity(SESSION_ID, AGENT_SESSION_ID, event)
}

// ── Tests ────────────────────────────────────────────────────────

describe('codex-activity-mapper typed payloads', () => {
  // ── item/started with typed ItemStartedNotification ──

  describe('item/started with typed ItemStartedNotification', () => {
    it('commandExecution item returns tool.started activity', () => {
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

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.started')
      expect(result!.tone).toBe('tool')
      expect(result!.summary).toBe('Bash')
    })

    it('read commandExecution item returns Read activity summary', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-read-1',
            command: `sed -n '1,20p' src/index.ts`,
            cwd: '/home/user',
            processId: null,
            source: 'agent',
            status: 'running',
            commandActions: [
              {
                type: 'read',
                command: `sed -n '1,20p' src/index.ts`,
                name: 'index.ts',
                path: 'src/index.ts'
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

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Read')
    })

    it('fileChange item returns tool.started activity', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'fileChange',
            id: 'fc-1',
            changes: [],
            status: 'applied'
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.started')
      expect(result!.tone).toBe('tool')
      expect(result!.summary).toBe('fileChange')
    })
  })

  // ── item/completed with typed ItemCompletedNotification ──

  describe('item/completed with typed ItemCompletedNotification', () => {
    it('commandExecution completed returns tool.completed activity', () => {
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

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.completed')
      expect(result!.tone).toBe('tool')
      expect(result!.summary).toBe('Bash')
    })

    it('commandExecution with failed status returns tool.failed activity', () => {
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

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.failed')
      expect(result!.tone).toBe('error')
      expect(result!.summary).toBe('Bash')
    })
  })

  // ── item/updated with typed payload ──

  describe('item/updated with typed payload', () => {
    it('commandExecution updated returns tool.updated activity', () => {
      const event = makeEvent({
        method: 'item/updated',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-4',
            command: 'npm test',
            cwd: '/project',
            processId: 'p3',
            source: 'agent',
            status: 'running',
            commandActions: [],
            aggregatedOutput: 'running tests...',
            exitCode: null,
            durationMs: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.updated')
      expect(result!.tone).toBe('tool')
      expect(result!.summary).toBe('Bash')
    })

    it('search commandExecution updated returns Grep activity summary', () => {
      const event = makeEvent({
        method: 'item/updated',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'cmd-search-1',
            command: `rg -n "needle" src`,
            cwd: '/project',
            processId: 'p4',
            source: 'agent',
            status: 'running',
            commandActions: [
              {
                type: 'search',
                command: `rg -n "needle" src`,
                query: 'needle',
                path: 'src'
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

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.summary).toBe('Grep')
    })
  })

  // ── Non-tool item types return null ──

  describe('non-tool item types', () => {
    it('agentMessage item returns null', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'agentMessage',
            id: 'msg-1',
            text: 'Hello',
            phase: null,
            memoryCitation: null
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })

      const result = mapActivity(event)

      expect(result).toBeNull()
    })

    it('reasoning item returns null', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'reasoning',
            id: 'reason-1',
            summary: [],
            content: []
          },
          threadId: 'thread-1',
          turnId: 'turn-1'
        }
      })

      const result = mapActivity(event)

      expect(result).toBeNull()
    })
  })

  // ── thread/name/updated with typed ThreadNameUpdatedNotification ──

  describe('thread/name/updated with typed ThreadNameUpdatedNotification', () => {
    it('typed payload with threadName returns session.info with threadName', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: {
          threadId: 'thread-1',
          threadName: 'My Session Title'
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('session.info')
      expect(result!.tone).toBe('info')
      expect(result!.summary).toBe('My Session Title')
    })

    it('missing threadName falls back to default message', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: {
          threadId: 'thread-1'
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('session.info')
      expect(result!.summary).toBe('Thread title updated')
    })
  })

  // ── Backward compatibility: untyped/legacy payloads ──

  describe('backward compatibility with untyped/legacy payloads', () => {
    it('legacy payload with lowercase type still works via asObject/asString', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'commandexecution',
            id: 'leg-1',
            toolName: 'shell'
          }
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.started')
      expect(result!.tone).toBe('tool')
    })

    it('legacy payload with toolName at payload level still works', () => {
      const event = makeEvent({
        method: 'item/started',
        payload: {
          item: {
            type: 'filechange',
            id: 'leg-2'
          },
          toolName: 'apply_patch'
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.started')
      expect(result!.summary).toBe('fileChange')
    })

    it('dot-variant method with legacy payload still works', () => {
      const event = makeEvent({
        method: 'item.completed',
        payload: {
          item: {
            type: 'commandExecution',
            id: 'leg-3',
            status: 'completed'
          }
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('tool.completed')
      expect(result!.tone).toBe('tool')
    })

    it('thread/name/updated with legacy payload (no threadId) still works', () => {
      const event = makeEvent({
        method: 'thread/name/updated',
        payload: {
          threadName: 'Legacy Title'
        }
      })

      const result = mapActivity(event)

      expect(result).not.toBeNull()
      expect(result!.kind).toBe('session.info')
      expect(result!.summary).toBe('Legacy Title')
    })
  })
})
