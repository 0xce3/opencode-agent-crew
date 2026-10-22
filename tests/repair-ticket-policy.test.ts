import { expect, test } from "bun:test"
import { assertTransition, type RepairState } from "../lib/repair-ticket-policy"

const planned: RepairState = { status: "open", repairAttempts: 0, proposedPlan: "Fix one file", approvedPlan: "Fix one file" }

test("requires approval for the exact current plan", () => {
  expect(() => assertTransition({ ...planned, approvedPlan: "Earlier plan" }, "assigned", "ripperdoc")).toThrow(/approval/)
  expect(() => assertTransition(planned, "assigned", "ripperdoc")).not.toThrow()
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
