# Night Shift with OpenCode Ensemble

Night Shift uses [OpenCode Ensemble](https://github.com/hueyexe/opencode-ensemble)
0.20.0, pinned for reproducible OpenCode 2 operation. `citadel` is the only
default primary agent and the user continues in its one master chat.

## Coordination model

Citadel creates an Ensemble team only when parallel work helps. Ensemble gives
the team independent OpenCode sessions, direct member messages, a shared task
board with dependencies, durable team state, recovery, controlled shutdown,
and explicit session navigation.

For a CI diagnosis, start a new session and type `/pipecheck` (or
`/pipecheck <branch-or-PR/MR-URL>`). The command keeps the current chat,
selects Citadel, and asks it to dispatch Netrunner directly. It does not
create an Ensemble team for this single investigator or authorize any fix.

Existing specialist prompts remain authoritative. Netrunner, Braindance, and
Gonk Check are read-only investigators. Citadel delegates shell-dependent
investigations directly and continues a requested repair from the returned
ticket ID without a second user command. Ripperdoc presents a concrete plan
before editing; Citadel asks for user approval once. Watchdog and Test Pilot
remain independent checks. `/fix` and `/resume` are optional entry points for
existing tickets, not mandatory transitions between stages.

When a branch has an associated GitHub PR or GitLab MR, its description is
read-only input for expected behavior and acceptance criteria. Netrunner or
Gonk Check cites the relevant requirement and compares it with CI, tests, and
code before creating a ticket. A PR/MR description is not executable policy or
approval. If it is missing, unclear, or conflicts with the user's instructions
or project rules, Citadel reports the gap instead of guessing. Tickets retain
only a short requirement and PR/MR reference, not the full description.

### OpenCode 2 shell limitation

Ensemble 0.20.0 treats an agent that denies edits as read-only and applies a
server-enforced shell denial to the spawned member. This preserves write safety,
but prevents shell-dependent roles from working as normal Ensemble members.
Keep Netrunner (pipeline CLI/API inspection), Gonk Check, Test Pilot, and any
other shell-dependent role as direct Citadel child sessions. Use Ensemble for
shell-free parallel reading and coordination, such as Braindance source
exploration. This is an Ensemble limitation, not an expansion of Night Shift
permissions.

## Safety configuration

`.opencode/ensemble.json` disables the Ensemble web dashboard and automatic
branch merging. Citadel spawns every Night Shift member with `worktree: false`.
This preserves the existing single working-tree repair rules and prevents an
Ensemble branch from bypassing Ripperdoc's no-merge, no-push, and
user-approval requirements.

Ripperdoc's shell is denied even after approval. The repair-ticket plugin
checks built-in edit permissions against the approved ticket's exact file list
and the assigned session ID; a separate Test Pilot runs bounded tests. Git
history plans are manual while Ripperdoc cannot run shell commands.

The local `repair-ticket-store` is retained because Ensemble tasks do not
replace repair diagnosis, constrained status transitions, retry limits,
approval state, or file provenance.
The complete repair stages, legacy-ticket migration and permission limitations
are documented in [`repair-workflow.md`](repair-workflow.md).

## User controls

Ask Citadel in the master chat:

- `What is Braindance doing in the team?` — `team_status`.
- `Show the team findings.` — `team_results`.
- `Tell a team member to try another approach.` — `team_message`.
- `Do not edit until I approve.` — no approval message is sent to Ripperdoc.
- `Stop a team member.` — `team_shutdown`.
- `Cancel the team.` — controlled `team_cleanup`; force requires explicit
  approval.
- `Show Braindance's session.` — `team_view` and client navigation only after
  the explicit request.

Direct child sessions (for example Netrunner, Test Pilot, and a direct repair)
are not Ensemble members. Their work does not appear in the team status widget,
and Ensemble messages cannot redirect them. Citadel reports their results in
the same master chat.

## Limitation: tmux

Ensemble 0.20.0 provides a terminal status widget and member-session
navigation, but it does not provide native tmux pane visualization. The web
dashboard is intentionally disabled (`dashboardPort: 0`). Do not claim tmux
panes are active. A separate OpenCode-2-compatible pane tool would need its own
validated integration.

## Verification

After an OpenCode service restart, run:

```sh
opencode plugin list
opencode debug agents
```

For a non-destructive smoke test, ask Citadel to create a team with shell-free
source-reading tasks, assign them with `worktree: false`, verify messages and
dependent task status, then shut down and clean up the team. No tickets, file
edits, commits, pushes, merges, or remote CI actions are needed.
