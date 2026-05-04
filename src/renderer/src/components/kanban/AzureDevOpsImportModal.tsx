import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import {
  Download,
  Search,
  ExternalLink,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  ListFilter,
  ChevronDown
} from 'lucide-react'
import { ProviderIcon } from '@/components/ui/provider-icon'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { useKanbanStore } from '@/stores/useKanbanStore'
import { getProviderSettings } from '@/lib/provider-settings'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface RemoteIssue {
  externalId: string
  title: string
  body: string | null
  state: 'open' | 'closed' | 'in_progress'
  url: string
  createdAt: string
  updatedAt: string
}

interface AzureDevOpsImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
}

const PER_PAGE = 30

type QueryMode = 'builder' | 'wiql'

interface BuilderClause {
  id: string
  fieldKey: string
  operator: string
  value: string
}

const FIELD_DEFS: Record<
  string,
  { label: string; ref: string; kind: 'date' | 'string' | 'number' }
> = {
  changedDate: { label: 'Changed Date', ref: '[System.ChangedDate]', kind: 'date' },
  createdDate: { label: 'Created Date', ref: '[System.CreatedDate]', kind: 'date' },
  workItemType: { label: 'Work Item Type', ref: '[System.WorkItemType]', kind: 'string' },
  state: { label: 'State', ref: '[System.State]', kind: 'string' },
  title: { label: 'Title', ref: '[System.Title]', kind: 'string' },
  assignedTo: { label: 'Assigned To', ref: '[System.AssignedTo]', kind: 'string' },
  id: { label: 'ID', ref: '[System.Id]', kind: 'number' },
  areaPath: { label: 'Area Path', ref: '[System.AreaPath]', kind: 'string' },
  iterationPath: { label: 'Iteration Path', ref: '[System.IterationPath]', kind: 'string' }
}

const FIELD_ORDER = Object.keys(FIELD_DEFS)

const OPS_DATE = ['=', '<>', '>', '<', '>=', '<=']
const OPS_STRING = ['=', '<>', 'CONTAINS']
const OPS_NUMBER = ['=', '<>', '>', '<', '>=', '<=']

function operatorsForField(fieldKey: string): string[] {
  const def = FIELD_DEFS[fieldKey]
  if (!def) return OPS_STRING
  if (def.kind === 'date') return OPS_DATE
  if (def.kind === 'number') return OPS_NUMBER
  return OPS_STRING
}

