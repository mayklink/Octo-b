# Octob - Phase 6 Product Requirements Document

## Overview

**Phase 6** focuses on **enhanced message rendering, context awareness, notifications, queued messages, image attachments, slash commands, UX improvements, and session state persistence**. The primary work includes rendering subagent flows and tool calls with rich UI, displaying a context usage indicator, sending native notifications on session completion, allowing queued follow-up messages, attaching images to prompts, slash command support, a project-level worktree creation button, persisting selected tabs across sessions, and adding per-tab loading/unread badges.

### Phase 6 Goals
- Render subagent (Task tool) spawned flows inline with expandable detail
- Render known tool calls (Read, Edit, Grep, Glob, Bash, Write) with rich UI; render unknown tools with a TODO fallback showing raw data
- Display a context usage progress bar that reflects token usage vs model context limit
- Show native OS notifications when a session completes while the app is not focused
- Allow sending follow-up messages while the agent is busy (queued via OpenCode SDK)
- Support attaching images/files to messages via attachment button or clipboard paste
- Add slash command popover triggered by "/" in the chat input
- Add a "+" button next to each project for quick worktree creation; remove 3-dot button (keep right-click context menu)
- Persist the selected tab per worktree across project switches and app restarts
- Show loading spinner and unread dot badges on individual session tabs

---

## Technical Additions

| Component | Technology |
|-----------|------------|
| Subagent Rendering | React expandable components, OpenCode `SubtaskPart` / `StepStartPart` / `StepFinishPart` types |
| Tool Call Rendering | Per-tool React components with syntax highlighting (Read, Edit, Grep, Bash, etc.) |
| Context Indicator | OpenCode SDK `Model.limit.context` + `AssistantMessage.tokens`, Tooltip + progress bar |
| Native Notifications | Electron `Notification` API + `BrowserWindow` focus tracking |
| Queued Messages | OpenCode SDK `session.promptAsync()` (non-blocking, supports sending while busy) |
| Image Attachments | OpenCode SDK `FilePartInput` + clipboard paste handler + file picker |
| Slash Commands | OpenCode SDK `command.list()` + cmdk-style popover |
| Tab Persistence | Zustand `persist` middleware with localStorage |
| Session Tab Badges | `useWorktreeStatusStore` per-session status on tab headers |

---

## Features

### 1. Enhanced Task & Tool Rendering

#### 1.1 Current State
- Tool calls are rendered via `ToolCard.tsx` with basic icons (FileText, Terminal, Pencil, etc.), a status indicator, and a collapsible output area showing first 10 lines
- Subagent spawns (Task tool / subtask parts) are not rendered — child session events are routed to the parent session via `resolveParentSession()` in `opencode-service.ts` but the UI ignores `subtask`, `step-start`, and `step-finish` part types
- The `mapStoredPartsToStreamingParts()` function in `SessionView.tsx` only handles `text`, `tool_use`, and `tool` part types — all others are silently dropped

#### 1.2 New Design — Subagent Rendering

**SubtaskCard Component**: When a `subtask` part is received, render an expandable card showing:
- Agent name and description
- Prompt text (collapsed by default)
- Nested message stream from the child session (expanded on tap)
- Status indicator (running spinner / completed checkmark / error)

```
┌─ 🤖 Explore Agent ──────────────────────────┐
│  "Search for authentication patterns"         │
│  ▸ Tap to expand subagent messages            │
│                                    ⟳ Running  │
└───────────────────────────────────────────────┘

Expanded:
┌─ 🤖 Explore Agent ──────────────────────────┐
│  "Search for authentication patterns"         │
│  ▾ Subagent messages:                         │
│  ┌─────────────────────────────────────────┐  │
│  │ 🔍 Grep: "auth" in src/               │  │
│  │ 📄 Read: src/auth/login.ts             │  │
│  │ Found 3 authentication patterns...      │  │
│  └─────────────────────────────────────────┘  │
│                                    ✅ Done    │
└───────────────────────────────────────────────┘
```

