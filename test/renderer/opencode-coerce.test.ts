import { describe, expect, it } from 'vitest'
import {
  coerceOpenCodeRenderableString,
  mapOpencodeMessagesToSessionViewMessages,
  mapOpencodePartToStreamingPart
} from '@/lib/opencode-transcript'

describe('coerceOpenCodeRenderableString', () => {
  it('unwraps nested { content } wrappers', () => {
    expect(coerceOpenCodeRenderableString({ content: { content: 'Hi' } })).toBe('Hi')
  })

  it('prefers text over content when both exist', () => {
    expect(coerceOpenCodeRenderableString({ text: 'A', content: 'B' })).toBe('A')
  })

  it('falls back to JSON for other objects', () => {
    expect(coerceOpenCodeRenderableString({ a: 1 })).toBe('{"a":1}')
  })
})

describe('mapOpencodeMessagesToSessionViewMessages', () => {
  it('coerces assistant message-level content objects to strings', () => {
    const [msg] = mapOpencodeMessagesToSessionViewMessages([
      { role: 'assistant', id: '1', timestamp: '', content: { content: 'Hello' }, parts: [] }
    ])
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('Hello')
  })
})

describe('mapOpencodePartToStreamingPart — text payloads', () => {
  it('maps { type:text, content } from Cursor-style wire format', () => {
    const part = mapOpencodePartToStreamingPart({ type: 'text', content: 'x' }, 0)
    expect(part).toEqual({ type: 'text', text: 'x' })
  })
})
