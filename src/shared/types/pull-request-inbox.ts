export type PullRequestProvider = 'github' | 'azure-devops'

export type PullRequestBucket = 'authored' | 'review-requested'

export interface PullRequestInboxProject {
  id: string
  name: string
  path: string
}

export interface AzureDevOpsPullRequestSource {
  id: string
  label: string
  settings: Record<string, string>
}

export interface PullRequestInboxRequest {
  projects: PullRequestInboxProject[]
  githubToken?: string
  azureDevOpsConfigs: AzureDevOpsPullRequestSource[]
}

export interface PullRequestInboxItem {
  id: string
  provider: PullRequestProvider
  number: number
  title: string
  url: string
  author: string
  authorAvatarUrl?: string
  repositoryId: string
  repositoryName: string
  bucket: PullRequestBucket
  buckets: PullRequestBucket[]
  headRefName: string
  sourceRepositoryUrl?: string
  baseRefName: string
  isDraft: boolean
  updatedAt: string
  projectId?: string
  projectPath?: string
}

export interface PullRequestInboxRepository {
  id: string
  provider: PullRequestProvider
  name: string
  projectId?: string
  projectPath?: string
}

export interface PullRequestInboxResponse {
  success: boolean
  items: PullRequestInboxItem[]
  repositories: PullRequestInboxRepository[]
  errors: Array<{ source: string; message: string }>
}
