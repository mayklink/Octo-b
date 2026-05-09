import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Check, X, Plus, Trash2, Server } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { ProviderIcon } from '@/components/ui/provider-icon'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { toast } from 'sonner'
import {
  saveProviderSettingsToDatabase,
  loadProviderSettingsFromDatabase
} from '@/lib/provider-settings'
import type { McpKeyValue, McpServerConfig, McpTransport } from '@shared/types/mcp'

interface ProviderInfo {
  id: string
  name: string
  icon: string
}

interface SettingsFieldDef {
  key: string
  label: string
  type: string
  required: boolean
  placeholder?: string
}

function createId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
}

function formatKeyValues(rows: McpKeyValue[]): string {
  return rows.map((row) => `${row.name}=${row.value}`).join('\n')
}

function parseKeyValues(value: string): McpKeyValue[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const equalsIndex = line.indexOf('=')
      if (equalsIndex === -1) return { name: line, value: '' }
      return {
        name: line.slice(0, equalsIndex).trim(),
        value: line.slice(equalsIndex + 1)
      }
    })
    .filter((row) => row.name.length > 0)
}

function createEmptyMcpServer(): McpServerConfig {
  return {
    id: createId(),
    enabled: true,
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: [],
    url: '',
    headers: []
  }
}

function createNotionPreset(): McpServerConfig {
  return {
    ...createEmptyMcpServer(),
    name: 'Notion',
    transport: 'http',
    url: 'https://mcp.notion.com/mcp'
  }
}

function createSupabasePreset(): McpServerConfig {
  return {
    ...createEmptyMcpServer(),
    name: 'Supabase',
    transport: 'http',
    url: 'https://mcp.supabase.com/mcp?read_only=true'
  }
}

function createExcalidrawPreset(): McpServerConfig {
  return {
    ...createEmptyMcpServer(),
    name: 'Excalidraw',
    transport: 'stdio'
  }
}

