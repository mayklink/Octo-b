import { describe, expect, it } from 'vitest'
import { todoBodyText } from '@/components/sessions/tools/todoIcons'

describe('todoBodyText', () => {
  it('returns plain strings', () => {
    expect(todoBodyText('Fix bug')).toBe('Fix bug')
  })

  it('unwraps { content } shape from Cursor-style payloads', () => {
    expect(todoBodyText({ content: 'Step one' })).toBe('Step one')
  })

  it('serializes nested non-string content safely', () => {
    expect(todoBodyText({ content: { a: 1 } })).toBe('{"a":1}')
  })

  it('handles nullish', () => {
    expect(todoBodyText(null)).toBe('')
    expect(todoBodyText(undefined)).toBe('')
  })
})
