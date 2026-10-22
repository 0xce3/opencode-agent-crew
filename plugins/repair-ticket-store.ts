import { Plugin } from "@opencode/plugin"
import { createHash } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { assertTransition, canEditRepairFile, createRepairPermissionGuard, statusTransitions, type TicketStatus } from "../lib/repair-ticket-policy"

type TicketEvent = {
  at: string
  actor: string
  status: TicketStatus
  note: string
}

type TicketFile = {
  path: string
  sha256: string
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
  repairAttempts: number
  workspaceBaseline?: string[]
  ticketFiles?: TicketFile[]
  proposedPlan?: string
  approvedPlan?: string
  scopeMatched?: boolean
  plannedPaths?: string[]
  assignedSessionID?: string
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

function validatePath(value: string): string {
  const path = limitText(value, "path", 300)
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === ".." || part === ".git")) {
    throw new Error("path must be a normalized workspace-relative file path")
  }
  return path
}

function validateTicketFiles(value: readonly TicketFile[]): TicketFile[] {
  if (value.length > 30) throw new Error("ticket_files has too many items")
  return value.map((file) => {
    const sha256 = limitText(file.sha256, "sha256", 64).toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("sha256 must be a SHA-256 digest")
    return { path: validatePath(file.path), sha256 }
  })
}

function formatTicket(ticket: Ticket): string {
  const history = (ticket.events ?? []).map((event) => `${event.at} ${event.actor} ${event.status}: ${event.note}`).join(" | ")
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
    `repair_attempts: ${ticket.repairAttempts ?? (ticket.events ?? []).filter((event) => event.status === "assigned").length}`,
    `workspace_baseline: ${(ticket.workspaceBaseline ?? []).join(" | ") || "none"}`,
    `ticket_files: ${(ticket.ticketFiles ?? []).map((file) => `${file.path}@${file.sha256}`).join(" | ") || "none"}`,
    `proposed_plan: ${ticket.proposedPlan ?? "none"}`,
    `approved_plan: ${ticket.approvedPlan ?? "none"}`,
    `planned_paths: ${(ticket.plannedPaths ?? []).join(" | ") || "none"}`,
    `expires_at: ${ticket.expiresAt ?? "none"}`,
    `history: ${history || "none"}`,
  ].join("\n")
}

