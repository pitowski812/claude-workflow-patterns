export const meta = {
  name: 'review-gauntlet',
  description: 'Multi-dimension code review with adversarial verification of every finding',
  whenToUse: 'Pre-merge review of a branch/diff/PR. args: {target, dimensions?: [..], thorough?: bool}',
  phases: [
    { title: 'Find', detail: 'one finder per dimension', model: 'sonnet' },
    { title: 'Verify', detail: 'adversarial refuter per finding', model: 'sonnet' },
  ],
}
// args: { target: string (repo path / branch / PR ref + how to view the diff), dimensions?: [..], thorough?: bool }
const target = args?.target
if (!target) throw new Error('args.target required (path/branch/PR + diff instructions)')
const DIMS = args?.dimensions || [
  'correctness — logic bugs, edge cases, broken behavior',
  'security — injection, authz, secrets, unsafe input handling',
  'regressions — existing behavior this diff silently changes',
  'test-coverage — changed behavior without a test that would catch its breakage',
  'domain-compliance — project-specific policy rules (customize per repo)',
]
const FINDINGS = {
  type: 'object', additionalProperties: false, required: ['findings'],
  properties: { findings: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['title', 'file', 'why'],
    properties: { title: {type:'string'}, file: {type:'string'}, line: {type:'integer'}, why: {type:'string'} } } } },
}
const VERDICT = {
  type: 'object', additionalProperties: false, required: ['real', 'reason'],
  properties: { real: {type:'boolean'}, reason: {type:'string'} },
}

const verified = await pipeline(
  DIMS,
  d => agent(
    `Review ${target} strictly through this lens: ${d}. Read the actual diff/files — no speculation. Report only defects you can anchor to file:line with a concrete failure scenario. Empty list beats noise.`,
    { label: `find:${d.split(' ')[0]}`, phase: 'Find', model: 'sonnet', schema: FINDINGS }
  ),
  (res, d) => parallel((res?.findings || []).map(f => () =>
    agent(
      `Adversarially VERIFY this finding in ${target}. Try to REFUTE it — read the code, trace the path. Finding: ${JSON.stringify(f)}. real=true only if you confirmed the defect exists and the failure scenario is reachable; default to real=false when uncertain.`,
      { label: `verify:${f.file}`, phase: 'Verify', model: 'sonnet', effort: 'high', schema: VERDICT }
    ).then(v => ({ ...f, dimension: d, verdict: v }))
  ))
)

const confirmed = verified.filter(Boolean).flat().filter(Boolean).filter(f => f.verdict?.real)
log(`${confirmed.length} confirmed findings`)
return { confirmed, note: 'Only adversarially-confirmed findings included. Orchestrator judges severity + fixes.' }
