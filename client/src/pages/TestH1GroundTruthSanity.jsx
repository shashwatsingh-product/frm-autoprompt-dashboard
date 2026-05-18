import { useState } from 'react';

const RISK_SECTIONS = [
  {
    id: 'agent',
    title: 'I. Agent-Specific Failures',
    subtitle: 'Systematic errors made by both AI agents and human reviewers auditing them',
    color: 'rose',
    icon: '◈',
    subsections: [
      {
        agent: 'Catalog Correctness Agent',
        items: [
          {
            label: 'Unit & Spec Contradictions',
            detail: 'Human agents fail to flag conflicting text within the same listing — e.g. 1000ml vs 1.05L, 425g vs 500g, or weight given in "Units" while quantity is in "Kgs/Gms". These self-contradictions in the catalogue go undetected.',
          },
          {
            label: 'Missing Units Not Flagged',
            detail: 'Persistent failure to flag specifications with no units — Water Resistance Depth listed as "30" or "50" (missing m/ATM), power consumption without watts, lamp life without hours. Common across large product categories.',
          },
          {
            label: 'Logic Errors Missed',
            detail: 'Impossible listings pass through unchallenged — e.g. Minimum Age: 3 months and Maximum Age: 3 months on the same product.',
          },
          {
            label: 'Visual vs Text Mismatches',
            detail: 'Subtle and obvious discrepancies between listing text and images are missed — conflicting colours (Blue vs Navy Blue, Pink vs Magenta), or attributes not visible in images (e.g. Surface Styling: Embroidered when no embroidery shown).',
          },
        ],
      },
      {
        agent: 'Decision Agent (Final Adjudication)',
        items: [
          {
            label: 'Severity Oversight',
            detail: 'Major issues labelled as "No Issue" — major leaks, broken products, phone screen damage visible only on the active screen. The threshold for what constitutes a major issue is applied inconsistently.',
          },
          {
            label: 'Misshipment Oversight',
            detail: 'Misshipment cases missed when catalogue and customer images show different branding, logos, or protein variant changes. Brand identity cues are not being treated as misshipment signals.',
          },
          {
            label: 'The Angle Gap',
            detail: 'Customer claims rejected by relying on OBD images that do not cover the side showing actual damage seen in the CX image. OBD and CX images are compared as if they are equivalent views of the same product.',
          },
        ],
      },
      {
        agent: 'Image Adjudication Agent',
        items: [
          {
            label: 'Inventory Mismatch',
            detail: 'Quantity errors not flagged — e.g. three items ordered but only one visible in the OBD image. Agents check product identity but not product count.',
          },
          {
            label: 'Incomplete Issue Logging',
            detail: 'Only a single issue logged (e.g. "Damage") when multiple problems co-exist (e.g. "Damage" + "Wrong Item"). The multi-issue case is systematically under-captured.',
          },
        ],
      },
    ],
  },
  {
    id: 'classification',
    title: 'II. Classification & Can\'t Say Inconsistencies',
    subtitle: 'Contradictions in how ambiguous evidence is handled across agents and reviewers',
    color: 'amber',
    icon: '◉',
    subsections: [
      {
        agent: 'Can\'t Say Logic Breakdown',
        items: [
          {
            label: 'Product Visibility Rule Ignored',
            detail: 'Both AI and human agents mark "Quality Issue" even when the product is obscured (inside opaque packaging or a box) and cannot be objectively validated. The rule is clear — default to "Can\'t Say" when the product isn\'t visible — but it is routinely overridden.',
          },
          {
            label: 'Packaging Damage ≠ Product Damage',
            detail: 'Agents incorrectly flag "Major Damage" based on damaged external packaging (crushed boxes, torn shipping bags) without assessing the actual product condition inside. Packaging damage is used as a proxy for product damage.',
          },
          {
            label: '"Can\'t Say" Reflex Override',
            detail: 'Human reviewers reflexively "dislike" the AI\'s correct "Can\'t Say" decision for genuinely ambiguous cases. This pattern indicates a systemic preference for a definitive label over appropriate ambiguity — undermining the model\'s correct behaviour.',
          },
        ],
      },
    ],
  },
  {
    id: 'workflow',
    title: 'III. Human Agent Workflow Flaws',
    subtitle: 'Behavioural and procedural errors that corrupt the integrity of the final label',
    color: 'violet',
    icon: '◎',
    subsections: [
      {
        agent: 'Workflow & Behavioural Patterns',
        items: [
          {
            label: 'Redundant Work / Over-editing',
            detail: 'Agents frequently "dislike" and then manually re-type the exact same remarks the AI already captured — adding processing time without adding value. Suggests a breakdown in workflow adherence and an inability to trust AI output even when correct.',
          },
          {
            label: '"No Issue" Bias',
            detail: 'A recurring failure pattern: agent correctly "Dislikes" the AI\'s flawed reasoning, but then incorrectly marks the final status as "No Issue" when a clear issue exists. The critique step is done right; the classification step is not.',
          },
          {
            label: 'Confirmation Bias (Passive Verification)',
            detail: 'Agents "Like" (approve) the AI\'s decision despite flawed supporting reasoning — e.g. approving a "Reject" linked to the wrong evidence like "POD to CX". The outcome is checked; the logic behind it is not.',
          },
          {
            label: 'Click-Error Gap (Final Step Error)',
            detail: 'Agents correctly document the issue in their written summary but select the wrong outcome in the dropdown — e.g. writing a summary for "Quality Issue" but selecting "No Issues", or selecting "Reject" instead of "Approve". The analysis is right; the label is wrong.',
          },
          {
            label: 'Guardrail Bypass',
            detail: 'Agents overrule AI prompts about missing OBD images specifically to avoid having to specify the issue in the Tech Tracker — a workaround that injects incorrect labels into the ground truth to reduce their own documentation burden.',
          },
        ],
      },
    ],
  },
];

