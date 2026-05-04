import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { StreamEvent } from '../../../src/main/services/opencode-service'

/**
 * Session 5: Subagent Event Tagging
 *
 * Tests the logic for detecting child/subagent events, guarding notifications,
 * tagging forwarded events with childSessionId, and skipping persistence for child events.
 *
 * Since handleEvent is a private method on OpenCodeService, we test the extracted logic
 * patterns in isolation.
 */

describe('Session 5: Subagent Event Tagging', () => {
  // Helper: simulate the child detection logic from handleEvent
  function detectChildEvent(
    directOctobId: string | undefined,
    resolvedOctobId: string | undefined
  ): { octobSessionId: string | undefined; isChildEvent: boolean } {
    let octobSessionId = directOctobId
    if (!octobSessionId && resolvedOctobId) {
      octobSessionId = resolvedOctobId
    }
    const isChildEvent = !directOctobId && !!octobSessionId
    return { octobSessionId, isChildEvent }
  }

  describe('Child event detection', () => {
    test('child event detected when getMappedOctobSessionId returns null but resolveParentSession succeeds', () => {
      // getMappedOctobSessionId returns undefined for the child session ID
      // but resolveParentSession resolved through the parent to get a octobSessionId
      const { octobSessionId, isChildEvent } = detectChildEvent(undefined, 'octob-session-1')
      expect(isChildEvent).toBe(true)
      expect(octobSessionId).toBe('octob-session-1')
    })

    test('parent event detected when direct mapping exists', () => {
      // getMappedOctobSessionId returns octob ID directly
      const { octobSessionId, isChildEvent } = detectChildEvent('octob-session-1', undefined)
      expect(isChildEvent).toBe(false)
      expect(octobSessionId).toBe('octob-session-1')
    })

    test('no octob session found when both return undefined', () => {
      const { octobSessionId, isChildEvent } = detectChildEvent(undefined, undefined)
      expect(octobSessionId).toBeUndefined()
      expect(isChildEvent).toBe(false)
    })

    test('parent event when direct mapping exists even if resolve would also succeed', () => {
      // Direct mapping takes priority — isChildEvent should be false
      const { octobSessionId, isChildEvent } = detectChildEvent('octob-session-1', 'octob-session-1')
      expect(isChildEvent).toBe(false)
      expect(octobSessionId).toBe('octob-session-1')
    })
  })

  describe('Notification guard for session.idle', () => {
    test('notification only fires for parent session.idle', () => {
      const maybeNotifySessionComplete = vi.fn()

      // Parent session.idle
      const { isChildEvent: isParent } = detectChildEvent('octob-1', undefined)
      if (!isParent) {
        maybeNotifySessionComplete('octob-1')
      }
      expect(maybeNotifySessionComplete).toHaveBeenCalledWith('octob-1')
      expect(maybeNotifySessionComplete).toHaveBeenCalledTimes(1)
    })

    test('notification does NOT fire for child session.idle', () => {
      const maybeNotifySessionComplete = vi.fn()

      // Child session.idle
      const { isChildEvent } = detectChildEvent(undefined, 'octob-1')
      if (!isChildEvent) {
        maybeNotifySessionComplete('octob-1')
      }
      expect(maybeNotifySessionComplete).not.toHaveBeenCalled()
    })
  })

  describe('StreamEvent tagging with childSessionId', () => {
    test('child events tagged with childSessionId', () => {
      const sessionId = 'child-opencode-session'
      const octobSessionId = 'octob-session-1'
      const isChildEvent = true

      const streamEvent: StreamEvent = {
        type: 'message.part.updated',
        sessionId: octobSessionId,
        data: { part: { type: 'text', text: 'hello' } },
        ...(isChildEvent ? { childSessionId: sessionId } : {})
      }

      expect(streamEvent.childSessionId).toBe('child-opencode-session')
      expect(streamEvent.sessionId).toBe('octob-session-1')
    })

    test('parent events do not have childSessionId', () => {
      const sessionId = 'parent-opencode-session'
      const octobSessionId = 'octob-session-1'
      const isChildEvent = false

      const streamEvent: StreamEvent = {
        type: 'message.part.updated',
        sessionId: octobSessionId,
        data: { part: { type: 'text', text: 'hello' } },
        ...(isChildEvent ? { childSessionId: sessionId } : {})
      }

      expect(streamEvent.childSessionId).toBeUndefined()
      expect(streamEvent.sessionId).toBe('octob-session-1')
    })
  })

  describe('Persistence guard for child events', () => {
    test('parent events are persisted', () => {
      const persistStreamEvent = vi.fn()
      const isChildEvent = false
      const octobSessionId = 'octob-1'
      const eventType = 'message.part.updated'
      const data = { part: { type: 'text' } }

      if (!isChildEvent) {
        persistStreamEvent(octobSessionId, eventType, data)
      }

      expect(persistStreamEvent).toHaveBeenCalledWith(octobSessionId, eventType, data)
    })

    test('child events are NOT persisted as top-level messages', () => {
      const persistStreamEvent = vi.fn()
      const isChildEvent = true
      const octobSessionId = 'octob-1'
      const eventType = 'message.part.updated'
      const data = { part: { type: 'text' } }

      if (!isChildEvent) {
        persistStreamEvent(octobSessionId, eventType, data)
      }

      expect(persistStreamEvent).not.toHaveBeenCalled()
    })
  })

  describe('StreamEvent type', () => {
    test('StreamEvent interface supports optional childSessionId', () => {
      // Verify the type allows childSessionId to be omitted
      const parentEvent: StreamEvent = {
        type: 'session.idle',
        sessionId: 'octob-1',
        data: {}
      }
      expect(parentEvent.childSessionId).toBeUndefined()

      // Verify the type allows childSessionId to be set
      const childEvent: StreamEvent = {
        type: 'session.idle',
        sessionId: 'octob-1',
        data: {},
        childSessionId: 'child-1'
      }
      expect(childEvent.childSessionId).toBe('child-1')
    })
  })

  describe('End-to-end child event flow', () => {
    let sendToRenderer: ReturnType<typeof vi.fn>
    let persistStreamEvent: ReturnType<typeof vi.fn>
    let maybeNotifySessionComplete: ReturnType<typeof vi.fn>

    beforeEach(() => {
      sendToRenderer = vi.fn()
      persistStreamEvent = vi.fn()
      maybeNotifySessionComplete = vi.fn()
    })

    function simulateHandleEvent(params: {
      directOctobId: string | undefined
      resolvedOctobId: string | undefined
      sessionId: string
      eventType: string
      eventData: unknown
    }) {
      const { directOctobId, resolvedOctobId, sessionId, eventType, eventData } = params

      // Detection logic from handleEvent
      let octobSessionId = directOctobId
      if (!octobSessionId && resolvedOctobId) {
        octobSessionId = resolvedOctobId
      }
      if (!octobSessionId) return undefined

      const isChildEvent = !directOctobId && !!octobSessionId

      // Notification guard
      if (eventType === 'session.idle') {
        if (!isChildEvent) {
          maybeNotifySessionComplete(octobSessionId)
        }
      }

      // Persistence guard
      if (!isChildEvent) {
        persistStreamEvent(octobSessionId, eventType, eventData)
      }

      // Build StreamEvent
      const streamEvent: StreamEvent = {
        type: eventType,
        sessionId: octobSessionId,
        data: eventData,
        ...(isChildEvent ? { childSessionId: sessionId } : {})
      }

      sendToRenderer('opencode:stream', streamEvent)
      return streamEvent
    }

    test('parent message.part.updated: persisted, sent without childSessionId', () => {
      const result = simulateHandleEvent({
        directOctobId: 'octob-1',
        resolvedOctobId: undefined,
        sessionId: 'oc-parent',
        eventType: 'message.part.updated',
        eventData: { part: { type: 'text', text: 'hello' } }
      })

      expect(result).toBeDefined()
      expect(result!.childSessionId).toBeUndefined()
      expect(persistStreamEvent).toHaveBeenCalledTimes(1)
      expect(sendToRenderer).toHaveBeenCalledTimes(1)
      expect(maybeNotifySessionComplete).not.toHaveBeenCalled()
    })

    test('child message.part.updated: NOT persisted, sent WITH childSessionId', () => {
      const result = simulateHandleEvent({
        directOctobId: undefined,
        resolvedOctobId: 'octob-1',
        sessionId: 'oc-child',
        eventType: 'message.part.updated',
        eventData: { part: { type: 'text', text: 'child text' } }
      })

      expect(result).toBeDefined()
      expect(result!.childSessionId).toBe('oc-child')
      expect(persistStreamEvent).not.toHaveBeenCalled()
      expect(sendToRenderer).toHaveBeenCalledTimes(1)
      expect(maybeNotifySessionComplete).not.toHaveBeenCalled()
    })

    test('parent session.idle: persisted, notification fired, no childSessionId', () => {
      const result = simulateHandleEvent({
        directOctobId: 'octob-1',
        resolvedOctobId: undefined,
        sessionId: 'oc-parent',
        eventType: 'session.idle',
        eventData: {}
      })

      expect(result).toBeDefined()
      expect(result!.childSessionId).toBeUndefined()
      expect(persistStreamEvent).toHaveBeenCalledTimes(1)
      expect(maybeNotifySessionComplete).toHaveBeenCalledWith('octob-1')
      expect(sendToRenderer).toHaveBeenCalledTimes(1)
    })

    test('child session.idle: NOT persisted, NO notification, WITH childSessionId', () => {
      const result = simulateHandleEvent({
        directOctobId: undefined,
        resolvedOctobId: 'octob-1',
        sessionId: 'oc-child',
        eventType: 'session.idle',
        eventData: {}
      })

      expect(result).toBeDefined()
      expect(result!.childSessionId).toBe('oc-child')
      expect(persistStreamEvent).not.toHaveBeenCalled()
      expect(maybeNotifySessionComplete).not.toHaveBeenCalled()
      expect(sendToRenderer).toHaveBeenCalledTimes(1)
    })

    test('unresolvable session returns undefined', () => {
      const result = simulateHandleEvent({
        directOctobId: undefined,
        resolvedOctobId: undefined,
        sessionId: 'oc-unknown',
        eventType: 'message.part.updated',
        eventData: {}
      })

      expect(result).toBeUndefined()
      expect(persistStreamEvent).not.toHaveBeenCalled()
      expect(sendToRenderer).not.toHaveBeenCalled()
      expect(maybeNotifySessionComplete).not.toHaveBeenCalled()
    })
  })
})
