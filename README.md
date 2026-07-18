# Multi-Agent Workflow Patterns for Claude Code

Battle-tested orchestration scripts for Claude Code's Workflow engine, extracted
from a production system that ships a live SaaS + iOS app. Each encodes a
discipline learned the hard way: **model output is a claim; only mechanical
evidence is proof.**

## The patterns

### `ship-wave.js` — parallel implementation wave
Multiple builder agents implement disjoint tasks in one worktree, safely:
- **Ownership preflight**: path-normalized file-claim map; any overlap or
  forbidden file class (lockfiles, generated dirs) throws before work starts
- **Builders are constrained**: no git commands, no formatters, no installers —
  the orchestrator owns repository state
- **Hash verification**: sha256 of every owned file before/after the wave
- **Mechanical test barrier**: schema-forced `{exitCode, outputTail}` — an
  agent saying "tests passed" is not evidence; a captured exit code is
- **Adversarial review**: a reviewer per task tries to break the diff,
  verdict SHIP or BLOCK

### `review-gauntlet.js` — find, then try to refute
One finder agent per review dimension, then an adversarial verifier per
finding whose job is to REFUTE it (`real=false` when uncertain). Only
findings that survive refutation are reported. Kills plausible-but-wrong
review noise.

### `research-sweep.js` — breadth, depth, then a critic
Cheap scouts sweep independent angles in parallel → a stronger model
deep-reads and verifies sources → synthesis → a completeness critic asks
"what's missing?" whose output seeds the next round.

## Principles these encode
1. Three-state results everywhere: pass / fail / **couldn't-check** — an
   infrastructure failure must never look like a clean result.
2. Different-vendor verification for anything that matters; same-family
   review is capability-gap review, not independence.
3. Fail closed. When a gate can't run, the answer is no.

## Usage
Drop into `~/.claude/workflows/` and invoke by name:
```
Workflow({ name: "ship-wave", args: { worktree: "...", tasks: [...], testCmd: "pytest -q" } })
```

MIT licensed. Extracted & sanitized from private production repos — paths and
domain rules genericized.