function escapeWiqlLiteral(s: string): string {
  return s.replace(/'/g, "''")
}

function isAnyWorkItemType(raw: string): boolean {
  const t = raw.trim().toLowerCase()
  return t === '' || t === 'any' || t === '[any]'
}

/** Macros (@Today, @Today - 30, etc.) and numeric IDs stay unquoted. */
function formatWiqlOperand(kind: 'date' | 'string' | 'number', raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (v.startsWith('@')) return v
  if (kind === 'number') {
    if (!/^\d+$/.test(v)) return null
    return v
  }
  return `'${escapeWiqlLiteral(v)}'`
}

function clauseToWiqlFragment(clause: BuilderClause): string | null {
  const def = FIELD_DEFS[clause.fieldKey]
  if (!def) return null
  if (def.ref === '[System.WorkItemType]' && isAnyWorkItemType(clause.value)) {
    return null
  }
  if (def.ref === '[System.AssignedTo]' && !clause.value.trim()) {
    return null
  }

  const op = clause.operator
  if (op === 'CONTAINS') {
    const inner = formatWiqlOperand('string', clause.value)
    if (!inner) return null
    return `${def.ref} CONTAINS ${inner}`
  }

  const operand = formatWiqlOperand(def.kind, clause.value)
  if (!operand) return null
  return `${def.ref} ${op} ${operand}`
}

function buildWiqlFromClauses(clauses: BuilderClause[]): string | null {
  const parts = clauses.map(clauseToWiqlFragment).filter(Boolean) as string[]
  if (parts.length === 0) return null
  const where = parts.join(' AND ')
  return `SELECT [System.Id], [System.Title] FROM WorkItems WHERE ${where}`
}

function newClause(partial?: Partial<Omit<BuilderClause, 'id'>>): BuilderClause {
  return {
    id: crypto.randomUUID(),
    fieldKey: partial?.fieldKey ?? 'state',
    operator: partial?.operator ?? '=',
    value: partial?.value ?? ''
  }
}

function defaultBuilderClauses(): BuilderClause[] {
  return [
    newClause({ fieldKey: 'changedDate', operator: '>', value: '@Today - 180' }),
    newClause({ fieldKey: 'assignedTo', operator: '=', value: '' }),
    newClause({ fieldKey: 'state', operator: '=', value: 'Approved' })
  ]
}

function azureRepoSlug(settings: Record<string, string>): string | null {
  const org = settings.azure_devops_organization?.trim()
  const proj = settings.azure_devops_project?.trim()
  return org && proj ? `${org}/${proj}` : null
}

const selectTriggerClass =
  'h-8 text-xs rounded-md border border-input bg-background px-2 text-foreground shrink-0'

function PicklistSelect({
  value,
  onChange,
  options,
  loading,
  anyLabel
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  loading: boolean
  anyLabel: string
}) {
  const trimmed = value.trim()
  const extras =
    trimmed && !options.some((o) => o.toLowerCase() === trimmed.toLowerCase()) ? [trimmed] : []
  const merged = [...new Set([...options, ...extras])].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )
  return (
    <select
      className={cn(selectTriggerClass, 'w-full min-w-0')}
      value={value}
      disabled={loading}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{anyLabel}</option>
      {merged.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  )
}

function AssigneeClauseValue({
  value,
  onChange,
  disabled
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<Array<{ displayName: string; uniqueName: string }>>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setSearch('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setLoading(true)
      window.ticketImport
        .azureDevOpsSearchUsers(getProviderSettings(), search)
        .then(setUsers)
        .finally(() => setLoading(false))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [open, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className="h-8 w-full justify-between text-xs font-normal px-2 font-sans"
        >
          <span className={cn('truncate text-left', !value && 'text-muted-foreground')}>
            {value || 'Escolher usuário…'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,22rem)] p-2" align="start">
        <Input
          className="h-8 text-xs mb-2"
          placeholder="Buscar nome ou e-mail…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="max-h-52 overflow-y-auto space-y-0.5">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-[11px] text-muted-foreground px-1 py-2 leading-snug">
              Nenhum resultado. Verifique o escopo <span className="font-mono">Graph (Read)</span> no PAT,
              ou informe o nome manualmente abaixo.
            </p>
          ) : (
            users.map((u) => (
              <button
                key={`${u.uniqueName}\0${u.displayName}`}
                type="button"
                className="w-full text-left rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors"
                onClick={() => {
                  onChange(u.displayName)
                  setOpen(false)
                }}
              >
                <div className="font-medium truncate">{u.displayName}</div>
                {u.uniqueName ? (
                  <div className="text-[10px] text-muted-foreground truncate">{u.uniqueName}</div>
                ) : null}
              </button>
            ))
          )}
        </div>
        <Input
          className="h-7 text-[11px] mt-2"
          placeholder="Nome exato (manual)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </PopoverContent>
    </Popover>
  )
}

