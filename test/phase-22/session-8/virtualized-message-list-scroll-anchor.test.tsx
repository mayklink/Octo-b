import { createRef } from 'react'
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'

const mockVirtualizer: {
  measureElement: ReturnType<typeof vi.fn>
  measurementsCache: Array<{
    key: string
    index: number
    start: number
    end: number
    size: number
    lane: number
  }>
  shouldAdjustScrollPositionOnItemSizeChange:
    | undefined
    | ((item: unknown, delta: number, instance: unknown) => boolean)
  getTotalSize: ReturnType<typeof vi.fn>
  getVirtualItems: ReturnType<typeof vi.fn>
  getVirtualItemForOffset: ReturnType<typeof vi.fn>
  scrollToIndex: ReturnType<typeof vi.fn>
} = {
  measureElement: vi.fn(),
  measurementsCache: [],
  shouldAdjustScrollPositionOnItemSizeChange: undefined,
  getTotalSize: vi.fn(() => 0),
  getVirtualItems: vi.fn(() => []),
  getVirtualItemForOffset: vi.fn(() => undefined),
  scrollToIndex: vi.fn()
}

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: vi.fn(() => mockVirtualizer)
}))

import {
  VirtualizedMessageList,
  type VirtualizedMessageListHandle
} from '../../../src/renderer/src/components/sessions/VirtualizedMessageList'

function createScrollElement(): HTMLDivElement {
  const element = document.createElement('div')
  let scrollTop = 0
  let scrollHeight = 600
  let clientHeight = 240

  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value
    }
  })
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
    set: (value: number) => {
      scrollHeight = value
    }
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
    set: (value: number) => {
      clientHeight = value
    }
  })

  return element
}

describe('VirtualizedMessageList scroll anchoring', () => {
  beforeEach(() => {
    mockVirtualizer.measureElement.mockReset()
    mockVirtualizer.getTotalSize.mockReset()
    mockVirtualizer.getVirtualItems.mockReset()
    mockVirtualizer.getVirtualItemForOffset.mockReset()
    mockVirtualizer.scrollToIndex.mockReset()
    mockVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = undefined
    mockVirtualizer.measurementsCache = [
      { key: 'message:user-1', index: 0, start: 0, end: 120, size: 120, lane: 0 },
      { key: 'message:assistant-1', index: 1, start: 120, end: 260, size: 140, lane: 0 }
    ]
    mockVirtualizer.getTotalSize.mockReturnValue(260)
    mockVirtualizer.getVirtualItems.mockImplementation(() => mockVirtualizer.measurementsCache)
    mockVirtualizer.getVirtualItemForOffset.mockImplementation((offset: number) =>
      mockVirtualizer.measurementsCache.find((item) => item.start <= offset && item.end > offset)
    )
  })

  test('captures and restores the viewport anchor using stable item keys', () => {
    const scrollElement = createScrollElement()
    scrollElement.scrollTop = 150

    const ref = createRef<VirtualizedMessageListHandle>()

    render(
      <VirtualizedMessageList
        ref={ref}
        messages={[
          {
            id: 'user-1',
            role: 'user',
            content: 'Question',
            timestamp: '2026-03-14T10:00:00.000Z'
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Answer',
            timestamp: '2026-03-14T10:00:01.000Z'
          }
        ]}
        streamingMessage={null}
        isStreaming={true}
        isSending={false}
        isCompacting={false}
        cwd={null}
        onForkAssistantMessage={() => {}}
        forkingMessageId={null}
        revertMessageID={null}
        revertedUserCount={0}
        onRedoRevert={() => {}}
        sessionErrorMessage={null}
        sessionErrorStderr={null}
        sessionRetry={null}
        retrySecondsRemaining={null}
        hasVisibleWritingCursor={false}
        queuedMessages={[]}
        completionEntry={null}
        scrollElement={scrollElement}
        lockViewport={true}
      />
    )

    const anchor = ref.current?.captureViewportAnchor()
    expect(anchor).toEqual({
      itemKey: 'message:assistant-1',
      offsetWithinItem: 30,
      fallbackScrollTop: 150,
      fallbackScrollHeight: 600
    })

    mockVirtualizer.measurementsCache = [
      { key: 'message:user-1', index: 0, start: 0, end: 180, size: 180, lane: 0 },
      { key: 'message:assistant-1', index: 1, start: 180, end: 340, size: 160, lane: 0 }
    ]
    scrollElement.scrollTop = 0
    scrollElement.scrollHeight = 760

    expect(ref.current?.restoreViewportAnchor(anchor!)).toBe(true)
    expect(scrollElement.scrollTop).toBe(210)
  })

  test('disables virtualizer resize corrections while the viewport is locked', () => {
    const scrollElement = createScrollElement()
    mockVirtualizer.measurementsCache = [
      { key: 'message:assistant-1', index: 0, start: 0, end: 140, size: 140, lane: 0 }
    ]
    mockVirtualizer.getTotalSize.mockReturnValue(140)

    render(
      <VirtualizedMessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Answer',
            timestamp: '2026-03-14T10:00:01.000Z'
          }
        ]}
        streamingMessage={null}
        isStreaming={true}
        isSending={false}
        isCompacting={false}
        cwd={null}
        onForkAssistantMessage={() => {}}
        forkingMessageId={null}
        revertMessageID={null}
        revertedUserCount={0}
        onRedoRevert={() => {}}
        sessionErrorMessage={null}
        sessionErrorStderr={null}
        sessionRetry={null}
        retrySecondsRemaining={null}
        hasVisibleWritingCursor={false}
        queuedMessages={[]}
        completionEntry={null}
        scrollElement={scrollElement}
        lockViewport={true}
      />
    )

    expect(mockVirtualizer.shouldAdjustScrollPositionOnItemSizeChange).toBeTypeOf('function')
    expect(
      mockVirtualizer.shouldAdjustScrollPositionOnItemSizeChange?.(
        mockVirtualizer.measurementsCache[0],
        24,
        mockVirtualizer
      )
    ).toBe(false)
  })
})
