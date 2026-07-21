// knowledge-harvest.js — build a VERIFIED reference library with a multi-agent pipeline.
//
// For each topic: one agent researches the live web and writes a guide; a DIFFERENT
// agent adversarially verifies every command/API/version against current reality and
// edits the file to fix what's wrong. The discipline that makes it worth trusting:
//
//     a guide an AI wrote is a CLAIM; a guide a second agent verified is EVIDENCE.
//
// First-draft AI content is confidently, plausibly wrong — hallucinated APIs, code that
// crashes, stale versions. A self-review launders those errors (the writer can't see the
// blind spot that made them). An INDEPENDENT reviewer, told to find what's broken, catches
// them. Runs on cheap models; the orchestrator owns the judgment, not the labor.
//
// Used in production to build a 37-guide technical curriculum — every guide reviewed this
// way caught real defects (a nonexistent AWS model ID, an API that AttributeErrors, a
// broken Redis command, dozens of stale version pins) before any human read them.

export const meta = {
  name: 'knowledge-harvest',
  description: 'Research topics into guides, each adversarially reviewed and fixed against the live web',
  phases: [
    { title: 'Write', detail: 'one agent researches + writes each guide' },
    { title: 'Verify & fix', detail: 'a different agent verifies every command and edits the file' },
  ],
}

// args: { outDir, model, context, topics: [{ key, title, focus }] }
const OUT   = (args && args.outDir)  || './guides'
const MODEL = (args && args.model)   || 'sonnet'          // cheap worker; orchestrator judges
const CTX   = (args && args.context) || 'a self-taught engineer leveling up for the job market'
const TOPICS = (args && args.topics) || []

function writePrompt(t) {
  return `You are writing ONE module of a practical skills guide for ${CTX}.

TOPIC: ${t.title}
FOCUS: ${t.focus}

1. Load WebSearch + WebFetch via ToolSearch and run 2-4 searches to ground this in CURRENT tools,
   real command/API syntax, and current version names. Verify — do not rely on memory.
2. Write the guide and SAVE it with the Write tool to EXACTLY: ${OUT}/${t.key}.md
   Sections: (1) what it is & why it matters (2) the mental model (3) how to actually use it —
   REAL commands + power-user tricks, concrete snippets (4) a hands-on exercise (5) 3-5 free resources.
   ~450-750 words, concrete over vague, plain words first then the industry term.
Return ONLY: "${t.key} -> ${OUT}/${t.key}.md"`
}

function reviewPrompt(t) {
  const path = `${OUT}/${t.key}.md`
  return `You are an ADVERSARIAL technical reviewer. Find what is WRONG in a guide and fix it — do not rubber-stamp.

Read ${path}. Load WebSearch + WebFetch and VERIFY against current reality:
- Are all commands, flags, API names, and signatures real and current? (flag hallucinations)
- Are library/tool/version names correct today?
- Is any core concept wrong or a critical one missing?
- Do the resource links plausibly exist?

Then EDIT the file to fix every real problem — keep it tight, preserve structure. Return ONLY a
one-line verdict of what you changed, or "verified — no substantive errors".`
}

phase('Write')
// pipeline: each topic flows write -> verify independently, no barrier between topics.
const results = pipeline(
  TOPICS,
  t => agent(writePrompt(t), { label: 'write:' + t.key, phase: 'Write', model: MODEL, agentType: 'general-purpose' }).then(() => t),
  t => agent(reviewPrompt(t), { label: 'verify:' + t.key, phase: 'Verify & fix', model: MODEL, agentType: 'general-purpose' }).then(v => ({ key: t.key, verdict: v })),
)

const done = (await results).filter(Boolean)
log(`harvested + verified ${done.length}/${TOPICS.length} guides into ${OUT}`)
return { done, failed: TOPICS.filter(t => !done.find(d => d.key === t.key)).map(t => t.key) }
