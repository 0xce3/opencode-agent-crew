---
description: Diagnose the latest failed pipeline on this branch with Citadel and Netrunner
agent: citadel
subagent: false
---

Diagnose the latest failed CI pipeline for this project's current branch.
Optional branch, PR/MR URL, or pipeline selector: `$ARGUMENTS`.
If no selector was given, detect the current branch and its associated PR/MR.

You are Citadel in the original master chat. Delegate the CI investigation
directly to Netrunner as a child session; do not create an Ensemble team for
this single investigation and do not investigate the logs in Netrunner's place.
Ask Netrunner to read the associated PR/MR description for expected behavior,
inspect only the failed jobs and targeted log excerpts, compare failures with
tests and code, and return concise evidence and any confirmed ticket ID.

This command requests **diagnosis only**. Do not edit files, run local tests,
start Ripperdoc, publish comments, retry CI, or change any remote resource.
Report the failed job, likely or confirmed cause, PR/MR requirement where
available, evidence, uncertainties, any ticket ID, and a suggested next step.
If there is no failed pipeline or the cause is uncertain, say so; do not invent
a repair plan or demand a ticket.
