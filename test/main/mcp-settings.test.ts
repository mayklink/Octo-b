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
  it('does not pass inherited Azure DevOps auth env to Codex stdio MCP servers', () => {
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
        env: expect.not.objectContaining({
          AZURE_DEVOPS_EXT_PAT: expect.any(String)
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

  it('does not pass saved Octob environment variables to stdio MCP servers', () => {
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
        env: expect.not.objectContaining({
          AZURE_DEVOPS_EXT_PAT: expect.any(String)
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

  it('does not pass unrelated saved Azure DevOps PAT to generic Azure MCP servers', () => {
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
        env: expect.not.objectContaining({
          AZURE_DEVOPS_EXT_PAT: expect.any(String)
        })
      })
    )
  })

  it('does not pass matching saved PAT to named Azure DevOps MCP servers without MCP env', () => {
    const result = getConfiguredCodexMcpServers(
      createDb({
        app_settings: {
          mcpServers: [
            {
              id: 'ado-vntrx',
              enabled: true,
              name: 'azure-devops-vntrx',
              transport: 'stdio',
              command: 'npx',
              args: '-y azure-devops-mcp',
              env: [],
              url: '',
              headers: []
            }
          ]
        },
        azure_devops_saved_configs: [
          {
            id: 'other',
            updatedAt: '2026-03-01T00:00:00.000Z',
            settings: {
              azure_devops_organization: 'other-org',
              azure_devops_project: 'Other',
              azure_devops_pat: 'wrong-pat'
            }
          },
          {
            id: 'vntrx',
            updatedAt: '2026-02-01T00:00:00.000Z',
            settings: {
              azure_devops_organization: 'vntrx',
              azure_devops_project: 'V ERP',
              azure_devops_pat: 'vntrx-pat'
            }
          }
        ]
      }) as never
    )

    expect(result?.['azure-devops-vntrx']).toEqual(
      expect.objectContaining({
        env: expect.not.objectContaining({
          AZURE_DEVOPS_EXT_PAT: expect.any(String),
          PERSONAL_ACCESS_TOKEN: expect.any(String)
        })
      })
    )
  })

  it('base64 encodes raw PERSONAL_ACCESS_TOKEN values for Azure DevOps PAT auth', () => {
    const expectedToken = Buffer.from(':raw-mcp-pat').toString('base64')

    const result = getConfiguredCodexMcpServers(
      createDb({
        app_settings: {
          mcpServers: [
            {
              id: 'ado-vntrx',
              enabled: true,
              name: 'azure-devops-vntrx',
              transport: 'stdio',
              command: 'npx',
              args: '-y @azure-devops/mcp vntrx --authentication pat',
              env: [{ name: 'PERSONAL_ACCESS_TOKEN', value: 'raw-mcp-pat' }],
              url: '',
              headers: []
            }
          ]
        },
        azure_devops_saved_configs: []
      }) as never
    )

    expect(result?.['azure-devops-vntrx']).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          PERSONAL_ACCESS_TOKEN: expectedToken
        })
      })
    )
  })

  it('does not override explicit Azure DevOps MCP PAT with an unrelated saved config', () => {
    const expectedToken = Buffer.from(':old-mayk-pat').toString('base64')

    const result = getConfiguredCodexMcpServers(
      createDb({
        app_settings: {
          mcpServers: [
            {
              id: 'ado-old-mayk',
              enabled: true,
              name: 'azure-devops-old-mayk',
              transport: 'stdio',
              command: 'npx',
              args: '-y @azure-devops/mcp old-mayk --authentication pat',
              env: [{ name: 'PERSONAL_ACCESS_TOKEN', value: 'old-mayk-pat' }],
              url: '',
              headers: []
            }
          ]
        },
        azure_devops_saved_configs: [
          {
            id: 'vntrx',
            updatedAt: '2026-06-09T13:50:54.739Z',
            settings: {
              azure_devops_organization: 'vntrx',
              azure_devops_project: 'V ERP',
              azure_devops_pat: 'vntrx-pat'
            }
          }
        ]
      }) as never
    )

    expect(result?.['azure-devops-old-mayk']).toEqual(
      expect.objectContaining({
        env: expect.objectContaining({
          PERSONAL_ACCESS_TOKEN: expectedToken
        })
      })
    )
  })
})
