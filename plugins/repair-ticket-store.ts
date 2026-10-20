import { Plugin } from "@opencode/plugin"

type TicketStatus = "open" | "assigned" | "changed" | "verified" | "partial" | "mismatch" | "unverified" | "blocked"

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
  statusNote?: string
}

const statusTransitions: Record<TicketStatus, readonly TicketStatus[]> = {
  open: ["assigned", "blocked"],
  assigned: ["changed", "blocked"],
  changed: ["verified", "partial", "mismatch", "unverified", "blocked"],
  verified: [],
  partial: ["assigned", "blocked"],
  mismatch: ["assigned", "blocked"],
  unverified: ["assigned", "blocked"],
  blocked: ["assigned"],
}

const statuses = Object.keys(statusTransitions) as TicketStatus[]

function ticketKey(id: string): string {
  return `ticket/${id.replace(/^#/, "")}`
}

function createTicketID(): string {
  return `rt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
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
  ].join("\n")
}

export default Plugin.define({
  id: "repair-ticket-store",
  async setup(ctx) {
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
            id: createTicketID(),
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
          const { id } = input as { id: string }
          const ticket = (await ctx.storage.get(ticketKey(id))) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          return { content: formatTicket(ticket) }
        },
      })

      editor.add({
        name: "set_status",
        description: "Change a repair ticket status with a short note.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Repair ticket ID" },
            status: { type: "string", enum: statuses, description: "New ticket status" },
            note: { type: "string", description: "Short status evidence" },
          },
          required: ["id", "status", "note"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input) => {
          const { id, status, note } = input as { id: string; status: string; note: string }
          if (!isTicketStatus(status)) throw new Error(`invalid ticket status ${status}`)
          const key = ticketKey(id)
          const ticket = (await ctx.storage.get(key)) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (!statusTransitions[ticket.status].includes(status)) {
            throw new Error(`cannot change ticket from ${ticket.status} to ${status}`)
          }
          ticket.status = status
          ticket.statusNote = limitText(note, "note", 500)
          ticket.updatedAt = new Date().toISOString()
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
          const { id } = input as { id: string }
          const key = ticketKey(id)
          const ticket = (await ctx.storage.get(key)) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (ticket.status !== "verified") throw new Error("only verified repair tickets can be deleted")
          await ctx.storage.remove(key)
          return { content: `id: ${ticket.id}\nstatus: deleted` }
        },
      })
    })
  },
})
