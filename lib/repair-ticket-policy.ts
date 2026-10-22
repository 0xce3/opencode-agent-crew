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
  }
  if (status === "changed" && !ticket.ticketFiles?.length) {
    throw new Error("record ticket file fingerprints before marking changed")
  }
  if (status === "verified" && (!ticket.scopeMatched || !ticket.ticketFiles?.length)) {
    throw new Error("independent scope match and ticket file fingerprints required")
  }
}