**Implementation**: The OpenCode SDK emits child session events with `parentID`. The main process already routes these to the parent Octob session. The renderer needs to:
1. Recognize `subtask` parts in the streaming pipeline
2. Map child session messages to the subtask part by matching `sessionID`
3. Accumulate child messages/parts inline under the subtask card
4. `step-start` and `step-finish` parts bracket agent steps — use them to show step boundaries and token usage

#### 1.3 New Design — Rich Tool Call Rendering

Upgrade `ToolCard.tsx` to render **tool-specific detail views** for known tools:

| Tool | Rendering |
|------|-----------|
| `Read` / `read_file` | Show file path with syntax-highlighted preview of content (first 20 lines). Show line range if specified. |
| `Edit` / `edit_file` | Show file path + inline diff view (old → new) with red/green highlighting |
| `Write` / `write_file` | Show file path + syntax-highlighted content preview |
| `Grep` / `grep` | Show pattern + path + matched results with line numbers and highlighted matches |
| `Glob` / `glob` | Show pattern + list of matched files |
| `Bash` / `bash` | Show command in a terminal-styled block + output with ANSI color support |
| `WebSearch` | Show query + list of result links |
| `WebFetch` | Show URL + summary of fetched content |
| Unknown tools | **TODO Component** — render tool name, raw input JSON, raw output, with a `// TODO: implement custom rendering` label |

```
Known tool (Read):
┌─ 📄 Read: src/main/index.ts (lines 1-50) ───┐
│  1 │ import { app, BrowserWindow } from ...   │
│  2 │ import { join } from 'path'              │
│  3 │ ...                                      │
│                              [Show all 50 lines]│
└───────────────────────────────────────────────┘

Known tool (Edit):
┌─ ✏️ Edit: src/renderer/src/App.tsx ───────────┐
│  - import { OldComponent } from './old'       │
│  + import { NewComponent } from './new'       │
│                                               │
│  Line 42:                                     │
│  - <OldComponent />                           │
│  + <NewComponent prop="value" />              │
└───────────────────────────────────────────────┘

Unknown tool (TODO):
┌─ ❓ mcp__custom_tool ─────────── TODO ────────┐
│  Input:                                        │
│  { "query": "SELECT * FROM users" }           │
│  Output:                                       │
│  "Found 42 records..."                        │
│  ⚠ No custom renderer — raw data shown        │
└───────────────────────────────────────────────┘
```

#### 1.4 Implementation Details

**Part type handling additions** in `mapStoredPartsToStreamingParts()`:
- `subtask` → `{ type: 'subtask', subtask: { agent, prompt, description, sessionID } }`
- `step-start` → `{ type: 'step_start', stepStart: { snapshot } }`
- `step-finish` → `{ type: 'step_finish', stepFinish: { reason, cost, tokens } }`
- `reasoning` → `{ type: 'reasoning', text }` (render as collapsible thinking block)
- `compaction` → `{ type: 'compaction', auto }` (render as info pill "Context compacted")

**StreamingPart type extension**:
```typescript
export interface StreamingPart {
  type: 'text' | 'tool_use' | 'subtask' | 'step_start' | 'step_finish' | 'reasoning' | 'compaction'
  text?: string
  toolUse?: ToolUseInfo
  subtask?: SubtaskInfo
  stepStart?: { snapshot?: string }
  stepFinish?: { reason: string; cost: number; tokens: TokenInfo }
  reasoning?: string
  auto?: boolean  // for compaction
}
```

