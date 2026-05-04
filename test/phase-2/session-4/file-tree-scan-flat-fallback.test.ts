// @vitest-environment node
import { describe, test, expect, afterEach, vi } from 'vitest'
import { mkdir, writeFile, rm } from 'fs/promises'
import { mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: vi.fn()
}))
vi.mock('../../../src/main/services/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  })
}))

import { scanFlat } from '../../../src/main/ipc/file-tree-handlers'

describe('scanFlat filesystem fallback', () => {
  let tempDir = ''

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  test('lists files when folder is not a git repository', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'octob-scan-flat-'))
    await mkdir(join(tempDir, 'src', 'lib'), { recursive: true })
    await writeFile(join(tempDir, 'src', 'lib', 'main.ts'), 'export {}\n')

    const files = await scanFlat(tempDir)

    const main = files.find((f) => f.name === 'main.ts')
    expect(main).toBeDefined()
    expect(main!.relativePath).toMatch(/src[\\/]lib[\\/]main\.ts$/)
  })

  test('skips IGNORE_DIRS such as node_modules', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'octob-scan-flat-'))
    await mkdir(join(tempDir, 'node_modules', 'pkg'), { recursive: true })
    await writeFile(join(tempDir, 'node_modules', 'pkg', 'index.js'), '')
    await writeFile(join(tempDir, 'ok.ts'), '')

    const files = await scanFlat(tempDir)

    expect(files.map((f) => f.relativePath)).toContain('ok.ts')
    expect(files.some((f) => f.relativePath.includes('node_modules'))).toBe(false)
  })
})
