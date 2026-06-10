import type { McpServer } from '@agentclientprotocol/sdk/dist/schema'
import type { McpServerConfig as ClaudeMcpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import type { JsonValue } from '@shared/codex-schemas/serde_json/JsonValue'
import { APP_SETTINGS_DB_KEY } from '@shared/types/settings'
import type { McpKeyValue, McpServerConfig, McpTransport } from '@shared/types/mcp'
import type { DatabaseService } from '../db/database'
import { getUserEnvironmentVariables } from './env-vars'

const AZURE_DEVOPS_SAVED_CONFIGS_KEY = 'azure_devops_saved_configs'

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

const INHERITED_MCP_ENV_NAMES = new Set([
  'PATH',
  'Path',
  'PATHEXT',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'AZURE_AUTHORITY_HOST',
  'AZURE_CLIENT_CERTIFICATE_PASSWORD',
  'AZURE_CLIENT_CERTIFICATE_PATH',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_CLOUD',
  'AZURE_CONFIG_DIR',
  'AZURE_DEVOPS_EXT_PAT',
  'AZURE_FEDERATED_TOKEN_FILE',
  'AZURE_PASSWORD',
  'AZURE_TENANT_ID',
  'AZURE_USERNAME',
  'ADO_PAT',
  'SYSTEM_ACCESSTOKEN',
  'ARM_CLIENT_ID',
  'ARM_CLIENT_SECRET',
  'ARM_TENANT_ID',
  'ARM_SUBSCRIPTION_ID'
])

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

function pickAllowedInheritedMcpEnvironment(
  source: Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {}

  for (const [name, value] of Object.entries(source)) {
    if (typeof value !== 'string') continue
    if (INHERITED_MCP_ENV_NAMES.has(name) || INHERITED_MCP_ENV_NAMES.has(name.toUpperCase())) {
      env[name] = value
    }
  }

  return env
}

function isAzureMcpServer(server: McpServerConfig): boolean {
  const haystack = `${server.name} ${server.command} ${server.args} ${server.url}`.toLowerCase()
  return (
    haystack.includes('azure') ||
    haystack.includes('azmcp') ||
    haystack.includes('devops') ||
    haystack.includes('ado') ||
    haystack.includes('@azure/mcp')
  )
}

function normalizeAzureDevOpsOrganization(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const value = raw.trim().replace(/\/+$/, '')
  const devAzureMatch = value.match(/dev\.azure\.com\/([^/]+)/i)
  if (devAzureMatch?.[1]) return decodeURIComponent(devAzureMatch[1]).toLowerCase()
  const visualStudioMatch = value.match(/(?:https?:\/\/)?([^.]+)\.visualstudio\.com(?:\/|$)/i)
  if (visualStudioMatch?.[1]) return visualStudioMatch[1].toLowerCase()
  return value.replace(/^https?:\/\//i, '').split('/')[0]?.toLowerCase() ?? ''
}

function scoreAzureDevOpsConfigForServer(
  server: McpServerConfig,
  settings: Record<string, unknown>
): number {
  const haystack = `${server.name} ${server.command} ${server.args} ${server.url}`.toLowerCase()
  const organization = normalizeAzureDevOpsOrganization(settings.azure_devops_organization)
  const project =
    typeof settings.azure_devops_project === 'string'
      ? settings.azure_devops_project.trim().toLowerCase()
      : ''

  let score = 0
  if (organization && haystack.includes(organization)) score += 2
  if (project && haystack.includes(project)) score += 1
  return score
}

function getSavedAzureDevOpsPatForServer(
  dbService: DatabaseService | null,
  server: McpServerConfig
): string | null {
  if (!dbService) return null

  try {
    const raw = dbService.getSetting(AZURE_DEVOPS_SAVED_CONFIGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    const configs = parsed
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const typed = row as {
          settings?: Record<string, unknown>
          updatedAt?: unknown
        }
        const patRaw = typed.settings?.azure_devops_pat
        const pat = typeof patRaw === 'string' ? patRaw.trim().replace(/^["']|["']$/g, '') : ''
        if (!pat) return null
        const updatedAt = typeof typed.updatedAt === 'string' ? typed.updatedAt : ''
        const score = typed.settings ? scoreAzureDevOpsConfigForServer(server, typed.settings) : 0
        return { pat, updatedAt, score }
      })
      .filter((row): row is { pat: string; updatedAt: string; score: number } => row !== null)

    configs.sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
    return configs[0]?.pat ?? null
  } catch {
    return null
  }
}

function getInheritedMcpEnvironment(
  dbService: DatabaseService | null,
  server: McpServerConfig
): Record<string, string> {
  const env = {
    ...pickAllowedInheritedMcpEnvironment(process.env),
    ...pickAllowedInheritedMcpEnvironment(getUserEnvironmentVariables(dbService))
  }

  if (isAzureMcpServer(server) && !env.AZURE_DEVOPS_EXT_PAT) {
    const savedPat = getSavedAzureDevOpsPatForServer(dbService, server)
    if (savedPat) env.AZURE_DEVOPS_EXT_PAT = savedPat
  }

  return {
    ...env
  }
}

function keyValuesToRecord(rows: McpKeyValue[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (name) record[name] = row.value
  }
  return record
}

function getStdioMcpEnvironment(
  dbService: DatabaseService | null,
  server: McpServerConfig,
  rows: McpKeyValue[]
): Record<string, string> {
  return {
    ...getInheritedMcpEnvironment(dbService, server),
    ...keyValuesToRecord(rows)
  }
}

function recordToKeyValues(record: Record<string, string>): McpKeyValue[] {
  return Object.entries(record).map(([name, value]) => ({ name, value }))
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
            env: recordToKeyValues(getStdioMcpEnvironment(dbService, server, server.env))
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

export function getConfiguredCodexMcpServers(
  dbService: DatabaseService | null
): { [key in string]?: JsonValue } | null {
  if (!dbService) return null

  try {
    const raw = dbService.getSetting(APP_SETTINGS_DB_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const entries: Array<[string, { [key in string]?: JsonValue }]> = []

    for (const server of normalizeMcpServers(parsed.mcpServers)) {
      if (!server.enabled) continue

      const name = server.name.trim()
      if (!name) continue

      if (server.transport === 'stdio') {
        const command = server.command.trim()
        if (!command) continue

        const config: { [key in string]?: JsonValue } = {
          command,
          args: splitCommandLineArgs(server.args)
        }
        const env = getStdioMcpEnvironment(dbService, server, server.env)
        if (Object.keys(env).length > 0) config.env = env

        entries.push([name, config])
        continue
      }

      const url = server.url.trim()
      if (!url) continue

      const config: { [key in string]?: JsonValue } = { url }
      const headers = keyValuesToRecord(server.headers)
      if (Object.keys(headers).length > 0) config.http_headers = headers

      entries.push([name, config])
    }

    return entries.length > 0 ? Object.fromEntries(entries) : null
  } catch {
    return null
  }
}

export function getConfiguredClaudeMcpServers(
  dbService: DatabaseService | null
): Record<string, ClaudeMcpServerConfig> {
  if (!dbService) return {}

  try {
    const raw = dbService.getSetting(APP_SETTINGS_DB_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const entries: Array<[string, ClaudeMcpServerConfig]> = []

    for (const server of normalizeMcpServers(parsed.mcpServers)) {
      if (!server.enabled) continue

      const name = server.name.trim()
      if (!name) continue

      if (server.transport === 'stdio') {
        const command = server.command.trim()
        if (!command) continue

        const config: ClaudeMcpServerConfig = {
          type: 'stdio',
          command,
          args: splitCommandLineArgs(server.args)
        }
        const env = getStdioMcpEnvironment(dbService, server, server.env)
        if (Object.keys(env).length > 0) config.env = env

        entries.push([name, config])
        continue
      }

      const url = server.url.trim()
      if (!url) continue

      const config: ClaudeMcpServerConfig = {
        type: server.transport,
        url
      }
      const headers = keyValuesToRecord(server.headers)
      if (Object.keys(headers).length > 0) config.headers = headers

      entries.push([name, config])
    }

    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}
