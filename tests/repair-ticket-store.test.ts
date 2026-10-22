import { expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

mock.module("@opencode/plugin", () => ({ Plugin: { define: (definition: unknown) => definition } }))

const plugin = (await import("../plugins/repair-ticket-store")).default

type Tool = { execute: (input: unknown, context?: unknown) => Promise<{ content: string }> }
type PermissionEvent = { agent?: string; sessionID: string; action: string; resources: readonly string[]; effect: "allow" | "ask" | "deny"; message?: string }

function context(agent: string, sessionID = "ses_repair") {
  return { agent, sessionID, messageID: "msg_probe", id: "call_probe" }
}

test("ticket tools enforce plan approval, session scope, and independent checks", async () => {
  const storage = new Map<string, unknown>()
  const tools = new Map<string, Tool>()
  let guard: ((event: PermissionEvent) => Promise<void>) | undefined
  let approve = false
  const ctx = {
    location: { directory: process.cwd() },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => { storage.set(key, structuredClone(value)) },
      remove: async (key: string) => { storage.delete(key) },
      scan: async ({ prefix }: { prefix: string }) => ({ entries: [...storage].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })) }),
    },
    permission: {
      hook: async (_name: string, callback: typeof guard) => { guard = callback },
      assert: async () => { if (!approve) throw new Error("user rejected plan") },
    },
    session: { get: async () => ({ agent: "ripperdoc" }) },
    vcs: { status: async () => [], diff: async () => [] },
    tool: {
      transform: async (callback: (editor: unknown) => void) => callback({
        namespace: () => {},
        add: (tool: Tool & { name: string }) => tools.set(tool.name, tool),
      }),
    },
  }
  await plugin.setup(ctx as never)
  const call = (name: string, input: unknown, agent: string, sessionID?: string) => tools.get(name)!.execute(input, context(agent, sessionID))
  const result = await call("create", {
    source: "netrunner", target: "test only", cause: "confirmed cause", evidence: ["one check"],
    required_change: "small change", non_goals: ["no remote changes"], recommended_checks: ["focused check"],
  }, "netrunner")
  const id = result.content.match(/id: (\w+)/)![1]
  const status = (agent: string, value: string, sessionID?: string) => call("set_status", { id, actor: agent, status: value, note: "bounded evidence" }, agent, sessionID)
  await expect(status("ripperdoc", "assigned")).rejects.toThrow(/approval/)

  await expect(call("propose_plan", { id, plan: "Unsafe path", paths: [".git/config"] }, "ripperdoc")).rejects.toThrow(/normalized/)
  await call("propose_plan", { id, plan: "Change README only", paths: ["README.md"] }, "ripperdoc")
  await expect(call("approve_plan", { id }, "citadel")).rejects.toThrow(/rejected/)
  await expect(status("ripperdoc", "assigned")).rejects.toThrow(/approval/)
  approve = true
  await call("approve_plan", { id }, "citadel")
  await call("propose_plan", { id, plan: "Change README only", paths: ["README.md", "tests/repair-ticket-policy.test.ts"] }, "ripperdoc")
  await expect(status("ripperdoc", "assigned")).rejects.toThrow(/approval/)
  await call("propose_plan", { id, plan: "Changed plan", paths: ["README.md"] }, "ripperdoc")
  await expect(status("ripperdoc", "assigned")).rejects.toThrow(/approval/)
  await call("approve_plan", { id }, "citadel")
  await status("ripperdoc", "assigned")

  const event = (sessionID: string, action = "edit", resource = "README.md"): PermissionEvent => ({ agent: "ripperdoc", sessionID, action, resources: [resource], effect: "allow" })
  const allowed = event("ses_repair")
  await guard!(allowed)
  expect(allowed.effect).toBe("allow")
  for (const request of [event("ses_other"), event("ses_repair", "edit", "agents/citadel.md"), event("ses_repair", "shell", "git status")]) {
    await guard!(request)
    expect(request.effect).toBe("deny")
  }
  await expect(status("ripperdoc", "changed", "ses_other")).rejects.toThrow(/different repair session/)

  const sha256 = createHash("sha256").update(await readFile("README.md")).digest("hex")
  await call("record_workspace", { id, actor: "ripperdoc", pre_existing_paths: [], ticket_files: [] }, "ripperdoc")
  await expect(call("record_workspace", { id, actor: "ripperdoc", pre_existing_paths: [], ticket_files: [{ path: "README.md", sha256: "0".repeat(64) }] }, "ripperdoc")).rejects.toThrow(/differs/)
  await call("record_workspace", { id, actor: "ripperdoc", pre_existing_paths: [], ticket_files: [{ path: "README.md", sha256 }] }, "ripperdoc")
  await status("ripperdoc", "changed")
  const after = event("ses_repair")
  await guard!(after)
  expect(after.effect).toBe("deny")
  await status("watchdog", "scope_match")
  await status("test-pilot", "testing")
  await status("test-pilot", "test_pass")
  await status("watchdog", "verified")
  expect((await call("get", { id }, "citadel")).content).toContain("status: verified")
  expect(storage.size).toBe(2)
})