#### 1.5 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/ToolCard.tsx` | Refactor into tool-specific renderers; add rich rendering for Read, Edit, Grep, Glob, Bash, Write, WebSearch, WebFetch |
| `src/renderer/src/components/sessions/tools/ReadToolView.tsx` | **NEW** — Syntax-highlighted file preview |
| `src/renderer/src/components/sessions/tools/EditToolView.tsx` | **NEW** — Inline diff view |
| `src/renderer/src/components/sessions/tools/GrepToolView.tsx` | **NEW** — Pattern match results with highlighting |
| `src/renderer/src/components/sessions/tools/BashToolView.tsx` | **NEW** — Terminal-styled command + output |
| `src/renderer/src/components/sessions/tools/TodoToolView.tsx` | **NEW** — Fallback for unknown tools with raw data |
| `src/renderer/src/components/sessions/SubtaskCard.tsx` | **NEW** — Expandable subagent card with nested messages |
| `src/renderer/src/components/sessions/ReasoningBlock.tsx` | **NEW** — Collapsible thinking/reasoning block |
| `src/renderer/src/components/sessions/CompactionPill.tsx` | **NEW** — Info pill for context compaction events |
| `src/renderer/src/components/sessions/AssistantCanvas.tsx` | Handle new part types (subtask, step_start, step_finish, reasoning, compaction) |
| `src/renderer/src/components/sessions/SessionView.tsx` | Extend `mapStoredPartsToStreamingParts()` and streaming handler for new part types |

---

### 2. Context Indicator

#### 2.1 Current State
There is no context usage indicator. The `AssistantMessage` type in the OpenCode SDK provides `tokens: { input, output, reasoning, cache: { read, write } }` per message. The `Model` type provides `limit: { context, output }`. Neither is surfaced in the UI.

#### 2.2 New Design

Display a **context usage progress bar** in the input area, between the model selector and the send button. The bar fills based on cumulative token usage relative to the selected model's context limit.

```
Input Area:
┌──────────────────────────────────────────────────────┐
│  [Build / Plan]                                       │
│  Type your message...                                 │
│                                                       │
│  [Claude Sonnet]  ████████░░░░░░░  62%  [↵]          │
│                   ─── Context ───                     │
└──────────────────────────────────────────────────────┘

Tooltip on hover:
┌──────────────────────────────┐
│  Context Usage               │
│  124,800 / 200,000 tokens    │
│  Input: 98,200               │
│  Output: 18,400              │
│  Cache read: 6,200           │
│  Cache write: 2,000          │
└──────────────────────────────┘
```

#### 2.3 Implementation

**Token Tracking**:
1. On `message.updated` events with `role: 'assistant'`, extract `tokens` from the message info
2. Accumulate total tokens across all messages in the session: `totalTokens = sum(input + output + reasoning)` for each assistant message
3. Cache read tokens count towards context but are cheaper — include them in the usage calculation
4. Formula: `contextUsed = sum(msg.tokens.input + msg.tokens.output + msg.tokens.reasoning)` across all assistant messages in the session

**Model Context Limit**:
1. On session connect, fetch the model list via `window.opencodeOps.models()`
2. The current model's `limit.context` gives the max context window
3. Store in a new `useContextStore` or extend the session store

**Progress Bar**:
- Color coding: green (0-60%), yellow (60-80%), orange (80-90%), red (90-100%)
- When context is >90%, show a warning tooltip suggesting compaction

#### 2.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/ContextIndicator.tsx` | **NEW** — Progress bar with tooltip showing token breakdown |
| `src/renderer/src/stores/useContextStore.ts` | **NEW** — Track cumulative tokens per session, model context limits |
| `src/renderer/src/components/sessions/SessionView.tsx` | Extract token info from `message.updated` events, update context store; render ContextIndicator in input area |
| `src/main/services/opencode-service.ts` | Forward token info from `message.updated` events (already done via event forwarding) |
| `src/main/ipc/opencode-handlers.ts` | Add `opencode:modelInfo` handler to get model details including context limit |
| `src/preload/index.ts` | Expose `modelInfo` method on `window.opencodeOps` |

---

### 3. Notification on Session End

#### 3.1 Current State
No native OS notifications. The app uses `sonner` for in-app toasts only. The main process does not track window focus state.

#### 3.2 New Design

When a session finishes (`session.idle` event) and the app window is **not focused**, show a native macOS notification with:
- Title: project name
- Body: session name or "Session completed"
- Clicking the notification brings the app to focus and navigates to that session

```
┌──────────────────────────────────────────┐
│  🐝 Octob                                │
│  my-project                              │
│  "Implement auth feature" completed      │
└──────────────────────────────────────────┘
```

#### 3.3 Implementation

