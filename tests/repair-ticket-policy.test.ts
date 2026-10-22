import { expect, test } from "bun:test"
import { assertTransition, canEditRepairFile, createRepairPermissionGuard, type RepairState } from "../lib/repair-ticket-policy"

const planned: RepairState = { status: "open", repairAttempts: 0, proposedPlan: "Fix one file", approvedPlan: "Fix one file", plannedPaths: ["src/a.ts"] }

test("requires approval for the exact current plan", () => {
  expect(() => assertTransition({ ...planned, approvedPlan: "Earlier plan" }, "assigned", "ripperdoc")).toThrow(/approval/)
  expect(() => assertTransition({ ...planned, plannedPaths: [] }, "assigned", "ripperdoc")).toThrow(/file scope/)
  expect(() => assertTransition(planned, "assigned", "ripperdoc")).not.toThrow()
})

test("denies edits before assignment and from unrelated sessions or files", () => {
  const active: RepairState = { ...planned, status: "assigned", approvedPlan: undefined, assignedSessionID: "ses_repair" }
  expect(canEditRepairFile(planned, "ses_repair", ["src/a.ts"])).toBe(false)
  expect(canEditRepairFile(active, "ses_other", ["src/a.ts"])).toBe(false)
  expect(canEditRepairFile(active, "ses_repair", ["src/other.ts"])).toBe(false)
  expect(canEditRepairFile(active, "ses_repair", [])).toBe(false)
  expect(canEditRepairFile(active, "ses_repair", ["src/a.ts", "src/other.ts"])).toBe(false)
  expect(canEditRepairFile(active, "ses_repair", ["src/a.ts"])).toBe(true)
  expect(canEditRepairFile({ ...active, status: "changed" }, "ses_repair", ["src/a.ts"])).toBe(false)
})

test("limits retries and assigns transitions to their specialist", () => {
  expect(() => assertTransition({ ...planned, repairAttempts: 2 }, "assigned", "ripperdoc")).toThrow(/limit/)
  expect(() => assertTransition(planned, "assigned", "citadel")).toThrow(/ripperdoc/)
  expect(() => assertTransition({ ...planned, status: "changed" }, "verified", "watchdog")).toThrow(/cannot change/)
})

test("requires file provenance and an independent scope match", () => {
  expect(() => assertTransition({ ...planned, status: "assigned" }, "changed", "ripperdoc")).toThrow(/fingerprints/)
  const tested: RepairState = { status: "test_pass", repairAttempts: 1, ticketFiles: [{ path: "src/a.ts", sha256: "a".repeat(64) }] }
  expect(() => assertTransition(tested, "verified", "watchdog")).toThrow(/scope match/)
  expect(() => assertTransition({ ...tested, scopeMatched: true }, "verified", "watchdog")).not.toThrow()
})

test("permission gate denies planning edits and shell and allows only assigned files", async () => {
  let ticket: RepairState | undefined = planned
  const guard = createRepairPermissionGuard({
    sessionAgent: async () => "ripperdoc",
    ticketForSession: async () => ticket,
    safePath: async () => {},
  })
  const edit = () => ({ sessionID: "ses_repair", action: "edit", resources: ["src/a.ts"], effect: "allow" as const })
  const before = edit()
  await guard(before)
  expect(before.effect).toBe("deny")

  ticket = { ...planned, status: "assigned", approvedPlan: undefined, assignedSessionID: "ses_repair" }
  const authorized = edit()
  await guard(authorized)
  expect(authorized.effect).toBe("allow")
  const shell = { ...edit(), action: "shell", resources: ["git status --short"] }
  await guard(shell)
  expect(shell.effect).toBe("deny")
  ticket = { ...ticket, status: "changed" }
  const done = edit()
  await guard(done)
  expect(done.effect).toBe("deny")
})

test("permission gate fails closed on unknown identity and unsafe path", async () => {
  const active: RepairState = { ...planned, status: "assigned", assignedSessionID: "ses_repair" }
  const guard = createRepairPermissionGuard({
    sessionAgent: async () => undefined,
    ticketForSession: async () => active,
    safePath: async () => { throw new Error("symlink in scoped path") },
  })
  const event = { sessionID: "ses_repair", action: "edit", resources: ["src/a.ts"], effect: "allow" as const }
  await expect(guard(event)).rejects.toThrow(/identify agent/)
  await expect(guard({ ...event, agent: "ripperdoc" })).rejects.toThrow(/symlink/)
  const other = { ...event, agent: "watchdog" }
  await guard(other)
  expect(other.effect).toBe("allow")
})
