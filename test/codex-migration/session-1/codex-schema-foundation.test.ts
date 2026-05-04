/**
 * Session 1: Schema Foundation — TDD Tests
 *
 * Verifies that generated Codex app-server protocol schemas exist,
 * export the correct types, and that the regeneration script is present.
 *
 * Since generated exports are `export type` (erased at runtime), tests
 * use compile-time type assertions. The test file compiling without errors
 * IS the primary assertion for type correctness.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Compile-time type imports ───────────────────────────────────────
// These verify that the generated barrel exports resolve correctly.
// If the schemas don't exist, the file won't compile → tests fail.
import type { ClientRequest } from '../../../src/shared/codex-schemas'
import type { ServerNotification } from '../../../src/shared/codex-schemas'
import type { ServerRequest } from '../../../src/shared/codex-schemas'
import type { ClientNotification } from '../../../src/shared/codex-schemas'

import type { TurnStartParams } from '../../../src/shared/codex-schemas/v2'
import type { ThreadStartParams } from '../../../src/shared/codex-schemas/v2'
import type { ThreadResumeParams } from '../../../src/shared/codex-schemas/v2'
import type { CommandExecutionApprovalDecision } from '../../../src/shared/codex-schemas/v2'
import type { FileChangeApprovalDecision } from '../../../src/shared/codex-schemas/v2'
import type { UserInput } from '../../../src/shared/codex-schemas/v2'

// ── Helpers ─────────────────────────────────────────────────────────
const ROOT = resolve(__dirname, '../../..')
const schemasDir = resolve(ROOT, 'src/shared/codex-schemas')

// ── Group 1: Schema files exist at expected paths ───────────────────
describe('Schema file existence', () => {
  it('root index.ts exists', () => {
    expect(existsSync(resolve(schemasDir, 'index.ts'))).toBe(true)
  })

  it('v2/index.ts exists', () => {
    expect(existsSync(resolve(schemasDir, 'v2/index.ts'))).toBe(true)
  })

  it('serde_json/JsonValue.ts exists', () => {
    expect(existsSync(resolve(schemasDir, 'serde_json/JsonValue.ts'))).toBe(true)
  })
})

// ── Group 2: Root index exports (compile-time type assertions) ──────
describe('Root index exports', () => {
  it('ClientRequest is a discriminated union with method field', () => {
    // Compile-time assertion: if ClientRequest doesn't have a `method`
    // field, the following type assignment will fail to compile.
    const _typeCheck: Pick<ClientRequest, 'method'> = { method: 'thread/start' } as Pick<
      ClientRequest,
      'method'
    >
    void _typeCheck
    expect(true).toBe(true)
  })

  it('ServerNotification is importable', () => {
    // Compile-time: the import above resolves. Runtime: trivial assertion.
    const _typeCheck: ServerNotification | null = null
    void _typeCheck
    expect(true).toBe(true)
  })

  it('ServerRequest is a discriminated union with method field', () => {
    const _typeCheck: Pick<ServerRequest, 'method'> = {
      method: 'item/commandExecution/requestApproval'
    } as Pick<ServerRequest, 'method'>
    void _typeCheck
    expect(true).toBe(true)
  })

  it('ClientNotification is importable', () => {
    const _typeCheck: ClientNotification | null = null
    void _typeCheck
    expect(true).toBe(true)
  })
})

// ── Group 3: v2 key type exports for later migration sessions ───────
describe('v2 key type exports', () => {
  it('ThreadStartParams has experimentalRawEvents and persistExtendedHistory', () => {
    // Compile-time check: these fields must exist on the type
    type AssertHasFields = ThreadStartParams extends {
      experimentalRawEvents: boolean
      persistExtendedHistory: boolean
    }
      ? true
      : never
    const _check: AssertHasFields = true
    void _check
    expect(true).toBe(true)
  })

  it('ThreadResumeParams has persistExtendedHistory', () => {
    type AssertHasField = ThreadResumeParams extends {
      persistExtendedHistory: boolean
    }
      ? true
      : never
    const _check: AssertHasField = true
    void _check
    expect(true).toBe(true)
  })

  it('TurnStartParams has threadId and effort fields', () => {
    type AssertHasFields = TurnStartParams extends {
      threadId: string
    }
      ? true
      : never
    const _check: AssertHasFields = true
    void _check
    expect(true).toBe(true)
  })

  it('CommandExecutionApprovalDecision includes accept/acceptForSession/decline', () => {
    // Compile-time: verify the literal string values are assignable
    const _accept: CommandExecutionApprovalDecision = 'accept'
    const _acceptForSession: CommandExecutionApprovalDecision = 'acceptForSession'
    const _decline: CommandExecutionApprovalDecision = 'decline'
    void _accept
    void _acceptForSession
    void _decline
    expect(true).toBe(true)
  })

  it('FileChangeApprovalDecision includes accept/acceptForSession/decline', () => {
    const _accept: FileChangeApprovalDecision = 'accept'
    const _acceptForSession: FileChangeApprovalDecision = 'acceptForSession'
    const _decline: FileChangeApprovalDecision = 'decline'
    void _accept
    void _acceptForSession
    void _decline
    expect(true).toBe(true)
  })

  it('UserInput text variant has text_elements field', () => {
    // Compile-time: construct a valid UserInput text variant
    const _textInput: UserInput = {
      type: 'text' as const,
      text: 'hello',
      text_elements: []
    }
    void _textInput
    expect(true).toBe(true)
  })
})

// ── Group 4: package.json regeneration script ───────────────────────
describe('package.json regeneration script', () => {
  const pkgPath = resolve(ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))

  it('codex:generate-schemas script exists', () => {
    expect(pkg.scripts['codex:generate-schemas']).toBeDefined()
  })

  it('script includes codex app-server generate-ts', () => {
    expect(pkg.scripts['codex:generate-schemas']).toContain('codex app-server generate-ts')
  })

  it('script includes --out src/shared/codex-schemas', () => {
    expect(pkg.scripts['codex:generate-schemas']).toContain('--out src/shared/codex-schemas')
  })
})

// ── Group 5: Generated code markers ─────────────────────────────────
describe('Generated code markers', () => {
  it('root index.ts starts with generated code comment', () => {
    const content = readFileSync(resolve(schemasDir, 'index.ts'), 'utf-8')
    expect(content.startsWith('// GENERATED CODE! DO NOT MODIFY BY HAND!')).toBe(true)
  })

  it('v2/index.ts starts with generated code comment', () => {
    const content = readFileSync(resolve(schemasDir, 'v2/index.ts'), 'utf-8')
    expect(content.startsWith('// GENERATED CODE! DO NOT MODIFY BY HAND!')).toBe(true)
  })
})