**Main Process**:
1. Track window focus state via `mainWindow.on('focus')` / `mainWindow.on('blur')`
2. On `session.idle` event (already handled in `opencode-service.ts`), check if window is focused
3. If not focused, create an Electron `Notification` with project name + session name
4. On notification click, call `mainWindow.show()` + `mainWindow.focus()` and send IPC event to renderer to navigate to the session

**Renderer**:
1. Listen for `notification:navigate` IPC event
2. Set the active project, worktree, and session to match the completed session

#### 3.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/main/index.ts` | Track window focus state (`isFocused` flag), expose to services |
| `src/main/services/opencode-service.ts` | On `session.idle`, check focus state, send notification if not focused |
| `src/main/services/notification-service.ts` | **NEW** — Create and manage native Electron notifications, handle click navigation |
| `src/preload/index.ts` | Expose `onNotificationNavigate` listener on `window.systemOps` |
| `src/renderer/src/hooks/useNotificationNavigation.ts` | **NEW** — Hook to listen for notification clicks and navigate to the target session |
| `src/renderer/src/components/layout/AppLayout.tsx` | Mount `useNotificationNavigation` hook |

---

### 4. Follow-up / Queued Messages

#### 4.1 Current State
The send button is disabled while `isSending` is true. Users cannot queue messages while the agent is processing. The OpenCode SDK's `promptAsync()` is non-blocking and supports sending messages while the session is busy — the SDK queues them automatically.

#### 4.2 New Design

Allow users to type and send messages while the agent is running. Messages sent during an active response are queued and sent after the current turn completes.

```
While agent is running:
┌──────────────────────────────────────────────────────┐
│  [Build / Plan]                                       │
│  also fix the import paths                            │
│                                                       │
│  [Claude Sonnet]  ████░░░░░░░  32%   [Queue ↵]       │
│                                                       │
│  ┌─ Queued (1) ───────────────────────────┐           │
│  │  "also fix the import paths"           │           │
│  └────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- When `isSending` is true, the send button label changes to "Queue" (or shows a queue icon)
- Submitted messages are saved to DB as user messages and displayed in the chat immediately
- The message is sent to OpenCode via `promptAsync()` which handles queuing natively
- A small "Queued (N)" indicator shows how many messages are waiting
- When the agent finishes the current turn, it picks up queued messages automatically

#### 4.3 Implementation

1. Remove the `disabled={isSending}` guard on the textarea and send button
2. When sending while `isStreaming`:
   - Save user message to DB and display it
   - Call `promptAsync()` — the SDK handles queuing
   - Track queued count in local state
3. The send button shows "Queue" icon when streaming is active
4. Queued messages are visually displayed as user messages in the chat immediately (they already appear since we save + display them)

#### 4.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/SessionView.tsx` | Remove `isSending` guard on input, allow sending during streaming, track queued message count, change button label |
| `src/renderer/src/components/sessions/QueuedIndicator.tsx` | **NEW** — Small badge showing queued message count |

---

### 5. Image & File Attachments

#### 5.1 Current State
The input area is plain text only. No attachment support. The OpenCode SDK supports `FilePartInput: { type: 'file', mime, filename?, url }` as part of message body alongside text parts. The `Model` type has `capabilities.input.image` to check if the model supports image input.

#### 5.2 New Design

Add image/file attachment support with two input methods:
1. **Attachment button** (📎) — opens a file picker dialog for images
2. **Clipboard paste** — `Cmd+V` with an image in clipboard attaches it

```
Input Area with attachments:
┌──────────────────────────────────────────────────────┐
│  [Build / Plan]                                       │
│  ┌──────┐  ┌──────┐                                  │
│  │ 🖼️   │  │ 🖼️   │                                  │
│  │ ss.png│  │ ui.jpg│                                  │
│  │  [✕]  │  │  [✕]  │                                  │
│  └──────┘  └──────┘                                  │
│  What's wrong with this layout?                       │
│                                                       │
│  [Claude Sonnet]  📎  Enter to send   [↵]             │
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- Clicking 📎 opens a native file dialog (images: png, jpg, gif, webp, svg; also pdf)
- Pasting from clipboard with an image adds it as an attachment
- Attachments appear as thumbnails above the text input with a remove (✕) button
- On send, images are converted to `data:` URLs or `file://` URLs and sent as `FilePartInput` parts
- If the current model doesn't support image input, show a warning tooltip on the attachment button

