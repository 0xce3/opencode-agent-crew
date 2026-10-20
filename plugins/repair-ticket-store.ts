import { Plugin } from "@opencode/plugin"

type TicketStatus =
  | "open"
  | "assigned"
  | "changed"
  | "scope_match"
  | "testing"
  | "test_pass"
  | "test_failed"
  | "approval_required"
  | "verified"
  | "partial"
  | "mismatch"
  | "unverified"
  | "blocked"

type TicketEvent = {
  at: string
  actor: string
  status: TicketStatus
  note: string
}

type Ticket = {
  id: string
  status: TicketStatus
  source: string
  target: string
  cause: string
  evidence: string[]
  requiredChange: string
  nonGoals: string[]
  recommendedChecks: string[]
  createdAt: string
  updatedAt: string
  expiresAt?: string
  statusNote?: string
  events: TicketEvent[]
}

const statusTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
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
}

const statuses = Object.keys(statusTransitions) as TicketStatus[]
const archiveDurationMilliseconds = 24 * 60 * 60 * 1000
const maximumEvents = 8
const adjectives = [
  "amber", "arc", "ash", "blue", "brisk", "cinder", "clear", "cobalt",
  "coral", "crimson", "dawn", "drift", "ember", "frost", "gold", "granite",
  "harbor", "indigo", "iron", "jade", "lunar", "mist", "neon", "night",
  "onyx", "quiet", "rapid", "river", "silver", "solar", "swift", "titan",
]
const animals = [
  "badger", "beacon", "falcon", "fox", "gecko", "heron", "ibis", "kestrel",
  "lynx", "marten", "otter", "owl", "panda", "raven", "seal", "shark",
  "sparrow", "tiger", "viper", "wolf", "wren", "yak", "zebra", "zorilla",
]

function ticketKey(id: string): string {
  return `ticket/${id.replace(/^#/, "")}`
}

function isTicketStatus(value: string): value is TicketStatus {
  return statuses.includes(value as TicketStatus)
}

function limitText(value: string, field: string, maximum: number): string {
  const text = value.trim()
  if (text.length === 0) throw new Error(`${field} is required`)
  if (text.length > maximum) throw new Error(`${field} exceeds ${maximum} characters`)
  return text
}

function limitList(value: readonly string[], field: string, maximumItems: number, maximumItemLength: number): string[] {
  if (value.length > maximumItems) throw new Error(`${field} has too many items`)
  return value.map((item) => limitText(item, field, maximumItemLength))
}

function formatTicket(ticket: Ticket): string {
  const history = ticket.events.map((event) => `${event.at} ${event.actor} ${event.status}: ${event.note}`).join(" | ")
  return [
    `id: ${ticket.id}`,
    `status: ${ticket.status}`,
    `source: ${ticket.source}`,
    `target: ${ticket.target}`,
    `cause: ${ticket.cause}`,
    `evidence: ${ticket.evidence.join(" | ")}`,
    `required_change: ${ticket.requiredChange}`,
    `non_goals: ${ticket.nonGoals.join(" | ") || "none"}`,
    `recommended_checks: ${ticket.recommendedChecks.join(" | ") || "none"}`,
    `status_note: ${ticket.statusNote ?? "none"}`,
    `expires_at: ${ticket.expiresAt ?? "none"}`,
    `history: ${history || "none"}`,
  ].join("\n")
}

