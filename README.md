# OPENCode // NIGHT SHIFT

<p align="center">
  <strong>THE LUMEN GRID IS LIVE</strong><br>
  <sub>Personal OpenCode setup · Night operations · Local-first repairs</sub>
</p>

<p align="center">
  <img alt="OpenCode" src="https://img.shields.io/badge/OpenCode-config-9b5de5?style=flat-square">
  <img alt="Crew" src="https://img.shields.io/badge/crew-4%20specialists-00d1b2?style=flat-square">
  <img alt="Commits" src="https://img.shields.io/badge/commits-user%20controlled-f15bb5?style=flat-square">
</p>

A personal OpenCode setup for focused, safe, and efficient work. The agents are
the crew on the night shift: each has a clear job, a short call-sign, and a
strict line they will not cross.

The names in OpenCode stay practical. Select `gonk-check`, `braindance`,
`netrunner`, or `ripperdoc`. The people and stories below are fiction. They do
not change how the agents work.

## The crew

Four specialists. One shared rule: do the job, leave the system in your hands.

### Vex Calder (`gonk-check`)
**Review checks: evidence over noise**

Vex learned to read an audit trail before he learned to trust a confident voice.
In the Lumen Grid, every outage has a report and every report has a version of
the truth. Vex checks the claim against the code, the change, and the rules that
the project actually follows. He keeps the useful signal and lets the noise die
in the wire.

He does not patch the system or answer a reviewer on your behalf. He gives you
the finding, the evidence, and a short reply when the comment does not hold up.

> **ON SHIFT**  Review comments · Evidence checks · Concise findings

---

### Alyse Mora (`braindance`)
**Code guide: one clear step at a time**

Alyse used to map the Grid's service tunnels for crews who had to work inside
them without getting lost. Her playback rig can trace a function from input to
result, but she never dumps the whole map on the table. First the entrance.
Then the next turn. The rest waits until someone asks.

Ask Alyse about a line, a function, a feature, or a finding. She reads the
relevant code, explains it in small steps, and leaves room for questions.

> **ON SHIFT**  Code walkthroughs · Small steps · No file changes

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

> **ON SHIFT**  CI failures · Targeted log search · Root-cause analysis

---

### Rook Sato (`ripperdoc`)
**Local repair: clean work, no loose ends**

Rook keeps a small clinic above a humming power station on the edge of the
Grid. People bring him strange failures, half-written reports, and code that
has been patched one too many times. He starts by listening, checks the local
rules, and changes only what the diagnosis requires.

Rook follows the project's style and uses its own formatters and compliance
checks when they are quick and targeted. He recommends tests instead of running
long jobs. He does not add comments just to narrate obvious code. He never
pushes or discards your work. He creates local commits only for a confirmed
Patchrunner history plan. The final call stays with you.

> **ON SHIFT**  Local fixes · Short checks · No pushes

---

### Iris Vale (`watchdog`)
**Independent verifier: trust the diff, not the summary**

Iris watches the repair bay from the far side of the glass. She gets the same
ticket as Rook, then reads the changed code without taking his word for it. A
clean-looking patch means nothing if it repairs the wrong fault.

Iris compares the repair ticket with the diff and returns one verdict: match,
partial, mismatch, or unverified. She does not make changes and she does not
run long jobs.

> **ON SHIFT**  Diff review · Scope checks · Independent verdict

---

### Aurelia Voss (`regent`)
**Crew coordinator: every specialist answers to the same desk**

Aurelia runs the Night Shift from a quiet room above the Grid. She does not
patch code and she does not touch the terminals. She decides who handles the
ticket, in what order, and when the evidence is enough to close the case.

Her desk keeps the repair flow flat. Rook, Iris, and Mika work as direct
specialists, not as a chain of nested calls. That keeps their reports visible
and prevents the crew from disappearing behind session limits.

> **ON SHIFT**  Repair flow · Specialist dispatch · Final status

---

### Mika Sol (`test-pilot`)
**Validation pilot: run the small check that matters**

Mika knows which service tunnels lead into a live container and which ones end
at a locked bulkhead. Before she starts a check, she finds the active runtime,
the project command, and its likely cost. A five-hour system run is not a quick
sanity check. She asks before crossing that line.

