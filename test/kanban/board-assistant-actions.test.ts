import { describe, expect, test } from 'vitest'
import { parseBoardTicketActionSet } from '../../src/renderer/src/lib/board-assistant-actions'

function actionBlock(actions: unknown[]): string {
  return [
    '```board-ticket-actions',
    JSON.stringify({ actions }),
    '```'
  ].join('\n')
}

describe('board assistant ticket action parsing', () => {
  test('rejects null and empty ticket titles before apply', () => {
    const parsed = parseBoardTicketActionSet(
      actionBlock([
        {
          actionKey: 'clear-title',
          type: 'update',
          ticketId: 'ticket-1',
          title: null
        },
        {
          actionKey: 'blank-title',
          type: 'update',
          ticketId: 'ticket-2',
          title: '   '
        }
      ])
    )

    expect(parsed).not.toBeNull()
    expect(parsed!.hasValidationErrors).toBe(true)
    expect(parsed!.actions[0].title).toBeUndefined()
    expect(parsed!.actions[0].validationIssues).toContain('Title must be a non-empty string.')
    expect(parsed!.actions[1].title).toBeUndefined()
    expect(parsed!.actions[1].validationIssues).toContain('Title must be a non-empty string.')
  })

  test('allows clearing descriptions without changing the title', () => {
    const parsed = parseBoardTicketActionSet(
      actionBlock([
        {
          actionKey: 'clear-description',
          type: 'update',
          ticketId: 'ticket-1',
          description: null
        }
      ])
    )

    expect(parsed).not.toBeNull()
    expect(parsed!.hasValidationErrors).toBe(false)
    expect(parsed!.actions[0].description).toBeNull()
    expect(parsed!.actions[0].title).toBeUndefined()
  })
})