export function AzureDevOpsImportModal({
  open,
  onOpenChange,
  projectId
}: AzureDevOpsImportModalProps) {
  const loadTickets = useKanbanStore((s) => s.loadTickets)

  const [repoSlug, setRepoSlug] = useState<string | null>(null)
  const [queryMode, setQueryMode] = useState<QueryMode>('builder')
  const [builderClauses, setBuilderClauses] = useState<BuilderClause[]>(defaultBuilderClauses)
  const [wiqlInput, setWiqlInput] = useState('')
  const [committedWiql, setCommittedWiql] = useState<string | null>(null)

  const [azureStates, setAzureStates] = useState<string[]>([])
  const [azureWitTypes, setAzureWitTypes] = useState<string[]>([])
  const [picklistsLoading, setPicklistsLoading] = useState(false)

  const [issues, setIssues] = useState<RemoteIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [wiqlError, setWiqlError] = useState<string | null>(null)
  const pageTokensRef = useRef<(string | null)[]>([null])

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(
    null
  )

  const allFetchedIssuesRef = useRef<Map<string, RemoteIssue>>(new Map())
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const settings = getProviderSettings()
    setRepoSlug(azureRepoSlug(settings))
    setQueryMode('builder')
    setBuilderClauses(defaultBuilderClauses())
    const built = buildWiqlFromClauses(defaultBuilderClauses())
    setWiqlInput(built ?? '')
    setCommittedWiql(null)
    setIssues([])
    setSelected(new Set())
    allFetchedIssuesRef.current = new Map()
    setPage(1)
    pageTokensRef.current = [null]
    setWiqlError(null)
    setImportProgress(null)
  }, [open])

  useEffect(() => {
    if (!open || !repoSlug) return
    const s = getProviderSettings()
    setPicklistsLoading(true)
    void Promise.all([
      window.ticketImport.azureDevOpsListStates(s),
      window.ticketImport.azureDevOpsListWorkItemTypes(s)
    ])
      .then(([states, types]) => {
        setAzureStates(states)
        setAzureWitTypes(types)
      })
      .finally(() => setPicklistsLoading(false))
  }, [open, repoSlug])

  useEffect(() => {
    if (!open || !repoSlug || committedWiql === null) return
    setLoading(true)
    setWiqlError(null)

    const token = pageTokensRef.current[page - 1] ?? undefined

    window.ticketImport
      .listIssues(
        'azure_devops',
        repoSlug,
        { page, perPage: PER_PAGE, state: 'all', search: committedWiql, nextPageToken: token },
        getProviderSettings()
      )
      .then((result) => {
        setIssues(result.issues)
        setHasNextPage(result.hasNextPage)
        for (const issue of result.issues) {
          allFetchedIssuesRef.current.set(issue.externalId, issue)
        }
        if (result.nextPageToken) {
          pageTokensRef.current[page] = result.nextPageToken
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        setWiqlError(message)
        setIssues([])
        setHasNextPage(false)
      })
      .finally(() => setLoading(false))
  }, [open, repoSlug, committedWiql, page])

  const runSearchWithWiql = (wiql: string): void => {
    const trimmed = wiql.trim()
    if (!trimmed) return
    setPage(1)
    pageTokensRef.current = [null]
    allFetchedIssuesRef.current = new Map()
    setSelected(new Set())
    setCommittedWiql(trimmed)
  }

  const handleSearch = (): void => {
    if (queryMode === 'builder') {
      const built = buildWiqlFromClauses(builderClauses)
      if (!built) {
        toast.error('Adicione pelo menos um filtro válido (campo, operador e valor).')
        return
      }
      setWiqlInput(built)
      runSearchWithWiql(built)
      return
    }
    runSearchWithWiql(wiqlInput)
  }

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSearch()
    }
  }

  const updateClause = (id: string, patch: Partial<BuilderClause>): void => {
    setBuilderClauses((rows) =>
      rows.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if (patch.fieldKey != null && patch.fieldKey !== row.fieldKey) {
          const ops = operatorsForField(patch.fieldKey)
          if (!ops.includes(next.operator)) {
            next.operator = ops[0] ?? '='
          }
        }
        return next
      })
    )
  }

  const addClause = (): void => {
    setBuilderClauses((rows) => [...rows, newClause({ fieldKey: 'title', operator: 'CONTAINS' })])
  }

  const removeClause = (id: string): void => {
    setBuilderClauses((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))
  }

  const syncWiqlFromBuilder = (): void => {
    const built = buildWiqlFromClauses(builderClauses)
    setWiqlInput(built ?? '')
  }

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = (): void => {
    const currentPageIds = issues.map((i) => i.externalId)
    const allCurrentPageSelected = currentPageIds.every((id) => selected.has(id))

    setSelected((prev) => {
      const next = new Set(prev)
      if (allCurrentPageSelected) {
        for (const id of currentPageIds) next.delete(id)
      } else {
        for (const id of currentPageIds) next.add(id)
      }
      return next
    })
  }

  const handleImport = async (): Promise<void> => {
    if (!repoSlug || selected.size === 0) return
    setImporting(true)

    const toImport: RemoteIssue[] = []
    for (const id of selected) {
      const issue = allFetchedIssuesRef.current.get(id)
      if (issue) toImport.push(issue)
    }
    setImportProgress({ current: 0, total: toImport.length })

    try {
      const result = await window.ticketImport.importIssues(
        'azure_devops',
        projectId,
        repoSlug,
        toImport.map((i) => ({
          externalId: i.externalId,
          title: i.title,
          body: i.body,
          state: i.state,
          url: i.url
        }))
      )

      setImportProgress({ current: toImport.length, total: toImport.length })

      const msgs: string[] = []
      if (result.imported.length > 0)
        msgs.push(`Imported ${result.imported.length} work item${result.imported.length > 1 ? 's' : ''}`)
      if (result.skipped.length > 0)
        msgs.push(`Skipped ${result.skipped.length} duplicate${result.skipped.length > 1 ? 's' : ''}`)
      toast.success(msgs.join('. '))

      await loadTickets(projectId)
      onOpenChange(false)
    } catch (err) {
      toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
      setImportProgress(null)
    }
  }

  const stateBadgeClass = (state: RemoteIssue['state']): string => {
    if (state === 'open') return 'bg-green-500/10 text-green-500'
    if (state === 'in_progress') return 'bg-amber-500/10 text-amber-500'
    return 'bg-purple-500/10 text-purple-500'
  }

  const stateLabel = (state: RemoteIssue['state']): string => {
    if (state === 'in_progress') return 'in progress'
    return state
  }

  const previewWiql = buildWiqlFromClauses(builderClauses)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[72vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ProviderIcon provider="azure_devops" />
            Import from Azure DevOps
            {repoSlug && (
              <span className="text-xs font-normal text-muted-foreground ml-1">{repoSlug}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col">
          {!repoSlug && (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-sm text-center text-muted-foreground">
              <AlertCircle className="h-6 w-6 text-amber-500 shrink-0" />
              <p>
                Azure DevOps is not configured.{' '}
                <span className="text-foreground">
                  Go to <strong>Settings &gt; Integrations</strong> to add organization, project, and
                  personal access token.
                </span>
              </p>
            </div>
          )}

          {repoSlug && (
            <>
              <div className="px-4 pt-3 pb-2 border-b shrink-0 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-md border border-border p-0.5 bg-muted/40">
                    <button
                      type="button"
                      onClick={() => {
                        setQueryMode('builder')
                        syncWiqlFromBuilder()
                      }}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        queryMode === 'builder'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <ListFilter className="h-3 w-3" />
                        Editor
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        syncWiqlFromBuilder()
                        setQueryMode('wiql')
                        setTimeout(() => textareaRef.current?.focus(), 0)
                      }}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                        queryMode === 'wiql'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      WIQL
                    </button>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    Tipo de consulta: lista plana de work items (filtros combinados com{' '}
                    <span className="font-mono text-[10px]">AND</span>). Estados e tipos vêm do
                    projeto; usuários via Graph (escopo <span className="font-mono">Graph Read</span>{' '}
                    no PAT).
                  </span>
                </div>

                {queryMode === 'builder' ? (
                  <div className="flex flex-col gap-2">
                    <div className="hidden sm:grid sm:grid-cols-[minmax(7rem,9rem)_minmax(7rem,9rem)_1fr_auto] gap-2 px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span>Campo</span>
                      <span>Operador</span>
                      <span>Valor</span>
                      <span className="w-8" />
                    </div>
                    <div className="rounded-md border border-border bg-muted/20 divide-y divide-border max-h-[min(200px,28vh)] overflow-y-auto">
                      {builderClauses.map((clause, idx) => {
                        const ops = operatorsForField(clause.fieldKey)
                        const def = FIELD_DEFS[clause.fieldKey]
                        const placeholder =
                          def?.ref === '[System.WorkItemType]'
                            ? 'vazio = qualquer tipo'
                            : def?.kind === 'date'
                              ? '@Today - 180 ou data'
                              : ''

                        let valueCell
                        if (clause.fieldKey === 'state') {
                          valueCell = (
                            <PicklistSelect
                              value={clause.value}
                              onChange={(v) => updateClause(clause.id, { value: v })}
                              options={azureStates}
                              loading={picklistsLoading}
                              anyLabel="[Qualquer]"
                            />
                          )
                        } else if (clause.fieldKey === 'workItemType') {
                          valueCell = (
                            <PicklistSelect
                              value={clause.value}
                              onChange={(v) => updateClause(clause.id, { value: v })}
                              options={azureWitTypes}
                              loading={picklistsLoading}
                              anyLabel="[Qualquer]"
                            />
                          )
                        } else if (clause.fieldKey === 'assignedTo') {
                          valueCell = (
                            <AssigneeClauseValue
                              value={clause.value}
                              onChange={(v) => updateClause(clause.id, { value: v })}
                            />
                          )
                        } else {
                          valueCell = (
                            <Input
                              className="h-8 text-xs font-mono min-w-0"
                              value={clause.value}
                              placeholder={placeholder}
                              onChange={(e) =>
                                updateClause(clause.id, { value: e.target.value })
                              }
                            />
                          )
                        }

                        return (
                          <div
                            key={clause.id}
                            className="flex flex-col gap-2 sm:grid sm:grid-cols-[minmax(7rem,9rem)_minmax(7rem,9rem)_1fr_auto] sm:items-center p-2.5 gap-x-2"
                          >
                            <label className="sm:hidden text-[10px] text-muted-foreground">
                              Campo {idx + 1}
                            </label>
                            <select
                              className={selectTriggerClass}
                              value={clause.fieldKey}
                              onChange={(e) =>
                                updateClause(clause.id, { fieldKey: e.target.value })
                              }
                            >
                              {FIELD_ORDER.map((key) => (
                                <option key={key} value={key}>
                                  {FIELD_DEFS[key].label}
                                </option>
                              ))}
                            </select>
                            <select
                              className={selectTriggerClass}
                              value={clause.operator}
                              onChange={(e) =>
                                updateClause(clause.id, { operator: e.target.value })
                              }
                            >
                              {ops.map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>
                            <div className="min-w-0">{valueCell}</div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                              disabled={builderClauses.length <= 1}
                              onClick={() => removeClause(clause.id)}
                              title="Remover cláusula"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={addClause}
                      >
                        <Plus className="h-3 w-3 mr-1.5" />
                        Adicionar cláusula
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSearch}
                        disabled={loading || !previewWiql}
                        className="h-7 text-xs"
                      >
                        <Search className="h-3 w-3 mr-1.5" />
                        Executar consulta
                      </Button>
                    </div>
                    {previewWiql && (
                      <p className="text-[10px] text-muted-foreground font-mono break-all leading-relaxed opacity-90">
                        {previewWiql}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <textarea
                      ref={textareaRef}
                      value={wiqlInput}
                      onChange={(e) => setWiqlInput(e.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder={`SELECT [System.Id], [System.Title] FROM WorkItems WHERE ...`}
                      rows={4}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono text-[12px]"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        WIQL ·{' '}
                        <kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono">
                          ⌘↵
                        </kbd>{' '}
                        /{' '}
                        <kbd className="px-1 py-0.5 rounded border border-border text-[10px] font-mono">
                          Ctrl↵
                        </kbd>
                      </span>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleSearch}
                        disabled={loading || !wiqlInput.trim()}
                        className="h-7 text-xs"
                      >
                        <Search className="h-3 w-3 mr-1.5" />
                        Executar consulta
                      </Button>
                    </div>
                  </div>
                )}

                {wiqlError && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{wiqlError}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading work items...
                  </div>
                ) : committedWiql === null ? (
                  <div className="flex items-center justify-center p-8 text-sm text-muted-foreground text-center px-6">
                    Monte os filtros no editor (como no Azure DevOps) ou edite o WIQL, depois clique em
                    Executar consulta.
                  </div>
                ) : issues.length === 0 && !wiqlError ? (
                  <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
                    No work items found.
                  </div>
                ) : issues.length > 0 ? (
                  <div className="divide-y">
                    <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 sticky top-0 z-10">
                      <Checkbox
                        checked={
                          issues.length > 0 && issues.every((i) => selected.has(i.externalId))
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                      <span className="text-xs text-muted-foreground">
                        {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                      </span>
                    </div>

                    {issues.map((issue) => (
                      <div
                        key={issue.externalId}
                        className="flex items-start gap-3 px-4 py-2.5 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => toggleSelect(issue.externalId)}
                      >
                        <Checkbox
                          checked={selected.has(issue.externalId)}
                          onCheckedChange={() => toggleSelect(issue.externalId)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">
                              #{issue.externalId}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${stateBadgeClass(issue.state)}`}
                            >
                              {stateLabel(issue.state)}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate mt-0.5">{issue.title}</p>
                        </div>
                        <a
                          href={issue.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {(page > 1 || hasNextPage) && (
                <div className="flex items-center justify-between px-4 py-2 border-t shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-muted-foreground">Page {page}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!hasNextPage || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="px-4 py-3 border-t shrink-0">
          {importProgress && (
            <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Importing {importProgress.current}/{importProgress.total}...
            </div>
          )}
          <Button
            onClick={() => void handleImport()}
            disabled={selected.size === 0 || importing || !repoSlug}
            size="sm"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
