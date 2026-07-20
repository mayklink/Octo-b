import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  Check,
  GitPullRequest,
  Loader2,
  RefreshCw,
  Settings2,
  UserRound
} from 'lucide-react'
import type {
  PullRequestBucket,
  PullRequestInboxItem,
  PullRequestInboxRepository
} from '@shared/types/pull-request-inbox'
import { Button } from '@/components/ui/button'
import { ProviderIcon } from '@/components/ui/provider-icon'
import { ReviewSettingsDialog } from './ReviewSettingsDialog'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import {
  getProviderSettings,
  loadAzureDevOpsSavedConfigs,
  loadProviderSettingsFromDatabase
} from '@/lib/provider-settings'
import {
  loadPullRequestReviewSettings,
  savePullRequestReviewSettings,
  type PullRequestReviewAgentSdk,
  type PullRequestReviewRepositorySettings
} from '@/lib/pull-request-review-settings'
import {
  DEFAULT_REVIEW_PROMPT_PRESET_ID
} from '@/constants/reviewPrompts'
import { resolveModelForSdk, useSettingsStore } from '@/stores/useSettingsStore'
import { useProjectStore } from '@/stores/useProjectStore'
import { useWorktreeStore } from '@/stores/useWorktreeStore'
import { useGitStore } from '@/stores/useGitStore'
import { useLayoutStore } from '@/stores/useLayoutStore'
import { startCodeReviewSession } from '@/lib/code-review'

type InboxFilter = 'all' | PullRequestBucket