#### 5.3 Implementation

**Renderer**:
1. Add attachment state: `attachments: Array<{ file: File, preview: string, mime: string }>`
2. Add clipboard paste handler on the textarea: `onPaste` checks for image data
3. Add 📎 button that opens `window.fileOps.openDialog()` or native file input
4. On send, convert attachments to `FilePartInput` objects and include in the `parts` array
5. For clipboard images, use `FileReader` to get a data URL

**Main Process / Preload**:
1. Add IPC handler for file dialog (if not already available via `window.fileOps`)
2. The prompt method needs to accept `parts` array instead of just a string message
3. Update `opencode-service.ts` `prompt()` to accept `parts: Array<TextPartInput | FilePartInput>`

#### 5.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/SessionView.tsx` | Add attachment state, paste handler, modify send to include file parts |
| `src/renderer/src/components/sessions/AttachmentPreview.tsx` | **NEW** — Thumbnail grid with remove buttons |
| `src/renderer/src/components/sessions/AttachmentButton.tsx` | **NEW** — 📎 button with file dialog trigger |
| `src/main/services/opencode-service.ts` | Update `prompt()` to accept `parts` array instead of just `message` string |
| `src/main/ipc/opencode-handlers.ts` | Update `opencode:prompt` handler to pass parts |
| `src/preload/index.ts` | Update `prompt` method signature in `window.opencodeOps` |
| `src/preload/index.d.ts` | Update type declarations for prompt with parts support |

---

### 6. Slash Commands

#### 6.1 Current State
No slash command support. The OpenCode SDK provides `command.list()` returning `Array<Command>` where `Command = { name, description?, agent?, model?, template, subtask? }`.

#### 6.2 New Design

When the user types "/" as the first character in an empty input, show a popover with available slash commands. Typing further filters the list with fuzzy matching (e.g., "/super" matches "/using-superpowers").

```
Slash command popover:
┌──────────────────────────────────────────────────────┐
│  /comp                                                │
│                                                       │
│  ┌────────────────────────────────────────────────┐   │
│  │ /compact      Compact session context          │   │
│  │ /compaction   Trigger auto-compaction          │   │
│  └────────────────────────────────────────────────┘   │
│                                                       │
│  [Claude Sonnet]  Enter to send   [↵]                 │
└──────────────────────────────────────────────────────┘
```

**Behavior**:
- Popover appears when "/" is the first character in the input
- Arrow keys navigate the list, Enter selects a command
- Selecting a command replaces the input with the command template or sends it directly
- Escape or clicking outside closes the popover
- Commands are fetched once on session connect and cached
- Fuzzy filtering: "/super" matches "/using-superpowers" because it contains "super"

#### 6.3 Implementation

1. Fetch commands via new IPC handler `opencode:commands` → `command.list()`
2. On input change, check if value starts with "/"
3. Show popover with filtered commands (substring match on name)
4. Use `cmdk`-style keyboard navigation (already a dependency for command palette)
5. On selection, either:
   - Insert command template into input for user to edit
   - Or send the command directly if it's a simple command

#### 6.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/SlashCommandPopover.tsx` | **NEW** — Popover with filtered command list, keyboard navigation |
| `src/renderer/src/components/sessions/SessionView.tsx` | Add slash command detection on input, show/hide popover, handle selection |
| `src/main/services/opencode-service.ts` | Add `listCommands()` method using SDK `command.list()` |
| `src/main/ipc/opencode-handlers.ts` | Add `opencode:commands` IPC handler |
| `src/preload/index.ts` | Expose `commands` method on `window.opencodeOps` |
| `src/preload/index.d.ts` | Add type for Command and commands method |

---

### 7. Project-Level "+" Button for Worktree Creation

