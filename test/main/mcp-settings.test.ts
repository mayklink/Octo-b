import { afterEach, describe, expect, it } from 'vitest'
import {
  getConfiguredCodexMcpServers,
  getConfiguredMcpServers
} from '../../src/main/services/mcp-settings'

const ORIGINAL_ENV = { ...process.env }

function createDb(settings: unknown): { getSetting: (key?: string) => string | null } {
  return {
    getSetting: (key?: string) => {
      if (key && settings && typeof settings === 'object' && key in settings) {
        return JSON.stringify((settings as Record<string, unknown>)[key])
      }
      return JSON.stringify(settings)
    }
  }
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('mcp-settings', () => {
  it('passes inherited Azure DevOps auth env to Codex stdio MCP servers', () => {
    process.env.AZURE_DEVOPS_EXT_PAT = 'from-env'

    const result = getConfiguredCodexMcpServers(
      createDb({
        app_settings: {
          mcpServers: [
            {
              id: 'azure',
              enabled: true,
              name: 'Azure',
              transport: 'stdio',
              command: 'npx',
              args: '-y @azure/mcp@latest server start',
              env: [],
              url: '',
              headers: []
            }
          ]
        }
      }) as never
    )

    expect(result?.Azure).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          AZURE_DEVOPS_EXT_PAT: 'from-env'
        })
      })
    )
  })

  it('lets explicit MCP env override inherited auth env', () => {
    process.env.AZURE_DEVOPS_EXT_PAT = 'from-env'

    const result = getConfiguredMcpServers(
      createDb({
        app_settings: {
          mcpServers: [
            {
              id: 'azure',
              enabled: true,
              name: 'Azure',
              transport: 'stdio',
              command: 'npx',
              args: '-y @azure/mcp@latest server start',
              env: [{ name: 'AZURE_DEVOPS_EXT_PAT', value: 'from-settings' }],
              url: '',
              headers: []
            }
          ]
        }
      }) as never
    )

    expect(result[0]?.env).toContainEqual({
      name: 'AZURE_DEVOPS_EXT_PAT',
      value: 'from-settings'
    })
  })

  it('passes saved Octob environment variables to stdio MCP servers', () => {
    const result = getConfiguredCodexMcpServers(
      createDb({
        app_settings: {
          environmentVariables: [
            { key: 'AZURE_DEVOPS_EXT_PAT', value: 'from-octob-env' },
            { key: 'UNRELATED_SECRET', value: 'do-not-forward' }
          ],
          mcpServers: [
            {
              id: 'azure',
              enabled: true,
              name: 'Azure',
              transport: 'stdio',
              command: 'npx',
              args: '-y @azure/mcp@latest server start',
              env: [],
              url: '',
              headers: []
            }
          ]
        }
      }) as never
    )

    expect(result?.Azure).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          AZURE_DEVOPS_EXT_PAT: 'from-octob-env'
        })
      })
    )
    expect(result?.Azure).toEqual(
      expect.objectContaining({
        env: expect.not.objectContaining({
          UNRELATED_SECRET: 'do-not-forward'
        })
      })
    )
  })

  it('passes the latest saved Azure DevOps PAT to Azure MCP servers', () => {
    const result = getConfiguredCodexMcpServers(
      createDb({
        app_settings: {
          mcpServers: [
            {
              id: 'azure',
              enabled: true,
              name: 'Azure',
              transport: 'stdio',
              command: 'npx',
              args: '-y @azure/mcp@latest server start',
              env: [],
              url: '',
              headers: []
            }
          ]
        },
        azure_devops_saved_configs: [
          {
            id: 'old',
            updatedAt: '2026-01-01T00:00:00.000Z',
            settings: { azure_devops_pat: 'old-pat' }
          },
          {
            id: 'new',
            updatedAt: '2026-02-01T00:00:00.000Z',
            settings: { azure_devops_pat: 'new-pat' }
          }
        ]
      }) as never
    )

    expect(result?.Azure).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          AZURE_DEVOPS_EXT_PAT: 'new-pat'
        })
      })
    )
  })
})