function defaultRepositorySettings(): PullRequestReviewRepositorySettings {
  const settings = useSettingsStore.getState()
  const agentSdk: PullRequestReviewAgentSdk =
    settings.defaultAgentSdk === 'claude-code' || settings.defaultAgentSdk === 'codex'
      ? settings.defaultAgentSdk
      : 'opencode'
  return {
    agentSdk,
    model: resolveModelForSdk(agentSdk, settings),
    promptPresetId: settings.reviewPromptPresetId || DEFAULT_REVIEW_PROMPT_PRESET_ID
  }
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  const minutes = Math.max(1, Math.round(diff / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function PullRequestInbox(): React.JSX.Element {
  const projects = useProjectStore((state) => state.projects)
  const [items, setItems] = useState<PullRequestInboxItem[]>([])
  const [repositories, setRepositories] = useState<PullRequestInboxRepository[]>([])
  const [errors, setErrors] = useState<Array<{ source: string; message: string }>>([])
  const [loading, setLoading] = useState(true)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [repositoryFilter, setRepositoryFilter] = useState('all')
  const [reviewSettings, setReviewSettings] = useState<Record<string, PullRequestReviewRepositorySettings>>({})
  const [configuringRepository, setConfiguringRepository] = useState<PullRequestInboxRepository | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const [databaseSettings, azureDevOpsConfigs] = await Promise.all([
        loadProviderSettingsFromDatabase(),
        loadAzureDevOpsSavedConfigs()
      ])
      const providerSettings = databaseSettings ?? getProviderSettings()
      const result = await window.gitOps.listPullRequestInbox({
        projects: projects.map(({ id, name, path }) => ({ id, name, path })),
        githubToken: providerSettings.github_pat,
        azureDevOpsConfigs
      })
      setItems(result.items)
      setRepositories(result.repositories)
      setErrors(result.errors)
    } catch (error) {
      setErrors([{ source: 'Octob', message: error instanceof Error ? error.message : String(error) }])
    } finally {
      setLoading(false)
    }
  }, [projects])

  useEffect(() => {
    void refresh()
    void loadPullRequestReviewSettings().then(setReviewSettings)
  }, [refresh])

  const visibleItems = useMemo(
    () => items.filter((item) =>
      (filter === 'all' || item.buckets.includes(filter)) &&
      (repositoryFilter === 'all' || item.repositoryId === repositoryFilter)
    ),
    [filter, items, repositoryFilter]
  )

  const repositoryById = useMemo(
    () => new Map(repositories.map((repository) => [repository.id, repository])),
    [repositories]
  )

  const saveRepositorySettings = async (
    repositoryId: string,
    value: PullRequestReviewRepositorySettings
  ): Promise<void> => {
    const next = { ...reviewSettings, [repositoryId]: value }
    setReviewSettings(next)
    await savePullRequestReviewSettings(next)
    toast.success('Review configuration saved')
  }

  const reviewPullRequest = async (pullRequest: PullRequestInboxItem): Promise<void> => {
    const project = projects.find((candidate) => candidate.id === pullRequest.projectId)
    if (!project || !pullRequest.projectPath) {
      toast.error('Add this repository to Octob before starting a review')
      return
    }

    setReviewingId(pullRequest.id)
    try {
      const worktreeStore = useWorktreeStore.getState()
      let worktree = (worktreeStore.worktreesByProject.get(project.id) ?? []).find(
        (candidate) =>
          (pullRequest.provider === 'github' && candidate.github_pr_number === pullRequest.number) ||
          candidate.branch_name === pullRequest.headRefName
      )

      if (!worktree) {
        const result = await window.worktreeOps.createFromBranch(
          project.id,
          project.path,
          project.name,
          pullRequest.headRefName,
          pullRequest.provider === 'github' ? pullRequest.number : undefined,
          `pr-${pullRequest.number}`,
          pullRequest.provider === 'azure-devops' && pullRequest.sourceRepositoryUrl
            ? { remoteUrl: pullRequest.sourceRepositoryUrl, ref: `refs/heads/${pullRequest.headRefName}` }
            : undefined
        )
        if (!result.success || !result.worktree) throw new Error(result.error || 'Could not create worktree')
        await worktreeStore.loadWorktrees(project.id)
        worktree = (useWorktreeStore.getState().worktreesByProject.get(project.id) ?? []).find(
          (candidate) => candidate.id === result.worktree!.id
        )
      }
      if (!worktree) throw new Error('Created worktree was not found')

      useProjectStore.getState().selectProject(project.id)
      useWorktreeStore.getState().selectWorktree(worktree.id)
      useLayoutStore.getState().setWorkspaceView('project')
      useLayoutStore.getState().setWorkspaceContentView('session')
      useLayoutStore.getState().setWorkspaceMode('chat')
      if (pullRequest.provider === 'github') {
        await useGitStore.getState().attachPR(worktree.id, pullRequest.number, pullRequest.url)
      }

      const config = reviewSettings[pullRequest.repositoryId] ?? defaultRepositorySettings()
      const sessionId = await startCodeReviewSession({
        worktreeId: worktree.id,
        projectId: project.id,
        worktreePath: worktree.path,
        targetBranch: `origin/${pullRequest.baseRefName}`,
        manual: true,
        autoFocus: true,
        agentSdk: config.agentSdk,
        modelOverride: config.model,
        promptPresetId: config.promptPresetId,
        pullRequest: {
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.url
        }
      })
      if (!sessionId) throw new Error('Could not start the review session')
      toast.success(`Review started for PR #${pullRequest.number}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setReviewingId(null)
    }
  }

  const selectedConfig = configuringRepository
    ? reviewSettings[configuringRepository.id] ?? defaultRepositorySettings()
    : defaultRepositorySettings()

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b px-6 py-5">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GitPullRequest className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Pull requests</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              PRs you created and PRs where your review or assignment is requested.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-3.5 w-3.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', 'All', items.length],
              ['authored', 'Created by me', items.filter((item) => item.buckets.includes('authored')).length],
              ['review-requested', 'Needs my review', items.filter((item) => item.buckets.includes('review-requested')).length]
            ] as Array<[InboxFilter, string, number]>).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent'
                )}
              >
                {label} <span className="ml-1 text-muted-foreground">{count}</span>
              </button>
            ))}
            <select
              value={repositoryFilter}
              onChange={(event) => setRepositoryFilter(event.target.value)}
              className="ml-auto h-8 max-w-72 rounded-md border bg-background px-2 text-xs"
            >
              <option value="all">All repositories</option>
              {repositories.map((repository) => (
                <option key={repository.id} value={repository.id}>{repository.name}</option>
              ))}
            </select>
          </div>

          {errors.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
              {errors.map((error) => (
                <div key={`${error.source}:${error.message}`} className="flex gap-2 py-0.5">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span><strong>{error.source}:</strong> {error.message}</span>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading pull requests…
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="flex h-52 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground">
              <Check className="mb-3 h-7 w-7" />
              <p className="text-sm font-medium">Inbox clear</p>
              <p className="mt-1 text-xs">No open pull requests match this filter.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              {visibleItems.map((pullRequest) => {
                const repository = repositoryById.get(pullRequest.repositoryId) ?? null
                const config = reviewSettings[pullRequest.repositoryId]
                return (
                  <div key={pullRequest.id} className="border-b p-4 last:border-b-0 hover:bg-accent/25">
                    <div className="flex items-start gap-3">
                      <ProviderIcon provider={pullRequest.provider === 'github' ? 'github' : 'azure_devops'} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{pullRequest.repositoryName}</span>
                          <span>#{pullRequest.number}</span>
                          {pullRequest.isDraft && <span className="rounded bg-muted px-1.5 py-0.5">Draft</span>}
                          {pullRequest.buckets.includes('authored') && <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-blue-500">Mine</span>}
                          {pullRequest.buckets.includes('review-requested') && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-500">Review requested</span>}
                          <span>{formatUpdatedAt(pullRequest.updatedAt)}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.systemOps.openInChrome(pullRequest.url)}
                          className="mt-1 block max-w-full truncate text-left text-sm font-medium hover:underline"
                        >
                          {pullRequest.title}
                        </button>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><UserRound className="h-3 w-3" />{pullRequest.author}</span>
                          <span className="truncate font-mono">{pullRequest.headRefName} → {pullRequest.baseRefName}</span>
                          {config && <span className="flex items-center gap-1"><Bot className="h-3 w-3" />{config.model?.modelID ?? config.agentSdk}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => setConfiguringRepository(repository)}
                          disabled={!repository}
                        >
                          <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Configure
                        </Button>
                        <Button
                          size="sm"
                          className="h-8"
                          disabled={reviewingId !== null || !pullRequest.projectId}
                          onClick={() => void reviewPullRequest(pullRequest)}
                          title={!pullRequest.projectId ? 'Add this repository to Octob to review it' : undefined}
                        >
                          {reviewingId === pullRequest.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-1.5 h-3.5 w-3.5" />}
                          Review
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.systemOps.openInChrome(pullRequest.url)} title="Open in browser">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ReviewSettingsDialog
        repository={configuringRepository}
        open={configuringRepository !== null}
        value={selectedConfig}
        onOpenChange={(open) => { if (!open) setConfiguringRepository(null) }}
        onSave={(value) => saveRepositorySettings(configuringRepository!.id, value)}
      />
    </div>
  )
}
