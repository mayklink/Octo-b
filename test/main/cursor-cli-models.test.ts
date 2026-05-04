// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  CURSOR_CLI_DEFAULT_MODEL_ID,
  CURSOR_CLI_STATIC_MODEL_ROWS,
  normalizeCursorCliModelIdentity,
  getAvailableCursorCliModels,
  resolveCursorCliModelRows
} from '../../src/main/services/cursor-cli-models'

describe('cursor-cli-models', () => {
  it('defaults to auto for Octob model identity', () => {
    expect(CURSOR_CLI_DEFAULT_MODEL_ID).toBe('auto')
  })

  it('maps legacy cursor-default to auto', () => {
    expect(normalizeCursorCliModelIdentity('cursor-default')).toBe('auto')
    expect(normalizeCursorCliModelIdentity(' opus-4.6-thinking ')).toBe('opus-4.6-thinking')
    expect(normalizeCursorCliModelIdentity('')).toBe(null)
    expect(normalizeCursorCliModelIdentity(undefined)).toBe(null)
  })

  it('ships a substantive static catalog', () => {
    expect(CURSOR_CLI_STATIC_MODEL_ROWS.length).toBeGreaterThan(5)
    expect(CURSOR_CLI_STATIC_MODEL_ROWS.some((r) => r.id === 'auto')).toBe(true)
    expect(CURSOR_CLI_STATIC_MODEL_ROWS.some((r) => r.id === 'composer-2')).toBe(true)
  })

  it('matches Codex-style IPC shape (providers array entries with variants)', () => {
    const payload = getAvailableCursorCliModels()
    expect(Array.isArray(payload)).toBe(true)
    expect(payload).toHaveLength(1)
    const [provider] = payload
    expect(provider.id).toBe('cursor-cli')
    expect(provider.models['auto']).toEqual(
      expect.objectContaining({
        id: 'auto',
        name: 'Auto',
        limit: { context: expect.any(Number), output: expect.any(Number) },
        variants: expect.objectContaining({ high: {}, medium: {}, low: {} })
      })
    )
    expect(Object.keys(provider.models['auto'].variants ?? {})).toEqual(
      expect.arrayContaining(['xhigh', 'high', 'medium', 'low'])
    )
  })

  it('resolveCursorCliModelRows returns sorted ui list with auto first', () => {
    const rows = resolveCursorCliModelRows(null)
    expect(rows[0]?.id).toBe('auto')
    expect(rows.length).toBe(CURSOR_CLI_STATIC_MODEL_ROWS.length)
  })
})