Mika runs only the focused test that can prove or disprove a repair. She also
runs short project-defined format, lint, spell, or delta compliance checks when
they apply. Her result goes back to Iris before any repair is approved.

> **ON SHIFT**  Container checks · Targeted tests · Bounded runtime

---

### Dax Mercer (`sweeper`)
**Archive cleanup: leave no stale signal behind**

Dax keeps the repair archive small. He removes only verified tickets after
their retention window ends. He does not touch project files, active tickets,
or failed investigations.

> **ON SHIFT**  Expired archives · Local store only · No project access

---

### Mara Venn (`patchrunner`)
**History planner: clean commits, clear trail**

Mara moves data through the Grid for people who need to know where it came from
and where it belongs. She does not trust a tidy-looking log that hides three
unrelated jobs in one drop. Before a delivery, she checks the branch, the rules,
and the existing trail. Then she lays out a sequence that another operator can
read without asking what happened.

Mara only plans. If the operator approves, Rook rebuilds the local branch from
the selected main base and creates the agreed commits. Nothing goes to a remote
without the operator.

> **ON SHIFT**  Commit plans · Local history · No merges or remote changes

---

## Quick dispatch

```text
gonk-check  - verify review feedback
braindance  - understand code or a finding
netrunner   - diagnose a failed pipeline
ripperdoc   - make a local fix
watchdog    - verify a repair ticket against the diff
regent      - coordinate repair specialists
test-pilot  - run bounded targeted validation
patchrunner - plan a clean local commit history
sweeper     - remove expired ticket archives
```

Use `/explain <topic>` to start a focused explanation session. Use
`/fix <ticket-id>` to ask Rook for a local fix in a child session.

### Repair tickets

Nix and Vex store confirmed findings as compact local repair tickets. The
ticket ID is enough to hand work to Alyse, Rook, Iris, or Mika:

```text
/explain amber_otter
/fix amber_otter
```

Ticket IDs use unique adjective and call-sign pairs such as `amber_otter`.
They stay short enough to type and remain unique among stored tickets.

The local ticket store keeps short structured fields only. It never stores full
logs or credentials. Each ticket retains at most eight short status events.
Iris marks a ticket as verified only after the static diff check and Mika's
targeted validation both pass. Verified tickets stay local for 24 hours, so
`/explain <ticket-id>` can reconstruct the flow. Expired verified tickets are
removed automatically when the store is used, or manually with `/cleanup`.
Tickets that do not match stay available for follow-up.

## House rules

- No agent commits or pushes changes.
- Read-only agents do not edit files or change remote systems.
- Ripperdoc does not discard user changes. It changes local Git history only for
  a confirmed Patchrunner plan.
- Project instructions and existing code style guide the work.
- Logs and tool output are narrowed to the evidence needed.

## Configuration

```text
agents/       Agent roles and instructions
commands/     Reusable commands such as /fix and /explain
plugins/      Local OpenCode extensions, including the repair ticket store
themes/       OpenCode themes
cli.json      Terminal UI preferences and key bindings
opencode.jsonc OpenCode server and project-independent settings
tui.json      TUI theme selection
```

Local credentials, service state, package installs, and environment files do
not belong in this repository.

## Security

GitHub Secret Scanning and Push Protection are enabled for this repository.
The repository also includes a Gitleaks pre-commit hook. It scans staged changes
and blocks a commit when it finds a possible secret.

Install [Gitleaks](https://github.com/gitleaks/gitleaks), then enable the
versioned hook after cloning:

```sh
git config core.hooksPath .githooks
```

The hook fails closed. A commit does not proceed when Gitleaks is unavailable.

See [SECURITY.md](SECURITY.md) for the read-only GitHub CI token and rootless
Podman profile setup.

## Disclaimer

This configuration is provided "as is", without warranty of any kind. Use it
at your own risk. You are responsible for reviewing all generated advice,
commands, and changes before you use them. The agents can make mistakes and
their output is not a substitute for professional review. The author is not
liable for any claim, loss, or damage that results from using this repository,
to the extent permitted by law.

This is a personal project. It is not affiliated with or endorsed by OpenCode,
CD Projekt, or any other company mentioned in the configuration.

## License

The configuration files in this repository are licensed under the MIT License.
See [LICENSE](LICENSE) for details.