#### 7.1 Current State
Each project in the sidebar shows a 3-dot (MoreHorizontal) button on hover. The context menu has: Edit Name, Open in Finder, Copy Path, Refresh Language, Project Settings, Remove from Octob. Worktree creation is done via a "New Worktree" button inside the WorktreeList component.

#### 7.2 New Design

- **Remove** the 3-dot (MoreHorizontal) button from the project item hover state
- **Add** a "+" button on the project item that creates a new worktree directly
- **Keep** the right-click context menu with all existing options (unchanged)

```
Before:                           After:
┌──────────────────────────┐     ┌──────────────────────────┐
│ 📦 my-project     [···]  │     │ 📦 my-project       [+]  │
│   ⎇ feature-auth         │     │   ⎇ feature-auth         │
│   ⎇ bugfix-login         │     │   ⎇ bugfix-login         │
│   + New Worktree          │     └──────────────────────────┘
└──────────────────────────┘
```

- The "+" button calls `createWorktree(projectId, projectPath, projectName)` directly
- Remove the "New Worktree" button from `WorktreeList.tsx` (creation is now at project level)
- Right-clicking a project still shows the full context menu

#### 7.3 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/projects/ProjectItem.tsx` | Replace MoreHorizontal button with Plus button that creates a worktree; keep ContextMenu on right-click |
| `src/renderer/src/components/worktrees/WorktreeList.tsx` | Remove "New Worktree" button (moved to project level) |

---

### 8. Persist Selected Tab

#### 8.1 Current State
The `useSessionStore` tracks `activeSessionId` and `activeWorktreeId` in memory. When switching between projects/worktrees and returning, the active session resets. The `useLayoutStore` already uses Zustand `persist` middleware with localStorage, but it only persists sidebar widths.

#### 8.2 New Design

Persist the selected tab (active session) per worktree, so that:
1. Switching between worktrees remembers which session tab was last active in each
2. Closing and reopening the app restores the last active session per worktree

**Storage**: Use localStorage via the existing Zustand `persist` pattern. Store a map of `worktreeId → sessionId`.

#### 8.3 Implementation

1. Add `activeSessionByWorktree: Record<string, string>` to the session store
2. When `setActiveSession(sessionId)` is called, also persist the mapping for the current worktree
3. When switching to a worktree, restore the last active session from the persisted map
4. Use Zustand `persist` middleware on the session store for this specific field
5. On app start, the restored active session is used when navigating to a worktree

#### 8.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/stores/useSessionStore.ts` | Add `activeSessionByWorktree` map, persist it with `zustand/middleware/persist`, restore on worktree switch |

---

### 9. Loading / Unread Badge on Session Tabs

#### 9.1 Current State
`useWorktreeStatusStore` tracks per-session status (`working` / `unread` / `null`). The worktree item in the sidebar shows a badge based on aggregate status. Individual session tabs in `SessionTabs.tsx` do **not** show any status indicators.

#### 9.2 New Design

Add per-tab status indicators on session tabs:

```
Tab states:
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ⟳ auth-feature  │  │ ● bug-fix       │  │  chat-session   │
│   (working)     │  │   (unread)      │  │   (normal)      │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

- **Working**: Show a small spinning loader icon before the tab name
- **Unread**: Show a small colored dot before the tab name
- **Normal**: No indicator (current behavior)

#### 9.3 Implementation

1. In the `SessionTab` component, subscribe to `useWorktreeStatusStore` for the session's status
2. Render a `Loader2` spinner (h-3 w-3, animate-spin) for `working`
3. Render a colored dot (w-2 h-2, rounded-full, bg-blue-500) for `unread`
4. No icon for `null` status

#### 9.4 Files to Modify/Create

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/SessionTabs.tsx` | Add status indicators (spinner/dot) to `SessionTab` component based on `useWorktreeStatusStore` per-session status |

---

## Files to Modify — Full Summary

### New Files

