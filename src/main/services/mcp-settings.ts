import type { McpServer } from '@agentclientprotocol/sdk/dist/schema'
import { APP_SETTINGS_DB_KEY } from '@shared/types/settings'
import type { McpKeyValue, McpServerConfig, McpTransport } from '@shared/types/mcp'
import type { DatabaseService } from '../db/database'

function normalizeKeyValues(value: unknown): McpKeyValue[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const typed = row as Record<string, unknown>
      const name = typeof typed.name === 'string' ? typed.name.trim() : ''
      const rowValue = typeof typed.value === 'string' ? typed.value : ''
      if (!name) return null
      return { name, value: rowValue }
    })
    .filter((row): row is McpKeyValue => row !== null)
}

function normalizeMcpServers(value: unknown): McpServerConfig[] {
  if (!Array.isArray(value)) return []
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const typed = row as Record<string, unknown>
      const transport: McpTransport =
        typed.transport === 'http' || typed.transport === 'sse' || typed.transport === 'stdio'
          ? typed.transport
          : 'stdio'

      return {
        id: typeof typed.id === 'string' ? typed.id : '',
        enabled: typed.enabled !== false,
        name: typeof typed.name === 'string' ? typed.name : '',
        transport,
        command: typeof typed.command === 'string' ? typed.command : '',
        args: typeof typed.args === 'string' ? typed.args : '',
        env: normalizeKeyValues(typed.env),
        url: typeof typed.url === 'string' ? typed.url : '',
        headers: normalizeKeyValues(typed.headers)
      }
    })
    .filter((server): server is McpServerConfig => server !== null)
}

export function splitCommandLineArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaping = false

  for (const char of input) {
    if (escaping) {
      current += char
      escaping = false
      continue
    }

    if (char === '\\') {
      escaping = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (escaping) current += '\\'
  if (current.length > 0) args.push(current)
  return args
}

export function getConfiguredMcpServers(dbService: DatabaseService | null): McpServer[] {
  if (!dbService) return []

  try {
    const raw = dbService.getSetting(APP_SETTINGS_DB_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Record<string, unknown>

    return normalizeMcpServers(parsed.mcpServers)
      .filter((server) => server.enabled)
      .map((server): McpServer | null => {
        const name = server.name.trim()
        if (!name) return null

        if (server.transport === 'stdio') {
          const command = server.command.trim()
          if (!command) return null
          return {
            name,
            command,
            args: splitCommandLineArgs(server.args),
            env: server.env.filter((row) => row.name.trim()).map((row) => ({
              name: row.name.trim(),
              value: row.value
            }))
          }
        }

        const url = server.url.trim()
        if (!url) return null
        return {
          type: server.transport,
          name,
          url,
          headers: server.headers.filter((row) => row.name.trim()).map((row) => ({
            name: row.name.trim(),
            value: row.value
          }))
        }
      })
      .filter((server): server is McpServer => server !== null)
  } catch {
    return []
  }
}