export default Plugin.define({
  id: "repair-ticket-store",
  async setup(ctx) {
    const safeWorkspacePath = async (value: string): Promise<string> => {
      const path = validatePath(value)
      let current = ctx.location.directory
      for (const part of path.split("/")) {
        current = join(current, part)
        try {
          if ((await lstat(current)).isSymbolicLink()) throw new Error(`symlink in scoped path: ${path}`)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") break
          throw error
        }
      }
      return path
    }

    await ctx.permission.hook("evaluate", createRepairPermissionGuard({
      sessionAgent: async (sessionID) => (await ctx.session.get({ sessionID })).agent,
      ticketForSession: async (sessionID) => {
        const id = await ctx.storage.get(`repair-session/${sessionID}`) as string | undefined
        return id ? await ctx.storage.get(ticketKey(id)) as Ticket | undefined : undefined
      },
      safePath: async (path) => { await safeWorkspacePath(path) },
    }))

    const pruneExpired = async (): Promise<number> => {
      const now = Date.now()
      let removed = 0
      let after: string | undefined
      do {
        const page = await ctx.storage.scan({ prefix: "ticket/", limit: 100, after })
        for (const entry of page.entries) {
          const ticket = entry.value as Ticket
          if (ticket.status === "verified" && ticket.expiresAt && Date.parse(ticket.expiresAt) <= now) {
            await ctx.storage.remove(entry.key)
            removed += 1
          }
        }
        after = page.next
      } while (after)
      return removed
    }

    const createTicketID = async (): Promise<string> => {
      const existingIDs = new Set<string>()
      let after: string | undefined
      do {
        const page = await ctx.storage.scan({ prefix: "ticket/", limit: 100, after })
        for (const entry of page.entries) existingIDs.add(entry.key.slice("ticket/".length))
        after = page.next
      } while (after)
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
            repairAttempts: 0,
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
        name: "workspace_status",
        description: "Read the current workspace status without giving Citadel or Ripperdoc shell access.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (_input, context) => {
          if (context.agent !== "ripperdoc" && context.agent !== "citadel") throw new Error("only citadel or ripperdoc may request this workspace snapshot")
          const status = await ctx.vcs.status()
          return { content: JSON.stringify(status) }
        },
      })

      editor.add({
        name: "workspace_diff",
        description: "Read a bounded working-tree diff without giving Citadel or Ripperdoc shell access.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (_input, context) => {
          if (context.agent !== "ripperdoc" && context.agent !== "citadel") throw new Error("only citadel or ripperdoc may request this workspace diff")
          const diff = JSON.stringify(await ctx.vcs.diff({ mode: "working", context: 3 }))
          return { content: diff.length > 24000 ? `${diff.slice(0, 24000)}\n[truncated; request narrower project evidence]` : diff }
        },
      })

      editor.add({
        name: "fingerprint",
        description: "Read a workspace file's SHA-256 digest without shell access.",
        input: {
          type: "object",
          properties: { path: { type: "string", description: "Workspace-relative file" } },
          required: ["path"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input, context) => {
          if (context.agent !== "ripperdoc") throw new Error("only ripperdoc may request ticket fingerprints")
          const path = await safeWorkspacePath((input as { path: string }).path)
          const ticketID = await ctx.storage.get(`repair-session/${context.sessionID}`) as string | undefined
          const ticket = ticketID ? await ctx.storage.get(ticketKey(ticketID)) as Ticket | undefined : undefined
          if (!canEditRepairFile(ticket, context.sessionID, [path])) throw new Error("file is not assigned to this repair session")
          const sha256 = createHash("sha256").update(await readFile(join(ctx.location.directory, path))).digest("hex")
          return { content: `path: ${path}\nsha256: ${sha256}` }
        },
      })

      editor.add({
        name: "propose_plan",
        description: "Store a concrete repair plan without approving edits. A changed plan invalidates prior approval.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Repair ticket ID" },
            plan: { type: "string", description: "Exact local change, files, and bounded checks" },
            paths: { type: "array", items: { type: "string" }, description: "Exact workspace-relative files allowed for this plan" },
          },
          required: ["id", "plan", "paths"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input, context) => {
          if (context.agent !== "ripperdoc") throw new Error("only ripperdoc may propose repair plans")
          const { id, plan, paths } = input as { id: string; plan: string; paths: string[] }
          const ticket = (await ctx.storage.get(ticketKey(id))) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (!["open", "partial", "mismatch", "unverified", "test_failed", "blocked"].includes(ticket.status)) {
            throw new Error(`cannot propose a plan for ${ticket.status}`)
          }
          const next = limitText(plan, "plan", 1500)
          const scoped = limitList(paths, "paths", 30, 300)
          if (scoped.length === 0) throw new Error("plan requires at least one file path")
          const plannedPaths = await Promise.all(scoped.map(safeWorkspacePath))
          if (new Set(plannedPaths).size !== plannedPaths.length) throw new Error("plan paths must be unique")
          if (next !== ticket.proposedPlan || plannedPaths.join("\n") !== ticket.plannedPaths?.join("\n")) ticket.approvedPlan = undefined
          ticket.proposedPlan = next
          ticket.plannedPaths = plannedPaths
          ticket.updatedAt = new Date().toISOString()
          await ctx.storage.set(ticketKey(id), ticket)
          return { content: `id: ${id}\nplan: ${next}\npaths: ${plannedPaths.join(" | ")}\napproved: ${ticket.approvedPlan === next}` }
        },
      })

      editor.add({
        name: "approve_plan",
        description: "Ask the user to approve the exact proposed repair plan before assignment.",
        input: {
          type: "object",
          properties: { id: { type: "string", description: "Repair ticket ID" } },
          required: ["id"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input, context) => {
          if (context.agent !== "citadel") throw new Error("only citadel may request repair approval")
          const { id } = input as { id: string }
          const ticket = (await ctx.storage.get(ticketKey(id))) as Ticket | undefined
          if (!ticket?.proposedPlan || !ticket.plannedPaths?.length) throw new Error("a concrete repair plan with file scope is required")
          if (!["open", "partial", "mismatch", "unverified", "test_failed", "blocked"].includes(ticket.status)) {
            throw new Error(`cannot approve a plan for ${ticket.status}`)
          }
          const plan = ticket.proposedPlan
          const paths = ticket.plannedPaths.join(" | ")
          await ctx.permission.assert({
            sessionID: context.sessionID,
            agent: context.agent,
            source: { type: "tool", messageID: context.messageID, id: context.id },
            action: "repair_ticket_approve_plan",
            resources: [`${id}: ${plan}; files: ${paths}`],
            save: [],
            metadata: { plan, paths: ticket.plannedPaths, ticket: id },
          })
          const current = (await ctx.storage.get(ticketKey(id))) as Ticket | undefined
          if (!current || current.proposedPlan !== plan || current.plannedPaths?.join(" | ") !== paths) throw new Error("repair plan changed during approval")
          current.approvedPlan = plan
          current.updatedAt = new Date().toISOString()
          await ctx.storage.set(ticketKey(id), current)
          return { content: `id: ${id}\nplan_approved: yes` }
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
        execute: async (input, context) => {
          await pruneExpired()
          const { id, actor, status, note } = input as { id: string; actor: string; status: string; note: string }
          if (!isTicketStatus(status)) throw new Error(`invalid ticket status ${status}`)
          if (context.agent !== actor) throw new Error("actor must match the calling agent")
          const key = ticketKey(id)
          const ticket = (await ctx.storage.get(key)) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (ticket.status === "assigned" && ticket.assignedSessionID !== context.sessionID && status === "changed") {
            throw new Error("ticket belongs to a different repair session")
          }
          if (ticket.status === status) {
            return { content: `id: ${ticket.id}\nstatus: ${ticket.status}\nresult: unchanged` }
          }
          ticket.repairAttempts ??= (ticket.events ?? []).filter((event) => event.status === "assigned").length
          assertTransition(ticket, status, actor)
          const now = new Date().toISOString()
          ticket.status = status
          if (status === "assigned") {
            ticket.approvedPlan = undefined
            ticket.scopeMatched = false
            ticket.ticketFiles = undefined
            ticket.assignedSessionID = context.sessionID
          }
          if (status === "scope_match") ticket.scopeMatched = true
          ticket.statusNote = limitText(note, "note", 500)
          ticket.updatedAt = now
          if (status === "assigned") ticket.repairAttempts += 1
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
          if (status === "assigned") await ctx.storage.set(`repair-session/${context.sessionID}`, ticket.id)
          return { content: `id: ${ticket.id}\nstatus: ${ticket.status}` }
        },
      })

      editor.add({
        name: "record_workspace",
        description: "Store the baseline and file fingerprints for a repair ticket.",
        input: {
          type: "object",
          properties: {
            id: { type: "string", description: "Repair ticket ID" },
            actor: { type: "string", description: "Agent recording provenance" },
            pre_existing_paths: { type: "array", items: { type: "string" }, description: "Paths changed before the repair" },
            ticket_files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  sha256: { type: "string" },
                },
                required: ["path", "sha256"],
                additionalProperties: false,
              },
              description: "Files changed by this ticket with current SHA-256 digests",
            },
          },
          required: ["id", "actor", "pre_existing_paths", "ticket_files"],
          additionalProperties: false,
        },
        options: { namespace: "repair_ticket", codemode: true },
        execute: async (input, context) => {
          await pruneExpired()
          const { id, actor, pre_existing_paths, ticket_files } = input as {
            id: string
            actor: string
            pre_existing_paths: string[]
            ticket_files: TicketFile[]
          }
          const key = ticketKey(id)
          const ticket = (await ctx.storage.get(key)) as Ticket | undefined
          if (!ticket) throw new Error(`repair ticket ${id} was not found`)
          if (context.agent !== "ripperdoc" || actor !== "ripperdoc" || ticket.status !== "assigned") {
            throw new Error("only an assigned ripperdoc may record repair provenance")
          }
          if (ticket.assignedSessionID !== context.sessionID) throw new Error("ticket belongs to a different repair session")
          for (const file of ticket_files) {
            const path = await safeWorkspacePath(file.path)
            if (!ticket.plannedPaths?.includes(path)) throw new Error(`file outside approved plan: ${path}`)
            const actual = createHash("sha256").update(await readFile(join(ctx.location.directory, path))).digest("hex")
            if (file.sha256.toLowerCase() !== actual) throw new Error(`file fingerprint differs from disk: ${path}`)
          }
          const baseline = limitList(pre_existing_paths, "pre_existing_paths", 100, 300).map(validatePath)
          if (ticket.workspaceBaseline && ticket.workspaceBaseline.join("\n") !== baseline.join("\n")) {
            throw new Error("workspace baseline differs from the ticket baseline")
          }
          ticket.workspaceBaseline ??= baseline
          ticket.ticketFiles = validateTicketFiles(ticket_files)
          const now = new Date().toISOString()
          ticket.updatedAt = now
          ticket.events = [...(ticket.events ?? []), {
            at: now,
            actor: limitText(actor, "actor", 80),
            status: ticket.status,
            note: `recorded ${ticket.ticketFiles.length} ticket file fingerprints`,
          }].slice(-maximumEvents)
          await ctx.storage.set(key, ticket)
          return { content: `id: ${ticket.id}\nrecorded_files: ${ticket.ticketFiles.length}` }
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