| File | Purpose |
|------|---------|
| `src/renderer/src/components/sessions/tools/ReadToolView.tsx` | Syntax-highlighted file preview for Read tool |
| `src/renderer/src/components/sessions/tools/EditToolView.tsx` | Inline diff view for Edit tool |
| `src/renderer/src/components/sessions/tools/GrepToolView.tsx` | Pattern match results with highlighting |
| `src/renderer/src/components/sessions/tools/BashToolView.tsx` | Terminal-styled command + output |
| `src/renderer/src/components/sessions/tools/TodoToolView.tsx` | Fallback for unknown tools with raw data |
| `src/renderer/src/components/sessions/SubtaskCard.tsx` | Expandable subagent card with nested messages |
| `src/renderer/src/components/sessions/ReasoningBlock.tsx` | Collapsible reasoning/thinking block |
| `src/renderer/src/components/sessions/CompactionPill.tsx` | Info pill for context compaction events |
| `src/renderer/src/components/sessions/ContextIndicator.tsx` | Context usage progress bar with tooltip |
| `src/renderer/src/stores/useContextStore.ts` | Token tracking and model context limits |
| `src/main/services/notification-service.ts` | Native Electron notification management |
| `src/renderer/src/hooks/useNotificationNavigation.ts` | Notification click → session navigation |
| `src/renderer/src/components/sessions/QueuedIndicator.tsx` | Queued message count badge |
| `src/renderer/src/components/sessions/AttachmentPreview.tsx` | Image/file attachment thumbnails with remove |
| `src/renderer/src/components/sessions/AttachmentButton.tsx` | 📎 button for file picker |
| `src/renderer/src/components/sessions/SlashCommandPopover.tsx` | Slash command popover with filtering |

### Modified Files

| File | Change |
|------|--------|
| `src/renderer/src/components/sessions/ToolCard.tsx` | Route to tool-specific renderers, add TodoToolView fallback |
| `src/renderer/src/components/sessions/AssistantCanvas.tsx` | Handle subtask, step_start, step_finish, reasoning, compaction parts |
| `src/renderer/src/components/sessions/SessionView.tsx` | Extend `mapStoredPartsToStreamingParts()` for new part types; add token tracking, attachment state, paste handler, queued messages, slash command detection; render ContextIndicator, AttachmentPreview, AttachmentButton |
| `src/renderer/src/components/sessions/SessionTabs.tsx` | Add per-tab status badges (spinner/dot) |
| `src/renderer/src/components/projects/ProjectItem.tsx` | Replace 3-dot button with "+" worktree button; keep right-click menu |
| `src/renderer/src/components/worktrees/WorktreeList.tsx` | Remove "New Worktree" button |
| `src/renderer/src/stores/useSessionStore.ts` | Add persisted `activeSessionByWorktree` map for tab persistence |
| `src/main/services/opencode-service.ts` | Add `listCommands()` method; update `prompt()` to accept parts array; integrate notification on session.idle |
| `src/main/ipc/opencode-handlers.ts` | Add `opencode:commands` and `opencode:modelInfo` handlers; update `opencode:prompt` for parts |
| `src/main/index.ts` | Track window focus state; expose to services |
| `src/preload/index.ts` | Expose `commands`, `modelInfo`, updated `prompt` with parts support, `onNotificationNavigate` |
| `src/preload/index.d.ts` | Type declarations for new/updated APIs |
| `src/renderer/src/components/layout/AppLayout.tsx` | Mount notification navigation hook |

---

## Dependencies to Add

```bash
# No new dependencies required — all features use existing packages:
# - React (components)
# - Zustand (state management)
# - Electron Notification API (native, no package needed)
# - lucide-react (icons, already installed)
# - cmdk (popover pattern, already installed)
# - sonner (toasts, already installed)
```

Optional (for syntax highlighting in tool views):
```bash
pnpm add shiki    # Syntax highlighting for Read/Edit/Write tool views
```

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Tool card rendering (known tools) | < 50ms render time |
| Subagent card expand/collapse | < 100ms transition |
| Context indicator update | < 200ms after message.updated event |
| Notification delivery | < 500ms after session.idle when unfocused |
| Queued message send | < 100ms to submit (non-blocking) |
| Image attachment preview | < 200ms after paste or file selection |
| Slash command popover | < 100ms after typing "/" |
| Tab persistence restore | < 50ms on worktree switch |
| Session tab badge update | < 100ms after status change |

