import { DEFAULT_REVIEW_PROMPT_PRESET_ID, resolveReviewPromptTemplateBody } from '@/constants/reviewPrompts'
import { toast } from '@/lib/toast'
import { messageSendTimes, userExplicitSendTimes, lastSendMode } from '@/lib/message-send-times'
import { snapshotTokenBaseline } from '@/lib/token-baselines'
import { useGitStore } from '@/stores/useGitStore'
import { useSessionStore } from '@/stores/useSessionStore'
import { resolveModelForSdk, useSettingsStore } from '@/stores/useSettingsStore'
import { useWorktreeStatusStore } from '@/stores/useWorktreeStatusStore'

interface StartCodeReviewOptions {
  worktreeId: string
  projectId: string
  worktreePath: string
  targetBranch?: string
  manual?: boolean
}

export async function startCodeReviewSession({
  worktreeId,
  projectId,
  worktreePath,
  targetBranch,
  manual = false
}: StartCodeReviewOptions): Promise<string | null> {
  const statusStore = useWorktreeStatusStore.getState()

  if (!manual) {
    if (!useSettingsStore.getState().autoCodeReviewEnabled) return null
    if (statusStore.reviewSessionByWorktree[worktreeId]) return null
    if (statusStore.completedReviewSessionByWorktree[worktreeId]) return null
  }

  const currentBranchInfo = useGitStore.getState().branchInfoByWorktree.get(worktreePath)
  const currentReviewTarget = useGitStore.getState().reviewTargetBranch.get(worktreeId)
  const target = targetBranch || currentReviewTarget || currentBranchInfo?.tracking || 'origin/main'
  const branchName = currentBranchInfo?.name || 'unknown'

  const settings = useSettingsStore.getState()
  const presetId = settings.reviewPromptPresetId?.trim() || DEFAULT_REVIEW_PROMPT_PRESET_ID
  const reviewTemplate = resolveReviewPromptTemplateBody(presetId, settings.codeReviewPromptTemplates ?? [])

  const prompt = [
    reviewTemplate,
    '',
    '---',
    '',
    `Compare the current branch (${branchName}) against ${target}.`,
    `Use \`git diff ${target}...HEAD\` to see all changes.`
  ].join('\n')

  const sessionStore = useSessionStore.getState()
  const result = await sessionStore.createSession(worktreeId, projectId, undefined, undefined, { autoFocus: false })
  if (!result.success || !result.session) {
    if (manual) toast.error('Failed to create review session')
    return null
  }

  await sessionStore.updateSessionName(
    result.session.id,
    `Code Review — ${branchName} vs ${target}`
  )

  statusStore.setReviewSession(worktreeId, result.session.id)

  const sessionId = result.session.id
  const agentSdk = result.session.agent_sdk
  const sessionModel = result.session.model_provider_id && result.session.model_id
    ? { providerID: result.session.model_provider_id, modelID: result.session.model_id, variant: result.session.model_variant ?? undefined }
    : resolveModelForSdk(agentSdk || 'opencode') ?? undefined

  void (async () => {
    try {
      const connectResult = await window.opencodeOps.connect(worktreePath, sessionId)
      if (connectResult.success && connectResult.sessionId) {
        sessionStore.setOpenCodeSessionId(sessionId, connectResult.sessionId)
        window.db.session.update(sessionId, { opencode_session_id: connectResult.sessionId }).catch(() => {})

        messageSendTimes.set(sessionId, Date.now())
        userExplicitSendTimes.set(sessionId, Date.now())
        snapshotTokenBaseline(sessionId)
        lastSendMode.set(sessionId, 'build')
        useWorktreeStatusStore.getState().setSessionStatus(sessionId, 'working')

        await window.opencodeOps.prompt(worktreePath, connectResult.sessionId, [
          { type: 'text', text: prompt }
        ], sessionModel)
      } else {
        sessionStore.setPendingMessage(sessionId, prompt)
      }
    } catch {
      sessionStore.setPendingMessage(sessionId, prompt)
    }
  })()

  return sessionId
}
