export const meta = {
  name: 'research-sweep',
  description: 'Multi-angle research sweep: haiku breadth, sonnet depth, completeness critic',
  whenToUse: 'Deep multi-source research question. args: {question, angles?: [..], useCodex?: bool}',
  phases: [
    { title: 'Sweep', detail: 'parallel angle scouts', model: 'haiku' },
    { title: 'Deep-read', detail: 'sonnet deep dive per promising lead', model: 'sonnet' },
    { title: 'Synthesize', detail: 'synthesis + completeness critic', model: 'sonnet' },
  ],
}
// args: { question: string, angles?: [..], useCodex?: bool (route scouts through codex-researcher for live GPT search) }
const q = args?.question
if (!q) throw new Error('args.question required')
const ANGLES = args?.angles || [
  'official documentation / primary sources',
  'recent news + announcements (last 90 days)',
  'community experience (forums, GitHub issues, Reddit/HN)',
  'academic / technical papers if applicable',
]
const scoutOpts = args?.useCodex
  ? { phase: 'Sweep', agentType: 'codex-researcher' }
  : { phase: 'Sweep', model: 'haiku', effort: 'low' }

const leads = await parallel(ANGLES.map(a => () =>
  agent(
    `Research scout. Question: "${q}". Search ONLY through this angle: ${a}. Return the 3-5 most load-bearing leads as: claim — source URL — date. Label each FACT / INFERENCE / UNVERIFIED. No padding.`,
    { ...scoutOpts, label: `sweep:${a.split(' ')[0]}` }
  ).then(r => ({ angle: a, leads: r }))
))

phase('Deep-read')
const deep = await parallel(leads.filter(Boolean).map(l => () =>
  agent(
    `Deep-read researcher. Question: "${q}". Starting leads from the "${l.angle}" angle:\n${typeof l.leads === 'string' ? l.leads : JSON.stringify(l.leads)}\n\nVerify the top leads by actually reading the sources (WebFetch). Correct anything the scout got wrong. Return verified findings with direct links + dates, FACT/INFERENCE/UNVERIFIED labeled.`,
    { label: `deep:${l.angle.split(' ')[0]}`, phase: 'Deep-read', model: 'sonnet' }
  )
))

phase('Synthesize')
const synthesis = await agent(
  `Synthesize an answer to: "${q}" from these verified research tracks:\n\n${deep.filter(Boolean).join('\n\n---\n\n')}\n\nStructure: Answer (facts first, inference marked) / Sources (numbered direct links w/ dates) / Uncertainty (what remains open). Contradictions between tracks must be surfaced, not averaged away.`,
  { label: 'synthesis', model: 'sonnet', effort: 'high' }
)
const critic = await agent(
  `Completeness critic. Question: "${q}". Synthesis:\n${synthesis}\n\nWhat is MISSING? Unchecked angle, unverified load-bearing claim, stale source, unstated assumption. Return a short list or "COMPLETE".`,
  { label: 'critic', model: 'sonnet', effort: 'high' }
)
return { synthesis, critic, note: 'If critic found gaps, orchestrator runs a follow-up round on those gaps only.' }
