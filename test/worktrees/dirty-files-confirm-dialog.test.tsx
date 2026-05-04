import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { DirtyFilesConfirmDialog } from '../../src/renderer/src/components/worktrees/DirtyFilesConfirmDialog'

const longPath =
  'docs/superpowers/plans/2026-04-23-replace-ad-library-api-with-play-mode-and-extra-long-file-name-that-would-previously-push-actions-outside-the-dialog.md'

describe('DirtyFilesConfirmDialog', () => {
  test('wraps long file paths without losing access to action buttons', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()

    render(
      <DirtyFilesConfirmDialog
        open
        worktreeName="replace-ad-library-api-with-play-mode-and-a-very-long-worktree-name"
        files={[
          {
            path: longPath,
            additions: 12,
            deletions: 3,
            binary: false
          }
        ]}
        description="has uncommitted changes that won't be included in the merge."
        confirmLabel="Merge Anyway"
        confirmVariant="destructive"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    )

    const dialog = document.querySelector('[data-slot="alert-dialog-content"]')
    expect(dialog).toHaveClass('grid-cols-[minmax(0,1fr)]')

    const path = screen.getByTitle(longPath)
    expect(path).toHaveClass('whitespace-normal')
    expect(path).toHaveClass('[overflow-wrap:anywhere]')
    expect(path).not.toHaveClass('truncate')

    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const confirm = screen.getByRole('button', { name: 'Merge Anyway' })

    expect(cancel).toBeVisible()
    expect(confirm).toBeVisible()

    await user.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
