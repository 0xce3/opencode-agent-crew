export const statusTransitions = {
  open: ["assigned", "blocked"],
  assigned: ["changed", "blocked"],
  changed: ["scope_match", "partial", "mismatch", "unverified", "blocked"],
  scope_match: ["testing", "blocked"],
  testing: ["test_pass", "test_failed", "approval_required", "blocked"],
  test_pass: ["verified"],
  test_failed: ["assigned", "blocked"],
  approval_required: ["testing", "blocked"],
  verified: [],
  partial: ["assigned", "blocked"],
  mismatch: ["assigned", "blocked"],
  unverified: ["assigned", "blocked"],
  blocked: ["assigned"],
} as const

export type TicketStatus = keyof typeof statusTransitions

const owner: Partial<Record<TicketStatus, string>> = {
  assigned: "ripperdoc",
  changed: "ripperdoc",
  scope_match: "watchdog",
  partial: "watchdog",
  mismatch: "watchdog",
  unverified: "watchdog",
  testing: "test-pilot",
  test_pass: "test-pilot",
  test_failed: "test-pilot",
  approval_required: "test-pilot",
  verified: "watchdog",
  blocked: "citadel",
}

export type RepairState = {
  status: TicketStatus
  repairAttempts: number
  approvedPlan?: string
  proposedPlan?: string
  scopeMatched?: boolean
  ticketFiles?: readonly { path: string; sha256: string }[]
  plannedPaths?: readonly string[]
  assignedSessionID?: string
}

export function canEditRepairFile(
  ticket: RepairState | undefined,
  sessionID: string,
  resources: readonly string[],
): boolean {
  return !!ticket && ticket.status === "assigned" &&
    ticket.assignedSessionID === sessionID &&
    !!ticket.plannedPaths?.length && resources.length > 0 &&
    resources.every((resource) => ticket.plannedPaths!.includes(resource))
}

type PermissionEvent = {
  agent?: string
  sessionID: string
  action: string
  resources: readonly string[]
  effect: "allow" | "ask" | "deny"
  message?: string
}

export function createRepairPermissionGuard(deps: {
  sessionAgent: (sessionID: string) => Promise<string | undefined>
  ticketForSession: (sessionID: string) => Promise<RepairState | undefined>
  safePath: (path: string) => Promise<void>
}) {
  return async (event: PermissionEvent): Promise<void> => {
    if (event.action !== "edit" && event.action !== "shell") return
    const agent = event.agent ?? await deps.sessionAgent(event.sessionID)
    if (!agent) throw new Error("cannot identify agent for repair permission check")
    if (agent !== "ripperdoc") return
    event.effect = "deny"
    event.message = "Ripperdoc may edit only approved ticket files after assignment; shell is disabled"
    if (event.action === "shell") return
    const ticket = await deps.ticketForSession(event.sessionID)
    if (!canEditRepairFile(ticket, event.sessionID, event.resources)) return
    for (const resource of event.resources) await deps.safePath(resource)
    event.effect = "allow"
  }
}

export function assertTransition(ticket: RepairState, status: TicketStatus, actor: string): void {
  if (!(statusTransitions[ticket.status] as readonly string[]).includes(status)) {
    throw new Error(`cannot change ticket from ${ticket.status} to ${status}`)
  }
  if (owner[status] !== actor) throw new Error(`${status} requires ${owner[status]} as actor`)
  if (status === "assigned") {
    if (ticket.repairAttempts >= 2) throw new Error("repair attempt limit reached (2)")
    if (!ticket.proposedPlan || ticket.approvedPlan !== ticket.proposedPlan) {
      throw new Error("the current repair plan needs user approval")
    }
    if (!ticket.plannedPaths?.length) throw new Error("an approved file scope is required")
  }
  if (status === "changed" && !ticket.ticketFiles?.length) {
    throw new Error("record ticket file fingerprints before marking changed")
  }
  if (status === "verified" && (!ticket.scopeMatched || !ticket.ticketFiles?.length)) {
    throw new Error("independent scope match and ticket file fingerprints required")
  }
}
