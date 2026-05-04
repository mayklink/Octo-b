import { describe, expect, it } from 'vitest'

import { normalizeUsage } from '@/stores/useUsageStore'

describe('normalizeUsage', () => {
  it('treats malformed Anthropic usage as unavailable', () => {
    const usage = normalizeUsage(
      'anthropic',
      {
        type: 'error',
        message: 'An unexpected error occurred'
      } as never,
      null
    )

    expect(usage).toBeNull()
  })

  it('treats Anthropic usage with a null quota window as unavailable', () => {
    const usage = normalizeUsage(
      'anthropic',
      {
        five_hour: {
          utilization: 12,
          resets_at: '2026-04-29T18:00:00.000Z'
        },
        seven_day: null
      } as never,
      null
    )

    expect(usage).toBeNull()
  })
})