export function SettingsIntegrations(): React.JSX.Element {
  const { t } = useTranslation()
  const mcpServers = useSettingsStore((state) => state.mcpServers)
  const updateSetting = useSettingsStore((state) => state.updateSetting)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [schemas, setSchemas] = useState<Record<string, SettingsFieldDef[]>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, boolean | null>>({})
  const [testingMcp, setTestingMcp] = useState<string | null>(null)
  const [mcpTestResult, setMcpTestResult] = useState<
    Record<string, { success: boolean; message: string } | null>
  >({})

  useEffect(() => {
    window.ticketImport.listProviders().then(async (provs) => {
      setProviders(provs)
      const schemaMap: Record<string, SettingsFieldDef[]> = {}
      for (const p of provs) {
        schemaMap[p.id] = await window.ticketImport.getSettingsSchema(p.id)
      }
      setSchemas(schemaMap)

      const saved: Record<string, string> = {}
      try {
        const raw = localStorage.getItem('octob-provider-settings')
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, string>
          for (const fields of Object.values(schemaMap)) {
            for (const field of fields) {
              const val = parsed[field.key]
              if (typeof val === 'string') saved[field.key] = val
            }
          }
          setValues(saved)
        }
      } catch {
        // ignore
      }

      try {
        const dbSettings = await loadProviderSettingsFromDatabase()
        if (dbSettings) {
          const merged = { ...saved }
          for (const fields of Object.values(schemaMap)) {
            for (const field of fields) {
              const dbVal = dbSettings[field.key]
              if (typeof dbVal === 'string') merged[field.key] = dbVal
            }
          }
          setValues(merged)
          localStorage.setItem('octob-provider-settings', JSON.stringify(merged))
        } else if (Object.keys(saved).length > 0) {
          await saveProviderSettingsToDatabase(saved)
        }
      } catch {
        // ignore
      }
    })
  }, [])

  const handleFieldChange = (key: string, value: string): void => {
    setValues((prev) => {
      const updated = { ...prev, [key]: value }
      try {
        localStorage.setItem('octob-provider-settings', JSON.stringify(updated))
      } catch {
        // ignore
      }
      saveProviderSettingsToDatabase(updated)
      return updated
    })
    setTestResult({})
  }

  const handleTest = async (providerId: string): Promise<void> => {
    setTesting(providerId)
    setTestResult((prev) => ({ ...prev, [providerId]: null }))

    try {
      const providerSettings: Record<string, string> = {}
      const fields = schemas[providerId] ?? []
      for (const f of fields) {
        if (values[f.key]) providerSettings[f.key] = values[f.key]
      }

      const result = await window.ticketImport.authenticate(providerId, providerSettings)
      setTestResult((prev) => ({ ...prev, [providerId]: result.success }))
      if (result.success) {
        const name = providers.find((p) => p.id === providerId)?.name ?? providerId
        toast.success(t('settings.integrations.connected', { name }))
      } else {
        toast.error(result.error ?? t('settings.integrations.authFailed'))
      }
    } catch (err) {
      setTestResult((prev) => ({ ...prev, [providerId]: false }))
      toast.error(
        t('settings.integrations.testFailed', {
          message: err instanceof Error ? err.message : String(err)
        })
      )
    } finally {
      setTesting(null)
    }
  }

  const updateMcpServers = (next: McpServerConfig[]): void => {
    updateSetting('mcpServers', next)
  }

  const addMcpServer = (server: McpServerConfig = createEmptyMcpServer()): void => {
    updateMcpServers([...mcpServers, server])
  }

  const updateMcpServer = (id: string, patch: Partial<McpServerConfig>): void => {
    updateMcpServers(mcpServers.map((server) => (server.id === id ? { ...server, ...patch } : server)))
  }

  const removeMcpServer = (id: string): void => {
    updateMcpServers(mcpServers.filter((server) => server.id !== id))
  }

  const handleMcpTest = async (server: McpServerConfig): Promise<void> => {
    setTestingMcp(server.id)
    setMcpTestResult((prev) => ({ ...prev, [server.id]: null }))

    try {
      if (typeof window.settingsOps.testMcpServer !== 'function') {
        throw new Error(
          'A função de teste MCP ainda não foi carregada no preload. Reinicie o Octob/dev server e tente novamente.'
        )
      }

      const result = await window.settingsOps.testMcpServer(server)
      setMcpTestResult((prev) => ({
        ...prev,
        [server.id]: { success: result.success, message: result.message }
      }))
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMcpTestResult((prev) => ({
        ...prev,
        [server.id]: { success: false, message }
      }))
      toast.error(message)
    } finally {
      setTestingMcp(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-1">{t('settings.integrations.heading')}</h3>
        <p className="text-xs text-muted-foreground">{t('settings.integrations.description')}</p>
      </div>

      {providers.map((provider) => {
        const fields = schemas[provider.id] ?? []
        const result = testResult[provider.id]

        return (
          <div key={provider.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ProviderIcon provider={provider.icon} size="md" />
                <h4 className="text-sm font-medium">{provider.name}</h4>
              </div>
              <div className="flex items-center gap-2">
                {result === true && <Check className="h-4 w-4 text-green-500" />}
                {result === false && <X className="h-4 w-4 text-red-500" />}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={testing !== null}
                  onClick={() => void handleTest(provider.id)}
                >
                  {testing === provider.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : null}
                  {t('settings.integrations.testConnection')}
                </Button>
              </div>
            </div>

            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('settings.integrations.noConfigNeeded')}
              </p>
            ) : (
              fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {field.label}
                    {!field.required && (
                      <span className="text-muted-foreground/50 ml-1">{t('common.optional')}</span>
                    )}
                  </label>
                  <Input
                    type={field.type === 'password' ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={values[field.key] ?? ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    className="text-sm h-8"
                  />
                </div>
              ))
            )}
          </div>
        )
      })}

      <div className="space-y-4 border-t pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium mb-1">{t('settings.integrations.mcpHeading')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('settings.integrations.mcpDescription')}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => addMcpServer(createNotionPreset())}>
              <Server className="h-3.5 w-3.5 mr-1.5" />
              {t('settings.integrations.addNotionPreset')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addMcpServer(createSupabasePreset())}
            >
              <Server className="h-3.5 w-3.5 mr-1.5" />
              {t('settings.integrations.addSupabasePreset')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addMcpServer(createExcalidrawPreset())}
            >
              <Server className="h-3.5 w-3.5 mr-1.5" />
              {t('settings.integrations.addExcalidrawPreset')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => addMcpServer()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {t('settings.integrations.addMcp')}
            </Button>
          </div>
        </div>

        {mcpServers.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            {t('settings.integrations.noMcpServers')}
          </p>
        ) : (
          mcpServers.map((server) => {
            const result = mcpTestResult[server.id]

            return (
            <div key={server.id} className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Checkbox
                    checked={server.enabled}
                    onCheckedChange={(checked) => updateMcpServer(server.id, { enabled: checked })}
                  />
                  {t('settings.integrations.enabled')}
                </label>
                <div className="flex items-center gap-2">
                  {result?.success === true && <Check className="h-4 w-4 text-green-500" />}
                  {result?.success === false && <X className="h-4 w-4 text-red-500" />}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={testingMcp !== null}
                    onClick={() => void handleMcpTest(server)}
                  >
                    {testingMcp === server.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : null}
                    {t('settings.integrations.testMcp')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    aria-label={t('settings.integrations.removeMcp')}
                    onClick={() => removeMcpServer(server.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('settings.integrations.name')}
                  </label>
                  <Input
                    value={server.name}
                    placeholder={t('settings.integrations.namePlaceholder')}
                    onChange={(event) => updateMcpServer(server.id, { name: event.target.value })}
                    className="text-sm h-8"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {t('settings.integrations.transport')}
                  </label>
                  <select
                    value={server.transport}
                    onChange={(event) =>
                      updateMcpServer(server.id, {
                        transport: event.target.value as McpTransport
                      })
                    }
                    className="h-8 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="stdio">{t('settings.integrations.stdio')}</option>
                    <option value="http">{t('settings.integrations.http')}</option>
                    <option value="sse">{t('settings.integrations.sse')}</option>
                  </select>
                </div>
              </div>

              {server.transport === 'stdio' ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t('settings.integrations.command')}
                      </label>
                      <Input
                        value={server.command}
                        placeholder={t('settings.integrations.commandPlaceholder')}
                        onChange={(event) =>
                          updateMcpServer(server.id, { command: event.target.value })
                        }
                        className="text-sm h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t('settings.integrations.args')}
                      </label>
                      <Input
                        value={server.args}
                        placeholder={t('settings.integrations.argsPlaceholder')}
                        onChange={(event) =>
                          updateMcpServer(server.id, { args: event.target.value })
                        }
                        className="text-sm h-8"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t('settings.integrations.env')}
                    </label>
                    <Textarea
                      value={formatKeyValues(server.env)}
                      placeholder={t('settings.integrations.envPlaceholder')}
                      onChange={(event) =>
                        updateMcpServer(server.id, { env: parseKeyValues(event.target.value) })
                      }
                      className="min-h-[72px] font-mono text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t('settings.integrations.url')}
                    </label>
                    <Input
                      value={server.url}
                      placeholder={t('settings.integrations.urlPlaceholder')}
                      onChange={(event) => updateMcpServer(server.id, { url: event.target.value })}
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {t('settings.integrations.headers')}
                    </label>
                    <Textarea
                      value={formatKeyValues(server.headers)}
                      placeholder={t('settings.integrations.headersPlaceholder')}
                      onChange={(event) =>
                        updateMcpServer(server.id, { headers: parseKeyValues(event.target.value) })
                      }
                      className="min-h-[72px] font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {t('settings.integrations.mcpSupportHint')}
              </p>
              {result && (
                <p className={result.success ? 'text-xs text-green-500' : 'text-xs text-red-500'}>
                  {result.message}
                </p>
              )}
            </div>
            )
          })
        )}
      </div>
    </div>
  )
}
