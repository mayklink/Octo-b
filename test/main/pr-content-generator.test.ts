// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn()
}))

vi.mock('../../src/main/services/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })
}))

vi.mock('../../src/main/services/text-generation-router', () => ({
  generateText: mockGenerateText
}))

describe('pr-content-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerateText.mockResolvedValue(
      '{"title":"Refine PR flow","body":"## Summary\\n- Added cwd propagation\\n## Testing\\n- Not run"}'
    )
  })

  it('passes cwd through to generateText', async () => {
    const { generatePRContent, PR_CONTENT_JSON_SCHEMA } = await import(
      '../../src/main/services/pr-content-generator'
    )

    await generatePRContent({
      baseBranch: 'main',
      headBranch: 'feature/pr-content',
      commitSummary: 'abc123 Add cwd propagation',
      diffSummary: ' 1 file changed, 3 insertions(+)',
      diffPatch: 'diff --git a/file b/file',
      provider: 'codex',
      cwd: '/tmp/worktree'
    })

    expect(mockGenerateText).toHaveBeenCalledOnce()
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'codex',
      {
        cwd: '/tmp/worktree',
        outputSchema: PR_CONTENT_JSON_SCHEMA
      }
    )
  })
})
