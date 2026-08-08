export type GrillKind = 'code' | 'general'
export type GrillVisibility = 'invite-only' | 'workspace-open'

export type GrillQuestion = {
  id: string
  prompt: string
  recommendation?: string
}

export type GrillFrontier = {
  questions: GrillQuestion[]
  drafts: Record<string, string>
}

export type SettledRound = {
  questions: GrillQuestion[]
  answers: Record<string, string>
}

export type GrillProposedIssue = {
  key: string
  title: string
  description?: string
  parentKey?: string
}

export type GrillIssueProposal = {
  status: 'proposed' | 'revision_requested' | 'confirmed' | 'dismissed'
  issues: GrillProposedIssue[]
  revisionNotes?: string
}

export type Grill = {
  id: string
  kind: GrillKind
  visibility: GrillVisibility
  agentDefinitionId: string
  repository?: string
  baseRef?: string
  frontier: GrillFrontier
  settledAnswers: SettledRound[]
  initialRequest?: string
  issueProposal?: GrillIssueProposal
  writeup?: { title: string; body: string }
  docId?: string
  sessionBranch?: string
  createdBy: string
  createdAt: number
  updatedAt: number
}

export type GrillCreatedIssue = {
  id: string
  title: string
  description: string
  parentId?: string
}

export type GrillLinkedRun = {
  id: string
  task: string
  state: string
  error?: string
  agentId: string
  provider: string
  model: string
  createdAt: number
  startedAt?: number
  completedAt?: number
}

export type GrillLatestStep = {
  kind: 'message' | 'tool_call' | 'tool_result'
  tool?: string
  text: string
  at: number
}

/** List payload may include live linked-run activity from the warm spine. */
export type GrillListItem = Grill & {
  linkedRun?: GrillLinkedRun
  latestStep?: GrillLatestStep
}