export default Plugin.define({
  id: "repair-ticket-store",
  async setup(ctx) {
    const pruneExpired = async (): Promise<number> => {
      const now = Date.now()
      const page = await ctx.storage.scan({ prefix: "ticket/", limit: 100 })
      let removed = 0
      for (const entry of page.entries) {
        const ticket = entry.value as Ticket
        if (ticket.status === "verified" && ticket.expiresAt && Date.parse(ticket.expiresAt) <= now) {
          await ctx.storage.remove(entry.key)
          removed += 1
        }
      }
      return removed
    }

    const createTicketID = async (): Promise<string> => {
      const page = await ctx.storage.scan({ prefix: "ticket/", limit: 100 })
      const existingIDs = new Set(page.entries.map((entry) => entry.key.slice("ticket/".length)))
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const adjective = adjectives[Math.floor(Math.random() * adjectives.length)]
        const animal = animals[Math.floor(Math.random() * animals.length)]
        const id = `${adjective}_${animal}`
        if (!existingIDs.has(id)) return id
      }
      throw new Error("could not allocate a unique repair ticket ID")
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "repair_ticket",
        description: "Stores compact repair tickets for handoff between agents.",
      })

      editor.add({
        name: "create",
        description: "Create a compact repair ticket and return its ID.",
        input: {
          type: "object",
          properties: {
            source: { type: "string", description: "Creating agent ID" },
            target: { type: "string", description: "Exact problem to change" },
            cause: { type: "string", description: "Confirmed root cause" },
            evidence: { type: "array", items: { type: "string" }, description: "Short evidence only" },
            required_change: { type: "string", description: "Smallest required change" },
            non_goals: { type: "array", items: { type: "string" }, description: "Relevant scope limits" },
            recommended_checks: { type: "array", items: { type: "string" }, description: "Checks for the user" },
          },
          required: ["source", "target", "cause", "evidence", "required_change", "non_goals", "recommended_checks"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input) => {
          await pruneExpired()
          const value = input as {
            source: string
            target: string
            cause: string
            evidence: string[]
            required_change: string
            non_goals: string[]
            recommended_checks: string[]
          }
          const now = new Date().toISOString()
          const ticket: Ticket = {
            id: await createTicketID(),
            status: "open",
            source: limitText(value.source, "source", 80),
            target: limitText(value.target, "target", 400),
            cause: limitText(value.cause, "cause", 700),
            evidence: limitList(value.evidence, "evidence", 5, 500),
            requiredChange: limitText(value.required_change, "required_change", 700),
            nonGoals: limitList(value.non_goals, "non_goals", 8, 250),
            recommendedChecks: limitList(value.recommended_checks, "recommended_checks", 8, 250),
            createdAt: now,
            updatedAt: now,
            events: [{ at: now, actor: limitText(value.source, "source", 80), status: "open", note: "created" }],
          }
          await ctx.storage.set(ticketKey(ticket.id), ticket)
          return { content: `id: ${ticket.id}\nstatus: open` }
        },
      })

      editor.add({
        name: "get",
        description: "Load one repair ticket by ID.",
        input: {
          type: "object",
          properties: { id: { type: "string", description: "Repair ticket ID" } },
          required: ["id"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input) => {
          await pruneExpired()
          const { id } = input as { id: string }
          const ticket = (await ctx.storage.get(ticketKey(id))) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          return { content: formatTicket(ticket) }
        },
      })

      editor.add({
        name: "set_status",
        description: "Change a repair ticket status and append a short history event.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Repair ticket ID" },
            actor: { type: "string", description: "Agent changing the ticket" },
            status: { type: "string", enum: statuses, description: "New ticket status" },
            note: { type: "string", description: "Short status evidence" },
          },
          required: ["id", "actor", "status", "note"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input) => {
          await pruneExpired()
          const { id, actor, status, note } = input as { id: string; actor: string; status: string; note: string }
          if (!isTicketStatus(status)) throw new Error(`invalid ticket status ${status}`)
          const key = ticketKey(id)
          const ticket = (await ctx.storage.get(key)) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (!statusTransitions[ticket.status].includes(status)) {
            throw new Error(`cannot change ticket from ${ticket.status} to ${status}`)
          }
          const now = new Date().toISOString()
          ticket.status = status
          ticket.statusNote = limitText(note, "note", 500)
          ticket.updatedAt = now
          ticket.events = [...(ticket.events ?? []), {
            at: now,
            actor: limitText(actor, "actor", 80),
            status,
            note: ticket.statusNote,
          }].slice(-maximumEvents)
          if (status === "verified") {
            ticket.expiresAt = new Date(Date.now() + archiveDurationMilliseconds).toISOString()
          }
          await ctx.storage.set(key, ticket)
          return { content: `id: ${ticket.id}\nstatus: ${ticket.status}` }
        },
      })

      editor.add({
        name: "delete",
        description: "Delete a verified repair ticket.",
        input: {
          type: "object",
          properties: { id: { type: "string", description: "Repair ticket ID" } },
          required: ["id"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input) => {
          await pruneExpired()
          const { id } = input as { id: string }
          const key = ticketKey(id)
          const ticket = (await ctx.storage.get(key)) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (ticket.status !== "verified") throw new Error("only verified repair tickets can be deleted")
          await ctx.storage.remove(key)
          return { content: `id: ${ticket.id}\nstatus: deleted` }
        },
      })

      editor.add({
        name: "prune",
        description: "Delete expired verified repair tickets.",
        input: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async () => {
          const removed = await pruneExpired()
          return { content: `removed: ${removed}` }
        },
      })
    })
  },
})