const COLOR = {
  rose:   { hero: 'from-rose-600 to-rose-700',     light: 'bg-rose-50 border-rose-200',     text: 'text-rose-700',   badge: 'bg-rose-100 text-rose-800',   sub: 'bg-rose-600',   dot: 'bg-rose-400' },
  amber:  { hero: 'from-amber-500 to-amber-600',   light: 'bg-amber-50 border-amber-200',   text: 'text-amber-700',  badge: 'bg-amber-100 text-amber-800', sub: 'bg-amber-500',  dot: 'bg-amber-400' },
  violet: { hero: 'from-violet-600 to-violet-700', light: 'bg-violet-50 border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800',sub: 'bg-violet-600', dot: 'bg-violet-400' },
};

function IssueCard({ label, detail }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border border-slate-200 rounded-lg bg-white cursor-pointer hover:border-slate-300 transition-colors"
      onClick={() => setOpen(o => !o)}
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        <span className="text-slate-400 text-xs ml-2">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="px-4 pb-3 text-xs text-slate-600 leading-relaxed border-t border-slate-100 pt-2">
          {detail}
        </div>
      )}
    </div>
  );
}

function RiskSection({ section }) {
  const c = COLOR[section.color];
  return (
    <div className={`rounded-xl border ${c.light} overflow-hidden`}>
      {/* Section header */}
      <div className={`bg-gradient-to-r ${c.hero} px-5 py-3`}>
        <div className="flex items-center gap-2">
          <span className="text-white text-base">{section.icon}</span>
          <div>
            <h3 className="text-white font-bold text-sm">{section.title}</h3>
            <p className="text-white/70 text-xs mt-0.5">{section.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {section.subsections.map((sub) => (
          <div key={sub.agent}>
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${c.badge} mb-2`}>
              {sub.agent}
            </div>
            <div className="space-y-1.5">
              {sub.items.map(item => (
                <IssueCard key={item.label} label={item.label} detail={item.detail} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TestH1GroundTruthSanity() {
  const totalIssues = RISK_SECTIONS.reduce((a, s) => a + s.subsections.reduce((b, ss) => b + ss.items.length, 0), 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Hero */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 bg-rose-500 rounded-full text-[10px] font-bold uppercase tracking-wide">Hypothesis #1</span>
              <span className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] font-medium text-slate-300">Ground Truth Sanity</span>
            </div>
            <h1 className="text-xl font-bold mt-2">Is Our Labelled Ground Truth Reliable?</h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Audit of labelling quality across human agent behaviour, agent-specific failures, and classification consistency.
              If ground truth is corrupted, all downstream model evaluations are unreliable.
            </p>
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex gap-3 mt-5 flex-wrap">
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Risk Areas</p>
            <p className="text-lg font-bold">3</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Distinct Failure Patterns</p>
            <p className="text-lg font-bold">{totalIssues}</p>
          </div>
          <div className="bg-rose-500/30 border border-rose-400/40 rounded-xl px-4 py-2">
            <p className="text-[10px] text-rose-300">Verdict</p>
            <p className="text-sm font-bold text-rose-200">Ground truth is NOT reliable as-is</p>
          </div>
        </div>
      </div>

      {/* TL;DR */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-2">TL;DR — Key Finding</p>
        <p className="text-sm text-amber-900 leading-relaxed">
          The labelling quality audit reveals systemic issues across all three layers of the labelling pipeline.
          AI agents have structural blind spots (angle gaps, inventory mismatches, missing unit detection).
          Human reviewers introduce noise through confirmation bias, click errors, deliberate guardrail bypasses, and a
          reflexive tendency to override correct "Can't Say" decisions. The result: a ground truth dataset where
          both false positives and false negatives are systematically embedded — making it an unreliable benchmark
          for model evaluation without first quantifying and correcting for these biases.
        </p>
      </div>

      {/* Risk sections */}
      {RISK_SECTIONS.map(s => <RiskSection key={s.id} section={s} />)}

      {/* Implication */}
      <div className="bg-slate-800 rounded-xl p-5 text-white">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3">Implication for Model Evaluation</p>
        <div className="grid grid-cols-1 gap-3 text-sm">
          {[
            ['Accuracy metrics are noisy', 'Model accuracy computed against this ground truth inherits all label errors — inflating or deflating scores depending on which failure mode dominates.'],
            ['Can\'t Say is systematically suppressed', 'Correct AI ambiguity handling is being penalised by human reviewers who prefer definitive labels. Models trained or evaluated on this data will learn to avoid Can\'t Say.'],
            ['Multi-issue cases are under-labelled', 'Single-issue labels on multi-issue incidents mean the model is never rewarded for catching secondary problems — limiting its ability to learn complex cases.'],
            ['Guardrail bypass contaminates OBD labels', 'Deliberate overrides on missing-OBD incidents inject structurally incorrect labels that cannot be identified from the data alone.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-white/5 rounded-lg px-4 py-3">
              <p className="text-xs font-semibold text-rose-300 mb-0.5">{title}</p>
              <p className="text-xs text-slate-300 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
