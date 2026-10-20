# OpenCode Config

> The Lumen Grid never sleeps. Neither do broken builds.

A personal OpenCode setup for focused, safe, and efficient work. The agents are
the crew on the night shift: each has a clear job, a short call-sign, and a
strict line they will not cross.

The names in OpenCode stay practical. Select `gonk-check`, `braindance`,
`netrunner`, or `ripperdoc`. The people and stories below are fiction. They do
not change how the agents work.

---

## The Night Shift

### Vex Calder (`gonk-check`)
**Review checks: evidence over noise**

Vex learned to read an audit trail before he learned to trust a confident voice.
In the Lumen Grid, every outage has a report and every report has a version of
the truth. Vex checks the claim against the code, the change, and the rules that
the project actually follows. He keeps the useful signal and lets the noise die
in the wire.

He does not patch the system or answer a reviewer on your behalf. He gives you
the finding, the evidence, and a short reply when the comment does not hold up.

**On the clock:** Validates review comments. Groups duplicate concerns. Reports
only what the evidence supports.

---

### Alyse Mora (`braindance`)
**Code guide: one clear step at a time**

Alyse used to map the Grid's service tunnels for crews who had to work inside
them without getting lost. Her playback rig can trace a function from input to
result, but she never dumps the whole map on the table. First the entrance.
Then the next turn. The rest waits until someone asks.

Ask Alyse about a line, a function, a feature, or a finding. She reads the
relevant code, explains it in small steps, and leaves room for questions.

**On the clock:** Explains code and findings with short, practical examples.
Does not change files.

---

### Nix Varon (`netrunner`)
**Pipeline investigator: trace the failure, not the whole log**

Nix listens to the Grid's CI relays from a narrow-band terminal. When a job
fails, he does not pull megabytes of static into the room. He checks the job,
finds the failed step, searches for the first useful error, and follows that
signal back to its source.

Nix reports the likely cause and the evidence behind it. He can ask the local
repair specialist to work on a fix, but he never changes the repository or
touches the remote pipeline himself.

**On the clock:** Finds the latest relevant failed pipeline and explains its
root cause from targeted log excerpts.

---

### Rook Sato (`ripperdoc`)
**Local repair: clean work, no loose ends**

Rook keeps a small clinic above a humming power station on the edge of the
Grid. People bring him strange failures, half-written reports, and code that
has been patched one too many times. He starts by listening, checks the local
rules, and changes only what the diagnosis requires.

Rook follows the project's style and uses its own tests, formatters, and
compliance checks. He does not add comments just to narrate obvious code. He
will not commit, push, or discard your work. The final call stays with you.

**On the clock:** Makes focused local fixes for pipeline failures, review
findings, and direct requests. Runs relevant project checks after the change.

---

## Crew protocol

```text
gonk-check  - verify review feedback
braindance  - understand code or a finding
netrunner   - diagnose a failed pipeline
ripperdoc   - make a local fix
```

Use `/explain <topic>` to start a focused explanation session. Use
`/fix <problem>` to ask Rook for a local fix in a child session.

### Lines the crew will not cross

- No agent commits or pushes changes.
- Read-only agents do not edit files or change remote systems.
- Ripperdoc does not discard user changes or change Git state.
- Project instructions and existing code style guide the work.
- Logs and tool output are narrowed to the evidence needed.

---

## Configuration

```text
agents/       Agent roles and instructions
commands/     Reusable commands such as /fix and /explain
themes/       OpenCode themes
cli.json      Terminal UI preferences and key bindings
opencode.jsonc OpenCode server and project-independent settings
tui.json      TUI theme selection
```

Local credentials, service state, package installs, and environment files do
not belong in this repository.