---

## Out of Scope (Phase 6)

- Video or audio file attachments (images and PDFs only)
- Inline image rendering in assistant responses
- Slash command argument editing/templating UI
- Multi-file diff viewer for Edit tool
- Streaming syntax highlighting (highlight after tool completes)
- Notification sound customization
- Notification preferences/settings UI (always notify when unfocused)
- Drag-and-drop file attachment (clipboard paste and button only)
- Context compaction trigger from the UI (show indicator only)
- Subagent message editing or interaction (read-only nested view)

---

## Implementation Priority

### Sprint 1: Session Tab Badges & Tab Persistence
1. Add per-tab status indicators in `SessionTabs.tsx` (spinner for working, dot for unread)
2. Add `activeSessionByWorktree` persisted map to `useSessionStore`
3. Restore active session on worktree switch
4. Test tab persistence across project switches and app restart

### Sprint 2: Queued Messages & "+" Button
1. Remove `isSending` guard from textarea/send button
2. Track queued message count, update send button label
3. Build `QueuedIndicator` component
4. Replace 3-dot button with "+" worktree button on `ProjectItem`
5. Remove "New Worktree" button from `WorktreeList`

### Sprint 3: Context Indicator
1. Create `useContextStore` for token tracking and model limits
2. Extract tokens from `message.updated` events in `SessionView`
3. Add `opencode:modelInfo` IPC handler for model context limits
4. Build `ContextIndicator` progress bar with color-coded fill and tooltip

### Sprint 4: Notifications
1. Add focus tracking to main process (`mainWindow.on('focus'/'blur')`)
2. Create `notification-service.ts` with Electron `Notification` API
3. Integrate with `session.idle` events in `opencode-service.ts`
4. Build `useNotificationNavigation` hook for click-to-navigate
5. Test notification flow end-to-end

### Sprint 5: Image Attachments & Slash Commands
1. Update `prompt()` signature to accept parts array (main + preload + IPC)
2. Build `AttachmentButton` and `AttachmentPreview` components
3. Add clipboard paste handler for images
4. Add `opencode:commands` IPC handler
5. Build `SlashCommandPopover` with fuzzy filtering
6. Wire "/" detection in input to show/hide popover

### Sprint 6: Enhanced Tool Rendering
1. Create tool-specific view components (ReadToolView, EditToolView, GrepToolView, BashToolView)
2. Create `TodoToolView` fallback for unknown tools
3. Refactor `ToolCard` to route to specific renderers
4. Optionally add `shiki` for syntax highlighting

### Sprint 7: Subagent & Part Type Rendering
1. Extend `StreamingPart` type for subtask, step_start, step_finish, reasoning, compaction
2. Update `mapStoredPartsToStreamingParts()` for new part types
3. Build `SubtaskCard` with expandable nested message view
4. Build `ReasoningBlock` (collapsible thinking)
5. Build `CompactionPill` info indicator
6. Update `AssistantCanvas` to render all new part types
7. Test with real subagent-spawning sessions

---

## Success Metrics

- Subagent spawned sessions render inline with expandable nested messages
- Known tool calls (Read, Edit, Grep, Bash, Glob, Write) render with rich, tool-specific UI
- Unknown tool calls render with a TODO component showing raw input/output data
- Context usage progress bar accurately reflects token usage vs model limit
- Hovering the context bar shows a tooltip with token breakdown
- Native notification appears when a session completes while the app is unfocused
- Clicking the notification opens the app and navigates to the completed session
- Users can send follow-up messages while the agent is processing
- Images can be attached via the 📎 button or clipboard paste
- Attached images can be removed before sending
- Typing "/" shows a filtered popover of available slash commands
- Each project shows a "+" button for quick worktree creation
- Right-clicking a project still shows the full context menu
- Switching worktrees remembers the last active session tab
- App restart restores the last active session tab per worktree
- Individual session tabs show spinner (working) or dot (unread) badges
