import { describe, test, expect, beforeAll } from 'vitest'

/**
 * Session 7: Header Branding — Tests
 *
 * These tests verify:
 * 1. Octob mark (PNG) is used in the header
 * 2. Project name displays when a project is selected
 * 3. Branch name displays in parentheses after the project name
 * 4. Octob fallback when no project selected
 * 5. Default worktree (no-worktree) hides branch name
 * 6. Brand mark component exists
 */

describe('Session 7: Header Branding', () => {
  describe('Header.tsx source verification', () => {
    let source: string

    beforeAll(async () => {
      const fs = await import('fs')
      const path = await import('path')
      source = fs.readFileSync(
        path.resolve(__dirname, '../../../src/renderer/src/components/layout/Header.tsx'),
        'utf-8'
      )
    })

    test('imports useProjectStore', () => {
      expect(source).toContain("import { useProjectStore } from '@/stores/useProjectStore'")
    })

    test('imports useWorktreeStore', () => {
      expect(source).toContain("import { useWorktreeStore } from '@/stores/useWorktreeStore'")
    })

    test('imports OctobMark brand component', () => {
      expect(source).toContain("import { OctobMark } from '@/components/brand/OctobMark'")
    })

    test('renders Octob mark in header', () => {
      expect(source).toContain('<OctobMark')
      expect(source).toContain('className="h-5 w-5 shrink-0"')
    })

    test('shows project name when project selected', () => {
      expect(source).toContain('selectedProject.name')
    })

    test('shows branch name in parentheses with primary color', () => {
      expect(source).toContain('selectedWorktree?.branch_name')
      expect(source).toMatch(/\(\s*\{selectedWorktree\.branch_name\}\s*\)/)
      expect(source).toContain('text-primary')
    })

    test('shows Octob fallback when no project selected', () => {
      expect(source).toContain('data-testid="header-brand-fallback"')
      expect(source).toMatch(/<span[^>]*>\s*Octob\s*<\/span>/)
    })

    test('does not show branch for default worktree (no-worktree)', () => {
      expect(source).toContain("'(no-worktree)'")
    })

    test('no longer has h1 heading in header', () => {
      expect(source).not.toContain('<h1')
    })

    test('uses truncate class for long project/branch names', () => {
      expect(source).toContain('truncate')
    })

    test('uses min-w-0 for flex truncation', () => {
      expect(source).toContain('min-w-0')
    })

    test('uses shrink-0 on logo to prevent shrinking', () => {
      expect(source).toContain('shrink-0')
    })

    test('uses selectedProjectId from useProjectStore', () => {
      expect(source).toContain('selectedProjectId')
      expect(source).toContain('useProjectStore')
    })

    test('looks up selectedWorktree from worktreesByProject', () => {
      expect(source).toContain('worktreesByProject')
      expect(source).toContain('selectedWorktreeId')
    })

    test('has data-testid for header project info', () => {
      expect(source).toContain('data-testid="header-project-info"')
    })
  })

  describe('Octob mark component exists', () => {
    test('OctobMark.tsx exists and uses octob.png', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const p = path.resolve(__dirname, '../../../src/renderer/src/components/brand/OctoBMark.tsx')
      expect(fs.existsSync(p)).toBe(true)
      const source = fs.readFileSync(p, 'utf-8')
      expect(source).toContain('octob.png')
    })
  })

  describe('Type declaration for PNG imports exists', () => {
    test('assets.d.ts declares *.png module', async () => {
      const fs = await import('fs')
      const path = await import('path')
      const dtsPath = path.resolve(__dirname, '../../../src/renderer/src/assets.d.ts')
      expect(fs.existsSync(dtsPath)).toBe(true)
      const content = fs.readFileSync(dtsPath, 'utf-8')
      expect(content).toContain("declare module '*.png'")
    })
  })
})
