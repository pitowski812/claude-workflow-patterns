export const meta = {
  name: 'ship-wave',
  description: 'Parallel implement wave: hardened preflight, disjoint-file builders, mechanical test barrier, adversarial SHIP/BLOCK review',
  whenToUse: 'Multi-fix or multi-feature wave in one repo/worktree (the ios-polish-wave pattern). args: {worktree, tasks:[{key,spec,files:[..]}], testCmd}',
  phases: [
    { title: 'Preflight', detail: 'realpath-normalized ownership + lock' },
    { title: 'Implement', detail: 'one sonnet builder per task, disjoint files, no git/installers', model: 'sonnet' },
    { title: 'Hashes', detail: 'per-builder file-hash verification' },
    { title: 'Test', detail: 'mechanical exit-code barrier' },
    { title: 'Review', detail: 'adversarial SHIP/BLOCK per task', model: 'sonnet' },
  ],
}
// args: { worktree: string, tasks: [{key, spec, files: [..]}], testCmd: string }
// HARDENED (P4, 2026-07-17): path normalization, forbidden-file classes,
// builders banned from ALL git ops + formatters + installers, wave lock file
// (bash-guard shadow rule S2 watches it), post-wave hash verification, and a
// schema-forced mechanical test barrier. Orchestrator owns git entirely.
const { worktree, tasks, testCmd } = args
if (!worktree || !tasks?.length || !testCmd) throw new Error('args.worktree, args.tasks, args.testCmd required')

const FORBIDDEN_FILE_RE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Podfile\.lock|poetry\.lock|uv\.lock|requirements.*\.txt|node_modules\/|Pods\/|\.venv\/|__pycache__|\.min\.(js|css)$)/
const norm = (f) => f.replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '')

phase('Preflight')
const owned = {}
for (const t of tasks) {
  if (!t.files?.length) throw new Error(`task ${t.key}: files[] required`)
  for (const raw of t.files) {
    const f = norm(raw)
    if (FORBIDDEN_FILE_RE.test(f)) throw new Error(`task ${t.key}: forbidden file class (lockfile/generated/deps): ${f}`)
    if (owned[f]) throw new Error(`file ownership overlap: ${f} (${owned[f]} vs ${t.key})`)
    owned[f] = t.key
  }
}
// Wave lock + baseline hashes — one mechanical agent, low effort.
const HASH_SCHEMA = { type: 'object', additionalProperties: false, required: ['hashes'], properties: { hashes: { type: 'object', additionalProperties: { type: 'string' } } } }
const allFiles = Object.keys(owned)
const baseline = await agent(
  `Mechanical task, no judgment. cd ${worktree} && touch /tmp/ship-wave.lock; then for each of these files output its sha256 (shasum -a 256; missing file = "ABSENT"): ${JSON.stringify(allFiles)}. Return hashes as {"<file>":"<sha-or-ABSENT>"}.`,
  { label: 'preflight-lock+hashes', model: 'haiku', effort: 'low', schema: HASH_SCHEMA }
)
log(`ownership clean: ${tasks.length} tasks, ${allFiles.length} files; wave lock set`)

const results = await parallel(tasks.map(t => () =>
  agent(
    `You are a builder in worktree ${worktree}. Implement EXACTLY this task and touch ONLY these files: ${JSON.stringify(t.files.map(norm))}.\n\nSPEC:\n${t.spec}\n\nHARD RULES: (1) NO git commands of any kind (no add/commit/stash/checkout — the orchestrator owns git); (2) NO formatters or fixers on the tree (no prettier/eslint --fix/black/ruff format beyond your own files via targeted args); (3) NO installers (npm/pip/pod install) — if you need a dependency, STOP and report it; (4) do not touch lockfiles or generated files; (5) match surrounding code style manually; add/extend tests inside your owned files. Return: files changed, what you did, tests added, assumptions, risks, and any dependency you needed but could not install.`,
    { label: `build:${t.key}`, phase: 'Implement', model: 'sonnet' }
  ).then(r => ({ key: t.key, report: r }))
))

phase('Hashes')
const post = await agent(
  `Mechanical task. cd ${worktree}; for each file output sha256 (shasum -a 256; missing = "ABSENT"): ${JSON.stringify(allFiles)}. Also run: git status --porcelain | head -40 and include it verbatim in a "status" note inside the first hash value? NO — return ONLY {"hashes":{...}}.`,
  { label: 'post-hashes', model: 'haiku', effort: 'low', schema: HASH_SCHEMA }
)
// Cross-check: a file owned by task A whose hash changed is expected; a file
// NOT in any ownership list cannot be checked here (builders report their own
// changes) — the orchestrator diffs the worktree after the wave. What we CAN
// catch mechanically: an owned file that NO builder claims but whose hash
// changed anyway would surface in the orchestrator's git-status pass.
const changed = allFiles.filter(f => (baseline.hashes?.[f] ?? 'ABSENT') !== (post.hashes?.[f] ?? 'ABSENT'))
log(`hash delta: ${changed.length}/${allFiles.length} owned files changed`)

phase('Test')
const TEST_SCHEMA = { type: 'object', additionalProperties: false, required: ['exitCode', 'outputTail'], properties: { exitCode: { type: 'integer' }, outputTail: { type: 'string' } } }
const test = await agent(
  `Mechanical test barrier. cd ${worktree} && run EXACTLY this command, capture everything:\n${testCmd}; echo EXIT:$?\nReturn exitCode (the integer after EXIT:) and outputTail (the REAL last 60 lines, verbatim — never summarize, never fabricate).`,
  { label: 'test-barrier', model: 'haiku', effort: 'low', schema: TEST_SCHEMA }
)
if (typeof test?.exitCode !== 'number') throw new Error('test barrier returned no exit code — failing closed')
const testsPass = test.exitCode === 0

phase('Review')
const reviews = await parallel(tasks.map(t => () =>
  agent(
    `Adversarial reviewer. In worktree ${worktree}, review the diff for task "${t.key}" (files: ${JSON.stringify(t.files.map(norm))}) against this spec:\n${t.spec}\n\nTry to BREAK it: edge cases, regressions, spec violations, forbidden-tool traces (git/installer/formatter side effects), style drift, security. Verdict line required: SHIP or BLOCK (with exact reasons + file:line).`,
    { label: `review:${t.key}`, phase: 'Review', model: 'sonnet', effort: 'high' }
  ).then(r => ({ key: t.key, review: r }))
))

// Release the wave lock (mechanical).
await agent(`Run exactly: rm -f /tmp/ship-wave.lock && echo UNLOCKED`, { label: 'unlock', model: 'haiku', effort: 'low' })

return {
  builders: results.filter(Boolean),
  hashDelta: changed,
  test: { pass: testsPass, exitCode: test.exitCode, tail: test.outputTail?.slice(-2000) },
  reviews: reviews.filter(Boolean),
  note: 'Orchestrator: RE-RUN the test suite yourself before commit (agent-run barrier is screening, not proof), fix any BLOCK, run git status to catch unclaimed changes, then commit/PR per R21/R22. Nothing here committed.',
}
