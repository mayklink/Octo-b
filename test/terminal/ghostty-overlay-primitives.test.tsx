import { useState } from 'react'
import { beforeEach, describe, expect, test } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '../../src/renderer/src/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '../../src/renderer/src/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../src/renderer/src/components/ui/dropdown-menu'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '../../src/renderer/src/components/ui/context-menu'
import { useLayoutStore } from '../../src/renderer/src/stores/useLayoutStore'

function NestedDialogPopoverHarness(): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(true)
  const [popoverOpen, setPopoverOpen] = useState(false)

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent>
        <DialogTitle>Overlay test dialog</DialogTitle>
        <DialogDescription>Verifies nested overlay suppression.</DialogDescription>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button>Toggle popover</button>
          </PopoverTrigger>
          <PopoverContent>
            <button onClick={() => setPopoverOpen(false)}>Close popover</button>
          </PopoverContent>
        </Popover>
        <button onClick={() => setDialogOpen(false)}>Dismiss dialog</button>
      </DialogContent>
    </Dialog>
  )
}

function MenuHarness(): React.JSX.Element {
  return (
    <div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button>Open dropdown</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Dropdown action</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div data-testid="context-menu-target">Context target</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Context action</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}

describe('Ghostty overlay suppression primitives', () => {
  beforeEach(() => {
    useLayoutStore.setState({ ghosttyOverlaySuppressed: false })
  })

  test('keeps suppression active until the last nested overlay closes', async () => {
    const user = userEvent.setup()
    render(<NestedDialogPopoverHarness />)

    await waitFor(() => {
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: 'Toggle popover' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Close popover' })).toBeInTheDocument()
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: 'Close popover' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Close popover' })).not.toBeInTheDocument()
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(true)
    })

    await user.click(screen.getByRole('button', { name: 'Dismiss dialog' }))

    await waitFor(() => {
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(false)
    })
  })

  test('suppresses Ghostty for dropdown menus and context menus while they are open', async () => {
    const user = userEvent.setup()
    render(<MenuHarness />)

    await user.click(screen.getByRole('button', { name: 'Open dropdown' }))

    await waitFor(() => {
      expect(screen.getByText('Dropdown action')).toBeInTheDocument()
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(true)
    })

    await user.click(screen.getByText('Dropdown action'))

    await waitFor(() => {
      expect(screen.queryByText('Dropdown action')).not.toBeInTheDocument()
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(false)
    })

    fireEvent.contextMenu(screen.getByTestId('context-menu-target'))

    await waitFor(() => {
      expect(screen.getByText('Context action')).toBeInTheDocument()
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(true)
    })

    await user.click(screen.getByText('Context action'))

    await waitFor(() => {
      expect(screen.queryByText('Context action')).not.toBeInTheDocument()
      expect(useLayoutStore.getState().ghosttyOverlaySuppressed).toBe(false)
    })
  })
})
