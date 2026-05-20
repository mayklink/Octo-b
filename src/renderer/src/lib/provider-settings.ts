/**
 * Read ticket-import provider settings from localStorage.
 * Provider credentials are stored in a dedicated 'octob-provider-settings' key
 * to avoid being overwritten by the Zustand useSettingsStore which persists
 * to the 'octob-settings' key with a partialize function.
 */

const PROVIDER_SETTINGS_KEY = 'provider_settings'
const PROVIDER_SETTINGS_LOCAL_STORAGE_KEY = 'octob-provider-settings'
const AZURE_DEVOPS_SAVED_CONFIGS_KEY = 'azure_devops_saved_configs'
const AZURE_DEVOPS_SAVED_CONFIGS_LOCAL_STORAGE_KEY = 'octob-azure-devops-saved-configs'

export interface AzureDevOpsSavedConfig {
  id: string
  label: string
  settings: Record<string, string>
  updatedAt: string
}

function projectProviderSettingsKey(projectId: string): string {
  return `provider_settings:${projectId}`
}

function projectProviderLocalStorageKey(projectId: string): string {
  return `octob-provider-settings:${projectId}`
}

function azureDevOpsConfigId(settings: Record<string, string>): string | null {
  const org = settings.azure_devops_organization?.trim()
  const project = settings.azure_devops_project?.trim()
  if (!org || !project) return null
  return `${org.toLowerCase()}/${project.toLowerCase()}`
}

function azureDevOpsConfigLabel(settings: Record<string, string>): string {
  const org = settings.azure_devops_organization?.trim() ?? ''
  const project = settings.azure_devops_project?.trim() ?? ''
  return org && project ? `${org}/${project}` : 'Azure DevOps project'
}

export function getProviderSettings(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PROVIDER_SETTINGS_LOCAL_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>
      return { ...parsed }
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

export function getProjectProviderSettings(projectId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(projectProviderLocalStorageKey(projectId))
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string>
      return { ...parsed }
    }
  } catch {
    // ignore parse errors
  }
  return {}
}

export async function saveProviderSettingsToDatabase(settings: Record<string, string>): Promise<void> {
  try {
    if (typeof window !== 'undefined' && window.db?.setting) {
      await window.db.setting.set(PROVIDER_SETTINGS_KEY, JSON.stringify(settings))
    }
  } catch (error) {
    console.error('Failed to save provider settings to database:', error)
  }
}

export async function saveProjectProviderSettingsToDatabase(
  projectId: string,
  settings: Record<string, string>
): Promise<void> {
  try {
    localStorage.setItem(projectProviderLocalStorageKey(projectId), JSON.stringify(settings))
  } catch {
    // ignore localStorage errors
  }

  try {
    if (typeof window !== 'undefined' && window.db?.setting) {
      await window.db.setting.set(projectProviderSettingsKey(projectId), JSON.stringify(settings))
    }
  } catch (error) {
    console.error('Failed to save project provider settings to database:', error)
  }
}

export async function loadProviderSettingsFromDatabase(): Promise<Record<string, string> | null> {
  try {
    if (typeof window !== 'undefined' && window.db?.setting) {
      const value = await window.db.setting.get(PROVIDER_SETTINGS_KEY)
      if (value) {
        return JSON.parse(value) as Record<string, string>
      }
    }
  } catch (error) {
    console.error('Failed to load provider settings from database:', error)
  }
  return null
}

export async function loadProjectProviderSettingsFromDatabase(
  projectId: string
): Promise<Record<string, string> | null> {
  try {
    if (typeof window !== 'undefined' && window.db?.setting) {
      const value = await window.db.setting.get(projectProviderSettingsKey(projectId))
      if (value) {
        const parsed = JSON.parse(value) as Record<string, string>
        try {
          localStorage.setItem(projectProviderLocalStorageKey(projectId), JSON.stringify(parsed))
        } catch {
          // ignore localStorage errors
        }
        return parsed
      }
    }
  } catch (error) {
    console.error('Failed to load project provider settings from database:', error)
  }
  return null
}

export async function loadAzureDevOpsSavedConfigs(): Promise<AzureDevOpsSavedConfig[]> {
  let configs: AzureDevOpsSavedConfig[] = []

  try {
    const raw = localStorage.getItem(AZURE_DEVOPS_SAVED_CONFIGS_LOCAL_STORAGE_KEY)
    if (raw) configs = JSON.parse(raw) as AzureDevOpsSavedConfig[]
  } catch {
    // ignore parse errors
  }

  try {
    if (typeof window !== 'undefined' && window.db?.setting) {
      const value = await window.db.setting.get(AZURE_DEVOPS_SAVED_CONFIGS_KEY)
      if (value) {
        configs = JSON.parse(value) as AzureDevOpsSavedConfig[]
        try {
          localStorage.setItem(AZURE_DEVOPS_SAVED_CONFIGS_LOCAL_STORAGE_KEY, JSON.stringify(configs))
        } catch {
          // ignore localStorage errors
        }
      }
    }
  } catch (error) {
    console.error('Failed to load Azure DevOps saved configs from database:', error)
  }

  return configs
    .filter((config) => config.id && config.settings)
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
}

export async function upsertAzureDevOpsSavedConfig(
  settings: Record<string, string>
): Promise<AzureDevOpsSavedConfig[]> {
  const id = azureDevOpsConfigId(settings)
  if (!id) return loadAzureDevOpsSavedConfigs()

  const configs = await loadAzureDevOpsSavedConfigs()
  const nextConfig: AzureDevOpsSavedConfig = {
    id,
    label: azureDevOpsConfigLabel(settings),
    settings: { ...settings },
    updatedAt: new Date().toISOString()
  }
  const withoutCurrent = configs.filter((config) => config.id !== id)
  const next = [...withoutCurrent, nextConfig].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  )

  try {
    localStorage.setItem(AZURE_DEVOPS_SAVED_CONFIGS_LOCAL_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore localStorage errors
  }

  try {
    if (typeof window !== 'undefined' && window.db?.setting) {
      await window.db.setting.set(AZURE_DEVOPS_SAVED_CONFIGS_KEY, JSON.stringify(next))
    }
  } catch (error) {
    console.error('Failed to save Azure DevOps saved configs to database:', error)
  }

  return next
}

