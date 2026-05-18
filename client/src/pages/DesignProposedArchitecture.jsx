import { useState, useEffect, useRef } from 'react';
import PageHeader from '../components/PageHeader';

const LAYER_COLORS = {
  ingestion: { bg: 'bg-gray-50', border: 'border-gray-300', accent: 'text-gray-700', dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' },
  deterministic: { bg: 'bg-teal-50', border: 'border-teal-300', accent: 'text-teal-700', dot: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700' },
  l1: { bg: 'bg-emerald-50', border: 'border-emerald-300', accent: 'text-emerald-700', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  router: { bg: 'bg-indigo-50', border: 'border-indigo-300', accent: 'text-indigo-700', dot: 'bg-indigo-500', badge: 'bg-indigo-100 text-indigo-700' },
  evidence: { bg: 'bg-purple-50', border: 'border-purple-300', accent: 'text-purple-700', dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  synthesizer: { bg: 'bg-rose-50', border: 'border-rose-300', accent: 'text-rose-700', dot: 'bg-rose-500', badge: 'bg-rose-100 text-rose-700' },
  decision: { bg: 'bg-amber-50', border: 'border-amber-300', accent: 'text-amber-700', dot: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  telemetry: { bg: 'bg-blue-50', border: 'border-blue-300', accent: 'text-blue-700', dot: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  gepa: { bg: 'bg-cyan-50', border: 'border-cyan-300', accent: 'text-cyan-700', dot: 'bg-cyan-500', badge: 'bg-cyan-100 text-cyan-700' },
};

const LAYERS = [
  {
    id: 'layer0',
    num: 0,
    name: 'Ingestion',
    colorKey: 'ingestion',
    tagline: 'Return event arrives',
    description: 'Return event with structured fields, customer comment, and 0-10 images (catalog, customer, OBD, POD). Unchanged from current architecture.',
    components: [],
    current: 'Same as today — return event from RRR system',
    change: 'No change',
  },
  {
    id: 'layer1',
    num: 1,
    name: 'Deterministic Preparation',
    colorKey: 'deterministic',
    tagline: 'Replaces context_agent — eliminates 1 LLM call per return',
    description: 'A pure-function Jinja-style template constructs the structured narrative from JSON fields. A separate small LLM call (or fine-tuned 1B model) handles only Hinglish translation. Catalog image embeddings looked up from precomputed cache.',
    components: [
      { name: 'JSON → Narrative Template', type: 'deterministic', desc: 'Pure function, zero LLM cost. Same JSON always → same output. Eliminates stochasticity.' },
      { name: 'Hinglish Translator', type: 'fine-tuned-small', desc: 'Fine-tuned 1B model or small Flash-Lite call. Only for translating customer comments.' },
      { name: 'Catalog Embedding Cache', type: 'deterministic', desc: 'Pre-computed image features per SKU. Same catalog images return thousands of times/day.' },
    ],
    current: 'context_agent (v5.0) — LLM call for JSON summarization on every return',
    change: 'Eliminate LLM call. Saves ~12% of total calls. Removes hallucination risk in context.',
    savings: '~12% LLM calls eliminated',
  },
  {
    id: 'layer2',
    num: 2,
    name: 'L1 Fast-Path Classifier',
    colorKey: 'l1',
    tagline: 'The biggest cost lever — handles 60-75% of returns without L2',
    description: 'Single fine-tuned multimodal model consumes the normalized case object and emits {clear_approve | clear_reject | needs_adjudication, confidence}. Targets ≥99.5% precision on auto-decisions.',
    components: [
      { name: 'Fast-Path Classifier', type: 'fine-tuned', desc: 'Gemini Flash-Lite fine-tuned, or 7B open-weights model. Single call, 1-3s latency.' },
    ],
    current: 'Does not exist. ALL returns go through TNS inline recommendation.',
    change: 'NEW — diverts 60-75% of volume away from the full agent stack.',
    savings: '60-75% of returns skip L2 entirely',
    dataValidation: {
      label: 'Validated from 4M returns data (Apr 12-19, 2026)',
      facts: [
        '75.5% of returns are already auto-approved (TNS=APPROVE + completed + no FRM)',
        'SIZE_FIT_ISSUES: 1.24M returns, only 0.7% need FRM — perfect L1 candidate',
        'CUSTOMER_REMORSE: 220K returns, 1.0% FRM touch — auto-approvable',
        'Conservative L1 target: 60% (report) to 75% (data ceiling)',
      ],
    },
  },
  {
    id: 'layer3',
    num: 3,
    name: 'Router / Gating',
    colorKey: 'router',
    tagline: 'Selects 2-4 agents per case instead of running all 8',
    description: 'Deterministic rules + small classifier select which evidence agents to invoke based on return reason, image availability, and L1 reasoning. Only the relevant subset runs.',
    components: [
      { name: 'Rule-Based Router', type: 'deterministic', desc: 'Return-reason → agent mapping. MISSHIPMENT → catalog_vs_evidence + consistency. DAMAGE → image agents + risk.' },
      { name: 'ML Gating Classifier', type: 'fine-tuned-small', desc: 'For cases that don\'t decompose cleanly along reason boundaries. Light gradient-boosted model.' },
    ],
    current: 'Does not exist. All 8 agents run on every case. Only cx_vs_pod is conditional (~35%).',
    change: 'NEW — reduces avg agents/case from 8 to 2-4.',
    savings: 'Avg 50-70% fewer agent calls per L2 case',
    dataValidation: {
      label: 'Routing rules validated from data',
      facts: [
        'MISSHIPMENT (468K): needs catalog_vs_evidence + consistency → 2 agents, not 8',
        'MISSING_ITEM (190K): 67.8% FRM-touched, 19.8% rejected — needs full stack (high fraud)',
        'DAMAGED_PRODUCT (371K): needs image agents + risk → 3-4 agents',
        'No OBD images → skip OBD agent (saves ~30% of image calls)',
        'No POD images → skip cx_vs_pod (already 65% of cases)',
      ],
    },
  },
  {
    id: 'layer4',
    num: 4,
    name: 'Parallel Evidence Agents',
    colorKey: 'evidence',
    tagline: '5 agents replace 8 — merge image agents, fine-tune classifiers',
    description: 'Selected agents run concurrently. Each emits structured output with confidence scores and insufficient-evidence flags. 4 image agents consolidated into 2 parameterized agents.',
    components: [
      { name: 'intent_resonance', type: 'fine-tuned', desc: 'Fine-tuned at 85K labels. Bounded classifier — no need for 12K-token prompted calls.' },
      { name: 'catalog_correctness', type: 'prompted-medium', desc: 'Prompted, medium model. Task too open-ended for fine-tuning (catalog errors are diverse).' },
      { name: 'catalog_vs_evidence', type: 'prompted', desc: 'Parameterized: called once for CX images, once for OBD images. Replaces 2 separate agents.' },
      { name: 'evidence_consistency', type: 'prompted', desc: 'Parameterized: CX-vs-OBD and CX-vs-POD. Fraud detection via cross-reference. Replaces 2 agents.' },
      { name: 'risk_signals', type: 'fine-tuned', desc: 'Fine-tuned + rules. 6 cluster dimensions → bounded classification at 85K labels.' },
    ],
    current: '8 agents: context, intent, catalog, cx_img, obd_img, cx_vs_obd, cx_vs_pod, risk',
    change: 'Merge 4 image agents → 2 parameterized. Fine-tune intent + risk. Drop context_agent.',
    savings: 'Per-call cost reduction via fine-tuned models + fewer agents',
  },
  {
    id: 'layer5',
    num: 5,
    name: 'Synthesizer + L3 Escalation',
    colorKey: 'synthesizer',
    tagline: 'Strong model for decisions, different-vendor escalation for ambiguity',
    description: 'Strong model (Gemini 2.5 Pro) consumes all evidence + L1 reasoning. Emits decision with calibrated confidence. Low confidence triggers L3 escalation to a different-vendor model (Claude Sonnet 4.5) for redundancy.',
    components: [
      { name: 'Synthesizer (L2)', type: 'strong-model', desc: 'Gemini 2.5 Pro. Consumes normalized case + all evidence outputs. Chain-of-thought reasoning.' },
      { name: 'L3 Escalation', type: 'different-vendor', desc: 'Claude Sonnet 4.5. Receives L2 input + synthesizer reasoning. Reduces correlated-error risk.' },
    ],
    current: 'decision_agent (v4.0) — 3 prompt variants by return reason. Gemini 2.5 Flash.',
    change: 'Upgrade to Pro-tier model. Add cross-vendor L3 escalation path.',
    savings: 'Higher accuracy on ambiguous cases. Vendor diversification.',
  },
  {
    id: 'layer6',
    num: 6,
    name: 'Confidence-Based Decision Routing',
    colorKey: 'decision',
    tagline: 'Calibrated confidence replaces binary Approve/Reject',
    description: 'Every decision is paired with a calibrated confidence score (via temperature scaling against 85K labels). Routing thresholds determine: auto-execute, audit sample, escalation, or human review.',
    components: [
      { name: '≥ 0.95 confidence', type: 'auto', desc: 'Auto-execute decision. No human involvement.' },
      { name: '0.80 - 0.95', type: 'audit', desc: 'Auto-execute, but sample 5-10% to human audit queue for calibration monitoring.' },
      { name: '0.60 - 0.80', type: 'escalate', desc: 'Route to L3 escalation if not already done. Retry with stronger model.' },
      { name: '< 0.60', type: 'human', desc: 'Route to human reviewer with full agent reasoning attached. "Can\'t Say" equivalents land here.' },
    ],
    current: 'Binary output: Approve / Reject / Detailed Investigation / Reason Selection Issue',
    change: 'NEW — confidence-driven routing. "Can\'t Say" split into insufficient_evidence vs uncertainty.',
    savings: 'Raises automation rate from 60-70% to 80-88% without increasing error rate',
  },
  {
    id: 'layer7',
    num: 7,
    name: 'Telemetry & Feedback Loop',
    colorKey: 'telemetry',
    tagline: 'Closed-loop learning — every correction improves the system',
    description: 'Full per-decision tracing. Human overrides feed back via 3 channels: training data growth, few-shot index updates, and drift detection alerts. Per-cohort metrics computed daily.',
    components: [
      { name: 'Channel 1: Training Data', type: 'auto', desc: 'Every human override appended to labelled dataset for relevant agent. Continuous growth.' },
      { name: 'Channel 2: Few-Shot Index', type: 'auto', desc: 'Recent corrections injected into retrieval index for dynamic few-shot agents. Immediate effect.' },
      { name: 'Channel 3: Drift Detection', type: 'alert', desc: 'Rising override rate on a cohort or agent = earliest signal of distribution shift.' },
    ],
    current: 'Manual prompt versioning. No systematic feedback loops. No per-cohort alerting.',
    change: 'NEW — closed-loop system with 3 feedback channels.',
    savings: 'Continuous accuracy improvement without manual prompt iteration cycles',
  },
  {
    id: 'layer8',
    num: 8,
    name: 'GEPA Auto-Prompt Optimizer',
    colorKey: 'gepa',
    tagline: 'Genetic-Pareto prompt evolution — automated prompt engineering at scale',
    description: 'GEPA (Genetic-Pareto) uses evolutionary algorithms with LLM-based reflection to automatically optimize prompts. Instead of reducing evaluation to a single scalar reward, GEPA reads full execution traces — errors, reasoning chains, failure modes — to diagnose WHY a prompt fails and propose targeted fixes. Pareto-based selection maintains diverse prompt variants optimized for different cohort tradeoffs. Accepted at ICLR 2026 (Oral). Outperforms GRPO by 6% avg (up to 20%) using 35x fewer rollouts, and MIPROv2 by 10%+.',
    components: [
      { name: 'Binary Decomposition', type: 'preprocessing', desc: 'Split multi-class agents into binary sub-tasks: "Is this misshipment? Y/N", "Is damage major? Y/N". GEPA optimizes binary prompts more effectively — tighter search space, cleaner fitness signal.' },
      { name: 'Trajectory Sampling', type: 'gepa-core', desc: 'Capture full execution paths per return: reasoning chains, image analysis steps, intermediate outputs, final verdict. Rich signal for GEPA reflection.' },
      { name: 'Reflective Mutation', type: 'gepa-core', desc: 'LLM analyzes failure traces in natural language, diagnoses root causes ("misclassifies dark-colored products as damaged"), proposes targeted prompt edits. Not random mutation.' },
      { name: 'Pareto Selection', type: 'gepa-core', desc: 'Maintains frontier of non-dominated prompts. A prompt excelling on LIFESTYLE returns and one excelling on ELECTRONICS both survive. Prevents convergence to single local optimum.' },
      { name: 'Cohort-Specific Optimization', type: 'application', desc: 'Run GEPA per cohort (marketplace x vertical x reason). 566 cohorts with >1K returns from 1-week data. Each cohort gets its own optimized prompt variant.' },
      { name: 'Fitness Function', type: 'evaluation', desc: 'Uses 85K labelled ground truth. Split: 5K frozen golden set (validation), 10K calibration, remainder for GEPA training. Fitness = accuracy + calibrated confidence + false-positive cost weighting.' },
    ],
    current: 'Manual prompt engineering. Version iterations (v1.0→v5.0) by hand. No systematic optimization. Same prompt for all cohorts.',
    change: 'NEW — automated prompt evolution. Per-cohort optimization. Binary decomposition for bounded classifiers.',
    savings: '5-15% accuracy improvement on tail cohorts (per industry benchmarks). Eliminates manual prompt iteration cycles.',
    dataValidation: {
      label: 'GEPA applicability validated from data',
      facts: [
        '85K labelled records → sufficient for train/val/test splits per GEPA requirements',
        '566 cohorts with >1K returns → enough data for per-cohort optimization',
        'Binary-decomposable agents: intent (Issue/No Issue), risk (Issue/No Issue), catalog (Issue/No Issue)',
        'High variance across cohorts: computer+DEFECTIVE=84.5% reject vs t_shirt+SIZE_FIT=0.5% → cohort-specific prompts will outperform universal ones',
        'Current prompts: 12K-15K tokens with static few-shot examples → GEPA can find shorter, more effective variants',
      ],
    },
  },
];

const COMPARISON_DATA = {
  current: { calls_week: '8.7M', cost_week: '~$8,700', p50_latency: '30-45s', p95_latency: '60-90s', automation: '60-70%', agents: 9, models: 1 },
  proposed: { calls_week: '~4-5M', cost_week: '~$2,600-3,400', p50_latency: '~3s', p95_latency: '~14s', automation: '80-88%', agents: '5+2', models: '3-4' },
};

const AGENT_MIGRATION = [
  { current: 'context_agent', proposed: 'Deterministic template + Hinglish translator', change: 'eliminate', reason: 'JSON→narrative is a pure function. LLM call adds stochasticity and cost for zero judgment.' },
  { current: 'intent_resonance', proposed: 'intent_resonance (fine-tuned)', change: 'fine-tune', reason: '85K labels. Bounded 3-class classifier. Fine-tuning beats 12K-token prompted calls.' },
  { current: 'catalog_correctness', proposed: 'catalog_correctness (prompted, medium model)', change: 'downsize', reason: 'Keep prompted (diverse failure modes) but use cheaper medium model.' },
  { current: 'image_adjudication_cx', proposed: 'catalog_vs_evidence(source=CX)', change: 'merge', reason: 'CX and OBD agents share 90%+ identical logic. Parameterize, don\'t duplicate.' },
  { current: 'image_adjudication_obd', proposed: 'catalog_vs_evidence(source=OBD)', change: 'merge', reason: 'Same framework, different image source. One agent, two invocations.' },
  { current: 'cx_vs_obd', proposed: 'evidence_consistency(pair=CX_OBD)', change: 'merge', reason: 'CX-vs-OBD and CX-vs-POD share fraud detection framework. Parameterize.' },
  { current: 'cx_vs_pod', proposed: 'evidence_consistency(pair=CX_POD)', change: 'merge', reason: 'Same logic, conditional on POD availability. One agent handles both.' },
  { current: 'risk_signals', proposed: 'risk_signals (fine-tuned + rules)', change: 'fine-tune', reason: '6 cluster inputs → 3-class output. Perfect fine-tuning candidate at 85K labels.' },
  { current: 'decision_agent', proposed: 'Synthesizer (Gemini 2.5 Pro)', change: 'upgrade', reason: 'Needs strong reasoning. Upgrade from Flash to Pro. Add L3 escalation path.' },
  { current: '—', proposed: 'L1 Fast-Path Classifier', change: 'new', reason: 'Diverts 60-75% of volume. Single biggest cost lever.' },
  { current: '—', proposed: 'Router / Gating', change: 'new', reason: 'Selects 2-4 agents instead of 8. Second biggest cost lever.' },
  { current: '—', proposed: 'L3 Escalation (Claude Sonnet 4.5)', change: 'new', reason: 'Different-vendor safety net. Reduces correlated-error risk on hard cases.' },
];

const CHANGE_COLORS = {
  eliminate: 'bg-red-100 text-red-700 border-red-200',
  'fine-tune': 'bg-blue-100 text-blue-700 border-blue-200',
  merge: 'bg-purple-100 text-purple-700 border-purple-200',
  downsize: 'bg-teal-100 text-teal-700 border-teal-200',
  upgrade: 'bg-amber-100 text-amber-700 border-amber-200',
  new: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

const ROADMAP = [
  {
    tier: 1, label: 'Tier 1 — Foundations', months: 'Month 1-3', color: 'border-emerald-400 bg-emerald-50',
    items: [
      'Structured outputs on all agents (JSON mode / responseSchema)',
      'Parallel execution of agents 2-8 (already partially done)',
      'Shadow-mode evaluation harness (run new vs old, compare offline)',
      'Confidence scores on all agent outputs (verbalized + logprob)',
      'Frozen golden eval set (5K stratified from 614K labels)',
    ],
  },
  {
    tier: 2, label: 'Tier 2 — Architecture', months: 'Month 3-9', color: 'border-blue-400 bg-blue-50',
    items: [
      'L1 fast-path classifier (fine-tuned on 85K labels)',
      'Replace context_agent with deterministic template',
      'Merge 4 image agents → 2 parameterized agents',
      'Router/gating logic (conditional agent invocation)',
      'Confidence-calibrated decision routing (temperature scaling)',
    ],
  },
  {
    tier: 3, label: 'Tier 3 — Optimization', months: 'Month 6-14', color: 'border-purple-400 bg-purple-50',
    items: [
      'Fine-tune intent_resonance + risk_signals',
      'Dynamic few-shot retrieval (replace static 15K-token prompts)',
      'L3 escalation to different-vendor model',
      'Catalog image embedding cache (precompute per SKU)',
      'Per-cohort drift alerting + online feedback loops',
      'GEPA auto-prompt optimizer: binary decomposition + per-cohort evolution',
      'GEPA Pareto frontier: maintain diverse prompt variants per agent per cohort',
    ],
  },
];

function DownArrow({ label, split }) {
  return (
    <div className="flex flex-col items-center py-2">
      <div className="w-0.5 h-6 bg-gray-300" />
      {split ? (
        <div className="flex items-center gap-1">
          <svg className="w-3 h-3 text-emerald-400 -rotate-45" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
          <svg className="w-3 h-3 text-gray-300" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
          <svg className="w-3 h-3 text-amber-400 rotate-45" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
        </div>
      ) : (
        <svg className="w-3 h-3 text-gray-300" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
      )}
      {label && <span className="text-[9px] text-gray-400 mt-0.5 font-medium">{label}</span>}
    </div>
  );
}

function LayerCard({ layer, isExpanded, onToggle }) {
  const c = LAYER_COLORS[layer.colorKey];
  return (
    <div className={`rounded-xl border-2 ${c.border} ${isExpanded ? c.bg : 'bg-white'} transition-all`}>
      <button onClick={onToggle} className="w-full p-5 text-left cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${c.dot}`}>
              {layer.num}
            </span>
            <div>
              <h3 className="font-bold text-gray-900">{layer.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{layer.tagline}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {layer.savings && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">{layer.savings}</span>
            )}
            <span className={`transition-transform text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}>&#9662;</span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4">
          <p className="text-sm text-gray-700 leading-relaxed">{layer.description}</p>

          {layer.components.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {layer.components.map(comp => (
                <div key={comp.name} className="bg-white/80 rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                    <span className="text-sm font-semibold text-gray-800">{comp.name}</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${c.badge}`}>{comp.type}</span>
                  <p className="text-xs text-gray-600 mt-2">{comp.desc}</p>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-red-50/60 rounded-lg p-3 border border-red-100">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Current State</p>
              <p className="text-xs text-gray-700">{layer.current}</p>
            </div>
            <div className="bg-emerald-50/60 rounded-lg p-3 border border-emerald-100">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">What Changes</p>
              <p className="text-xs text-gray-700">{layer.change}</p>
            </div>
          </div>

          {layer.dataValidation && (
            <div className="bg-blue-50/60 rounded-lg p-3 border border-blue-200">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">{layer.dataValidation.label}</p>
              <ul className="space-y-1">
                {layer.dataValidation.facts.map((f, i) => (
                  <li key={i} className="text-xs text-gray-700 flex gap-2">
                    <span className="text-blue-400 flex-shrink-0">&bull;</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnimatedPipelineFlow() {
  const [path, setPath] = useState('fast');
  const [isPlaying, setIsPlaying] = useState(false);
  const [t, setT] = useState(0);
  const rafRef = useRef(null);
  const t0Ref = useRef(null);

  const PIPELINE_END = path === 'fast' ? 3.5 : 14;
  const MAX = PIPELINE_END + 1;

  const play = () => { t0Ref.current = performance.now(); setT(0); setIsPlaying(true); };
  const reset = () => { cancelAnimationFrame(rafRef.current); setT(0); setIsPlaying(false); };
  const switchPath = (p) => { reset(); setPath(p); };

  useEffect(() => {
    if (!isPlaying) return;
    const speed = path === 'fast' ? 3 : 4;
    const max = path === 'fast' ? 4.5 : 15;
    const tick = (now) => {
      const s = (now - t0Ref.current) / 1000 * speed;
      if (s >= max) { setT(max); setIsPlaying(false); return; }
      setT(s);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, path]);

  const lit = (th) => t >= th;
  const between = (a, b) => t >= a && t < b;
  const pipeTime = Math.min(t, PIPELINE_END).toFixed(1);
  const finished = t >= PIPELINE_END + 0.5;

  const EVIDENCE_AGENTS = [
    { name: 'intent_resonance', selected: true },
    { name: 'catalog_correctness', selected: false },
    { name: 'catalog_vs_evidence', selected: true },
    { name: 'evidence_consistency', selected: true },
    { name: 'risk_signals', selected: false },
  ];

  return (
    <div className="bg-gradient-to-br from-slate-50 to-emerald-50/30 rounded-2xl border border-gray-200 p-6 mb-8 overflow-hidden">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Live Pipeline Animation</h2>
          <p className="text-xs text-gray-400 mt-0.5">Tiered cascade: most returns resolve at L1 in seconds</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => switchPath('fast')} className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${path === 'fast' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Fast Path (65%)
            </button>
            <button onClick={() => switchPath('full')} className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-colors cursor-pointer ${path === 'full' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Full Path (35%)
            </button>
          </div>
          <button onClick={isPlaying ? reset : play} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${isPlaying ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {isPlaying ? '■ Stop' : t > 0 ? '▶ Replay' : '▶ Play'}
          </button>
          <div className={`font-mono text-xl font-bold tabular-nums px-4 py-1 rounded-lg border-2 min-w-[80px] text-center transition-colors ${finished ? (path === 'fast' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-indigo-50 border-indigo-300 text-indigo-700') : t > 0 ? 'bg-gray-900 border-gray-700 text-emerald-400' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
            {pipeTime}s
          </div>
        </div>
      </div>

      <div className="h-2 bg-gray-200 rounded-full mb-6 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-75 ${path === 'fast' ? 'bg-gradient-to-r from-teal-400 to-emerald-500' : 'bg-gradient-to-r from-indigo-400 via-purple-500 to-rose-500'}`} style={{ width: `${Math.min(t / PIPELINE_END * 100, 100)}%` }} />
      </div>

      <div className="flex flex-col items-center gap-2">
        {/* Return Request */}
        <div className={`rounded-xl border-2 px-6 py-2.5 transition-all duration-300 ${lit(0.2) ? 'border-gray-400 bg-white shadow-md' : 'border-gray-200 bg-gray-100/50 opacity-25'}`}>
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            {between(0.2, 0.5) && <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />}
            Return Request
          </span>
        </div>
        <div className={`w-0.5 h-4 rounded transition-colors duration-300 ${lit(0.3) ? 'bg-teal-400' : 'bg-gray-200'}`} />

        {/* Layer 1: Deterministic Prep */}
        <div className={`rounded-xl border-2 px-6 py-2 transition-all duration-300 ${lit(0.3) ? 'border-teal-400 bg-teal-50 shadow-md' : 'border-gray-200 bg-gray-50 opacity-25'}`}>
          <p className="text-xs font-bold text-teal-700 text-center">Layer 1 — Deterministic Prep</p>
          <p className="text-[9px] text-teal-600 text-center">Template + translate &middot; <span className="font-bold">No LLM call</span></p>
        </div>
        {lit(0.4) && (
          <span className="text-[9px] text-teal-600 font-bold bg-teal-100 px-2 py-0.5 rounded-full transition-all duration-300">⚡ 0.1s — deterministic, zero cost</span>
        )}
        <div className={`w-0.5 h-4 rounded transition-colors duration-300 ${lit(0.5) ? 'bg-emerald-400' : 'bg-gray-200'}`} />

        {/* Layer 2: L1 Classifier */}
        <div className={`rounded-xl border-2 px-6 py-2.5 text-center transition-all duration-500 ${lit(0.5) ? 'border-emerald-400 bg-emerald-50 shadow-lg' : 'border-gray-200 bg-gray-50 opacity-25'} ${between(0.5, 3) ? 'ring-4 ring-emerald-300/30 animate-pulse' : ''}`}>
          <p className="text-xs font-bold text-emerald-700">Layer 2 — L1 Fast-Path Classifier</p>
          <p className="text-[9px] text-emerald-600">Fine-tuned multimodal &middot; single call &middot; 1-3s</p>
          {between(0.5, 3) && <p className="text-[9px] text-emerald-500 font-mono mt-1">{Math.min(t - 0.5, 2.5).toFixed(1)}s / 2.5s</p>}
        </div>

        {/* SPLIT POINT */}
        {path === 'fast' ? (
          <>
            <div className={`w-0.5 h-5 rounded transition-colors duration-300 ${lit(3) ? 'bg-emerald-500' : 'bg-gray-200'}`} />
            {lit(3) && (
              <span className="text-[9px] text-emerald-700 font-bold bg-emerald-100 px-3 py-1 rounded-full animate-pulse">✓ High Confidence — resolved at L1!</span>
            )}
            <div className={`flex gap-3 mt-1 transition-all duration-500 ${lit(3.2) ? 'opacity-100' : 'opacity-20'}`}>
              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-100 px-6 py-3 shadow-lg text-center">
                <span className="text-lg">✓</span>
                <p className="text-sm font-bold text-emerald-700">Auto-Resolved</p>
                <p className="text-[10px] text-emerald-600">Approve / Reject — no agents needed</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={`w-0.5 h-3 rounded transition-colors duration-300 ${lit(3) ? 'bg-amber-400' : 'bg-gray-200'}`} />
            {lit(3) && (
              <span className="text-[9px] text-amber-700 font-bold bg-amber-100 px-3 py-1 rounded-full">⚠ Low Confidence — needs full adjudication</span>
            )}
            <div className={`w-0.5 h-3 rounded transition-colors duration-300 ${lit(3.2) ? 'bg-indigo-400' : 'bg-gray-200'}`} />

            {/* Layer 3: Router */}
            <div className={`rounded-xl border-2 px-6 py-2 text-center transition-all duration-300 ${lit(3.2) ? 'border-indigo-400 bg-indigo-50 shadow-md' : 'border-gray-200 bg-gray-50 opacity-25'}`}>
              <p className="text-xs font-bold text-indigo-700">Layer 3 — Router / Gating</p>
              <p className="text-[9px] text-indigo-600">Selects <span className="font-bold">3 of 5</span> agents for this case</p>
            </div>
            <div className={`w-0.5 h-4 rounded transition-colors duration-300 ${lit(3.5) ? 'bg-purple-400' : 'bg-gray-200'}`} />

            {/* Layer 4: Evidence Agents */}
            <div className={`relative w-full max-w-3xl border-2 border-dashed rounded-2xl p-4 transition-all duration-500 ${lit(3.5) ? 'border-purple-300 bg-white/70 shadow-lg' : 'border-gray-200 bg-gray-50/30 opacity-25'}`}>
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 py-0.5 rounded-full border border-purple-200 whitespace-nowrap flex items-center gap-2">
                <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Layer 4 — Only Selected Agents</span>
                {between(4, 8) && <span className="text-[10px] text-purple-400 font-mono">{Math.min(t - 3.5, 4.5).toFixed(1)}s</span>}
              </div>
              <div className="grid grid-cols-5 gap-2 mt-1">
                {EVIDENCE_AGENTS.map((agent) => (
                  <div key={agent.name} className={`rounded-lg border-2 py-2 px-1 text-center transition-all duration-500 ${
                    agent.selected
                      ? (lit(8) ? 'border-purple-300 bg-purple-100' : between(4, 8) ? 'border-purple-400 bg-purple-50 ring-2 ring-purple-300/40 animate-pulse' : lit(3.5) ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50 opacity-25')
                      : (lit(3.5) ? 'border-gray-200 bg-gray-100/50 opacity-40' : 'border-gray-200 bg-gray-50 opacity-25')
                  }`}>
                    <p className={`text-[9px] font-bold leading-tight ${agent.selected ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{agent.name}</p>
                    {agent.selected && lit(8) && <span className="text-emerald-500 text-xs">✓</span>}
                    {!agent.selected && lit(3.5) && <span className="text-[8px] text-gray-400 italic">skipped</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className={`w-0.5 h-4 rounded transition-colors duration-300 ${lit(8.5) ? 'bg-rose-400' : 'bg-gray-200'}`} />

            {/* Layer 5: Synthesizer + L3 */}
            <div className={`flex items-center gap-3 transition-all duration-500 ${lit(8.5) ? 'opacity-100' : 'opacity-25'}`}>
              <div className={`rounded-xl border-2 px-5 py-2.5 text-center transition-all duration-500 ${lit(8.5) ? 'border-rose-400 bg-rose-50 shadow-lg' : 'border-gray-200 bg-gray-50'} ${between(8.5, 11) ? 'ring-4 ring-rose-300/30 animate-pulse' : ''}`}>
                <p className="text-xs font-bold text-rose-700">Synthesizer</p>
                <p className="text-[9px] text-rose-600">Gemini 2.5 Pro</p>
                {between(8.5, 11) && <p className="text-[9px] text-rose-500 font-mono mt-1">{(Math.min(t, 11) - 8.5).toFixed(1)}s</p>}
              </div>
              {lit(11) && (
                <>
                  <div className="flex items-center gap-1">
                    <div className="w-5 h-0.5 bg-orange-300" />
                    <span className="text-[8px] text-orange-500 font-medium">low conf?</span>
                    <div className="w-5 h-0.5 bg-orange-300" />
                  </div>
                  <div className={`rounded-xl border-2 border-orange-300 bg-orange-50 px-5 py-2.5 text-center shadow-md transition-all duration-500 ${between(11, 12) ? 'ring-2 ring-orange-300/30 animate-pulse' : ''}`}>
                    <p className="text-xs font-bold text-orange-700">L3 Escalation</p>
                    <p className="text-[9px] text-orange-600">Claude Sonnet 4.5</p>
                  </div>
                </>
              )}
            </div>

            <div className={`w-0.5 h-4 rounded transition-colors duration-300 ${lit(12.5) ? 'bg-amber-400' : 'bg-gray-200'}`} />

            {/* Layer 6: Confidence Routing */}
            <div className={`flex gap-2 transition-all duration-500 ${lit(12.5) ? 'opacity-100' : 'opacity-20'}`}>
              {[
                { l: 'Auto-Execute', sub: '≥ 0.95', c: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
                { l: 'Auto + Audit', sub: '0.80-0.95', c: 'bg-blue-100 text-blue-700 border-blue-300' },
                { l: 'Escalate', sub: '0.60-0.80', c: 'bg-amber-100 text-amber-700 border-amber-300' },
                { l: 'Human', sub: '< 0.60', c: 'bg-red-100 text-red-700 border-red-300' },
              ].map(o => (
                <div key={o.l} className={`rounded-lg px-3 py-2 text-center border-2 ${o.c} ${lit(13) ? 'shadow-md' : ''}`}>
                  <p className="text-[10px] font-bold">{o.l}</p>
                  <p className="text-[8px] opacity-75">{o.sub}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Summary */}
      <div className={`mt-6 transition-all duration-700 ${finished ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {path === 'fast' ? (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-5">
            <div className="flex items-center justify-center gap-6 mb-3 flex-wrap">
              {[
                { v: '~3s', l: 'Total Latency' },
                { v: '1', l: 'LLM Call' },
                { v: '0', l: 'Evidence Agents' },
                { v: '65%', l: 'Of All Returns' },
              ].map((s, i) => (
                <div key={s.l} className="flex items-center gap-4">
                  {i > 0 && <div className="w-px h-8 bg-emerald-200 hidden sm:block" />}
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-700">{s.v}</p>
                    <p className="text-[10px] text-emerald-500 uppercase font-bold">{s.l}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-emerald-600 text-center">SIZE_FIT, CUSTOMER_REMORSE, and simple returns resolved instantly at L1 — never touching evidence agents</p>
          </div>
        ) : (
          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5">
            <div className="flex items-center justify-center gap-6 mb-3 flex-wrap">
              {[
                { v: '~14s', l: 'Total Latency' },
                { v: '3-4', l: 'LLM Calls' },
                { v: '3 of 5', l: 'Agents Used' },
                { v: '35%', l: 'Of All Returns' },
              ].map((s, i) => (
                <div key={s.l} className="flex items-center gap-4">
                  {i > 0 && <div className="w-px h-8 bg-indigo-200 hidden sm:block" />}
                  <div className="text-center">
                    <p className="text-2xl font-bold text-indigo-700">{s.v}</p>
                    <p className="text-[10px] text-indigo-500 uppercase font-bold">{s.l}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-indigo-600 text-center">Complex returns get full evidence analysis — but only with relevant agents, not all 8</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DesignProposedArchitecture() {
  const [expandedLayer, setExpandedLayer] = useState(null);
  const [showMigrationTable, setShowMigrationTable] = useState(false);

  const toggleLayer = (id) => setExpandedLayer(prev => prev === id ? null : id);

  return (
    <div>
      <PageHeader
        title="Proposed Architecture"
        subtitle="Target-State Design for Returns Adjudication — Based on Industry Research Report"
      />

      {/* Source Attribution */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-indigo-500 text-lg flex-shrink-0">&#9432;</span>
          <div>
            <p className="text-sm font-semibold text-indigo-800">Based on: "Architecture & Design Patterns for LLM-Powered Product Return Adjudication at Scale"</p>
            <p className="text-xs text-indigo-600 mt-1">Gemini-generated industry research report (Apr 2026) — cross-referenced with 4M actual return records from Bigfoot (Apr 12-19, 2026). Key sources: Amazon Returns ML, Klarna AI, DoorDash, Stripe Radar, PayPal Disputes, Anthropic/OpenAI agent design patterns.</p>
          </div>
        </div>
      </div>

      {/* Top 6 Recommendations */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Six Core Recommendations</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { num: 1, title: 'Tiered Cascade', desc: 'L1 cheap fast-path handles 60-75% of returns. L2 full agent stack on residual. L3 stronger model for ambiguous tail.', impact: '55-70% cost reduction', color: 'border-emerald-300 bg-emerald-50' },
            { num: 2, title: 'Parallel + Synthesizer', desc: 'Evidence agents run concurrently, not sequentially. Only synthesizer is sequential.', impact: 'P50 latency: 45s → 3s', color: 'border-blue-300 bg-blue-50' },
            { num: 3, title: 'Kill context_agent', desc: 'Replace LLM summarization with deterministic template. Only Hinglish translation needs LLM.', impact: '12% fewer LLM calls', color: 'border-teal-300 bg-teal-50' },
            { num: 4, title: 'Fine-Tune Classifiers', desc: '85K labels → fine-tune intent_resonance + risk_signals. Keep prompted reasoning for image + decision.', impact: '40-60% per-call savings', color: 'border-purple-300 bg-purple-50' },
            { num: 5, title: 'Confidence Routing', desc: 'Calibrated scores via temperature scaling. Route by confidence, not binary labels. Split "Can\'t Say".', impact: 'Automation: 70% → 85%', color: 'border-amber-300 bg-amber-50' },
            { num: 6, title: 'GEPA Auto-Prompt', desc: 'Genetic-Pareto prompt evolution. Binary decomposition per agent. Per-cohort optimization across 566 cohorts. ICLR 2026 Oral.', impact: '+5-15% tail accuracy', color: 'border-cyan-300 bg-cyan-50' },
          ].map(r => (
            <div key={r.num} className={`rounded-xl border-2 ${r.color} p-4`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-full bg-gray-800 text-white text-xs font-bold flex items-center justify-center">{r.num}</span>
                <span className="text-sm font-bold text-gray-900">{r.title}</span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed mb-3">{r.desc}</p>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-white border border-gray-200 text-gray-700">{r.impact}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Comparison: Current vs Proposed */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Current vs Proposed — At a Glance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-left">Metric</th>
                <th className="px-4 py-3 text-xs font-semibold text-red-600 uppercase text-left">Current</th>
                <th className="px-4 py-3 text-xs font-semibold text-emerald-600 uppercase text-left">Proposed</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase text-left">Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { metric: 'LLM Calls / Week', curr: '~8.7M', prop: '~4-5M', delta: '-43-50%', good: true },
                { metric: 'Cost / Week', curr: '~$8,700', prop: '~$2,600-3,400', delta: '-55-70%', good: true },
                { metric: 'P50 Latency', curr: '30-45s', prop: '~3s', delta: '10x faster', good: true },
                { metric: 'P95 Latency', curr: '60-90s', prop: '~14s', delta: '4-6x faster', good: true },
                { metric: 'Automation Rate', curr: '60-70%', prop: '80-88%', delta: '+15-25pp', good: true },
                { metric: 'Agent Count', curr: '9 (all run)', prop: '5 evidence + 2 new', delta: 'Conditional invocation', good: true },
                { metric: 'Model Vendors', curr: '1 (Gemini Flash)', prop: '3-4 (Flash-Lite, Pro, Claude)', delta: 'Diversified', good: true },
                { metric: 'Confidence Scoring', curr: 'None', prop: 'Calibrated (temperature scaling)', delta: 'NEW', good: true },
                { metric: 'Feedback Loops', curr: 'None', prop: '3 channels (training, few-shot, drift)', delta: 'NEW', good: true },
              ].map(row => (
                <tr key={row.metric} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-800">{row.metric}</td>
                  <td className="px-4 py-2 text-gray-600">{row.curr}</td>
                  <td className="px-4 py-2 text-gray-600">{row.prop}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${row.good ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {row.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatedPipelineFlow />

      {/* Pipeline Flow Diagram */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-6">Target-State Pipeline Flow</h2>

        {/* Layer 0: Ingestion */}
        <div className="flex items-center justify-center mb-1">
          <div className="bg-gray-100 rounded-lg px-6 py-2 text-sm font-semibold text-gray-700 border border-gray-200">
            Return Event (structured fields + comment + 0-10 images)
          </div>
        </div>
        <DownArrow />

        {/* Layer 1: Deterministic Prep */}
        <div className="flex items-center justify-center mb-1">
          <div className="bg-teal-50 rounded-xl px-6 py-3 border-2 border-teal-300 max-w-md text-center">
            <p className="text-xs font-bold text-teal-700 uppercase">Layer 1 — Deterministic Prep</p>
            <p className="text-[10px] text-teal-600 mt-1">Template + Hinglish translate + catalog cache</p>
            <span className="text-[9px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-bold mt-1 inline-block">No LLM call (except translation)</span>
          </div>
        </div>
        <DownArrow />

        {/* Layer 2: L1 Classifier — splits into two paths */}
        <div className="flex items-center justify-center mb-1">
          <div className="bg-emerald-50 rounded-xl px-6 py-3 border-2 border-emerald-300 max-w-md text-center">
            <p className="text-xs font-bold text-emerald-700 uppercase">Layer 2 — L1 Fast-Path Classifier</p>
            <p className="text-[10px] text-emerald-600 mt-1">Fine-tuned multimodal model &middot; 1-3s</p>
            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold mt-1 inline-block">60-75% of returns resolved here</span>
          </div>
        </div>

        {/* Split: Fast-path vs Adjudication */}
        <div className="flex items-center justify-center gap-8 py-3">
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 bg-emerald-300" />
            <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
            <span className="text-[9px] text-emerald-600 font-bold mt-0.5">High Confidence</span>
            <div className="flex gap-2 mt-2">
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-200 font-bold">Auto-Approve</span>
              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded-lg border border-red-200 font-bold">Auto-Reject</span>
            </div>
            <span className="text-[9px] text-gray-400 mt-1">→ Layer 6 (Decision Routing)</span>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-0.5 h-4 bg-amber-300" />
            <svg className="w-3 h-3 text-amber-400" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
            <span className="text-[9px] text-amber-600 font-bold mt-0.5">Needs Adjudication</span>
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded-lg border border-amber-200 font-bold mt-2">25-40% of returns</span>
            <span className="text-[9px] text-gray-400 mt-1">→ Layer 3 (Router)</span>
          </div>
        </div>

        {/* Layer 3: Router */}
        <div className="flex items-center justify-center mb-1">
          <div className="bg-indigo-50 rounded-xl px-6 py-3 border-2 border-indigo-300 max-w-md text-center">
            <p className="text-xs font-bold text-indigo-700 uppercase">Layer 3 — Router / Gating</p>
            <p className="text-[10px] text-indigo-600 mt-1">Rules + ML classifier &middot; Selects 2-4 agents per case</p>
          </div>
        </div>
        <DownArrow />

        {/* Layer 4: Parallel Evidence Agents */}
        <div className="relative border-2 border-dashed border-purple-200 rounded-2xl p-5 mb-2 bg-purple-50/30">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 py-0.5 rounded-full border border-purple-200">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">Layer 4 — Parallel Evidence Agents (conditionally invoked)</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-2">
            {[
              { name: 'intent_resonance', tag: 'Fine-tuned', color: 'border-blue-300 bg-blue-50' },
              { name: 'catalog_correctness', tag: 'Prompted', color: 'border-teal-300 bg-teal-50' },
              { name: 'catalog_vs_evidence', tag: 'Parameterized', color: 'border-purple-300 bg-purple-50' },
              { name: 'evidence_consistency', tag: 'Parameterized', color: 'border-amber-300 bg-amber-50' },
              { name: 'risk_signals', tag: 'Fine-tuned', color: 'border-blue-300 bg-blue-50' },
            ].map(a => (
              <div key={a.name} className={`rounded-xl border-2 ${a.color} p-3 text-center`}>
                <p className="text-xs font-bold text-gray-800">{a.name}</p>
                <span className="text-[9px] font-bold text-gray-500 mt-1 inline-block">{a.tag}</span>
                <p className="text-[9px] text-gray-400 mt-1">confidence + evidence</p>
              </div>
            ))}
          </div>
        </div>
        <DownArrow label="All evidence outputs collected" />

        {/* Layer 5: Synthesizer */}
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="bg-rose-50 rounded-xl px-5 py-3 border-2 border-rose-300 text-center">
            <p className="text-xs font-bold text-rose-700 uppercase">Layer 5 — Synthesizer</p>
            <p className="text-[10px] text-rose-600 mt-1">Gemini 2.5 Pro</p>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-[9px] text-gray-400">low conf</span>
            <div className="w-8 h-0.5 bg-gray-300" />
            <svg className="w-3 h-3 text-gray-300 -mt-0.5" viewBox="0 0 12 12"><path d="M2 2 L10 6 L2 10" fill="currentColor" /></svg>
          </div>
          <div className="bg-orange-50 rounded-xl px-5 py-3 border-2 border-orange-300 text-center">
            <p className="text-xs font-bold text-orange-700 uppercase">L3 Escalation</p>
            <p className="text-[10px] text-orange-600 mt-1">Claude Sonnet 4.5</p>
          </div>
        </div>
        <DownArrow />

        {/* Layer 6: Decision Routing */}
        <div className="flex items-center justify-center gap-2 mb-4">
          {[
            { label: 'Auto-Execute', conf: '≥ 0.95', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
            { label: 'Auto + Audit', conf: '0.80-0.95', color: 'bg-blue-100 text-blue-700 border-blue-200' },
            { label: 'Escalate', conf: '0.60-0.80', color: 'bg-amber-100 text-amber-700 border-amber-200' },
            { label: 'Human Review', conf: '< 0.60', color: 'bg-red-100 text-red-700 border-red-200' },
          ].map(d => (
            <div key={d.label} className={`rounded-lg px-3 py-2 text-center border ${d.color}`}>
              <p className="text-xs font-bold">{d.label}</p>
              <p className="text-[9px] opacity-75">{d.conf}</p>
            </div>
          ))}
        </div>

        {/* Layer 7: Telemetry */}
        <div className="bg-blue-50 rounded-xl border-2 border-blue-200 p-3 text-center">
          <p className="text-xs font-bold text-blue-700 uppercase">Layer 7 — Telemetry + Feedback Loop</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-medium">Training Data Growth</span>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-medium">Few-Shot Index Update</span>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-medium">Drift Detection Alerts</span>
          </div>
        </div>

        {/* Layer 8: GEPA */}
        <div className="mt-3 relative border-2 border-dashed border-cyan-300 rounded-2xl p-4 bg-cyan-50/30">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 py-0.5 rounded-full border border-cyan-200">
            <span className="text-[10px] font-bold text-cyan-600 uppercase tracking-wider">Layer 8 — GEPA Auto-Prompt Optimizer</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-2">
            <div className="bg-white rounded-lg border border-cyan-200 p-3 text-center">
              <p className="text-xs font-bold text-cyan-800">Binary Decomposition</p>
              <p className="text-[9px] text-gray-500 mt-1">Split multi-class → binary tasks per agent</p>
            </div>
            <div className="bg-white rounded-lg border border-cyan-200 p-3 text-center">
              <p className="text-xs font-bold text-cyan-800">Reflective Mutation</p>
              <p className="text-[9px] text-gray-500 mt-1">LLM reads failure traces → targeted edits</p>
            </div>
            <div className="bg-white rounded-lg border border-cyan-200 p-3 text-center">
              <p className="text-xs font-bold text-cyan-800">Pareto Selection</p>
              <p className="text-[9px] text-gray-500 mt-1">Diverse frontier — no single-optimum trap</p>
            </div>
            <div className="bg-white rounded-lg border border-cyan-200 p-3 text-center">
              <p className="text-xs font-bold text-cyan-800">Per-Cohort Evolution</p>
              <p className="text-[9px] text-gray-500 mt-1">566 cohorts x 5 agents = optimized variants</p>
            </div>
          </div>
          <div className="flex items-center justify-center mt-3 gap-6">
            <div className="flex items-center gap-1">
              <svg className="w-3 h-3 text-cyan-400 rotate-180" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
              <span className="text-[9px] text-cyan-600 font-medium">Reads from Layer 7 traces</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-cyan-600 font-medium">Writes optimized prompts to Layer 4 agents</span>
              <svg className="w-3 h-3 text-cyan-400 rotate-180" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
            </div>
          </div>
        </div>
      </div>

      {/* Layer Details (expandable) */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Layer-by-Layer Detail</h2>
        <div className="space-y-3">
          {LAYERS.map(layer => (
            <LayerCard key={layer.id} layer={layer} isExpanded={expandedLayer === layer.id} onToggle={() => toggleLayer(layer.id)} />
          ))}
        </div>
      </div>

      {/* Agent Migration Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Agent Migration Map</h2>
          <button onClick={() => setShowMigrationTable(!showMigrationTable)} className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
            {showMigrationTable ? 'Collapse' : 'Expand'} Table
          </button>
        </div>
        {showMigrationTable && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-left">Current Agent</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-left">Proposed</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-left">Change</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-left">Why</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {AGENT_MIGRATION.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.current}</td>
                    <td className="px-4 py-2 text-xs text-gray-700 font-medium">{row.proposed}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${CHANGE_COLORS[row.change]}`}>{row.change}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-600 max-w-sm">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Roadmap */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Implementation Roadmap</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {ROADMAP.map(tier => (
            <div key={tier.tier} className={`rounded-xl border-2 ${tier.color} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">{tier.label}</h3>
                <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-gray-200 font-semibold text-gray-600">{tier.months}</span>
              </div>
              <ol className="space-y-2">
                {tier.items.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs text-gray-700">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500">
                      {(tier.tier - 1) * 5 + i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <div className="mt-4 bg-amber-50 rounded-lg border border-amber-200 p-3">
          <p className="text-xs text-amber-800"><span className="font-bold">Critical Path:</span> Gemini 2.5 Flash deprecates June 17, 2026. Migration must complete by April 2026. Shadow-mode evaluation for 2-4 weeks across all 725 cohorts is non-negotiable.</p>
        </div>
      </div>

      {/* Infrastructure Changes */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Infrastructure Changes from Current</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-600 uppercase mb-2">Genvoy LLM Gateway</h3>
            <div className="space-y-1.5 text-xs text-gray-700">
              <p><span className="font-bold text-gray-900">Current:</span> Single subscription (Gemini 2.5 Flash), RPM limit 36K, provisioned throughput</p>
              <p><span className="font-bold text-indigo-600">Proposed:</span> Multi-model subscriptions (Flash-Lite for L1, Pro for L2, Claude for L3). RPM allocation split across tiers. Cache layer more effective with binary prompts.</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-1">Genvoy subscription restructuring required</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-600 uppercase mb-2">Infinium Agent Platform</h3>
            <div className="space-y-1.5 text-xs text-gray-700">
              <p><span className="font-bold text-gray-900">Current:</span> 8 prompted agents + context, all sequential via decision_agent. Monitoring: per-agent latency (p99+avg), tokens (prompt+completion+total)</p>
              <p><span className="font-bold text-indigo-600">Proposed:</span> 16 binary sub-agents + router + L1 classifier. Need new Grafana panels for router latency, L1 throughput, confidence distribution, skip-rate per agent</p>
              <p className="text-[10px] text-amber-600 font-semibold mt-1">New Infinium agent configs + dashboard panels</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-600 uppercase mb-2">Verifi Image Pipeline</h3>
            <div className="space-y-1.5 text-xs text-gray-700">
              <p><span className="font-bold text-gray-900">Current:</span> Download → Compress → AI Processing → PNP → YOLO. All images processed for all returns.</p>
              <p><span className="font-bold text-indigo-600">Proposed:</span> L1 fast-path skips image pipeline entirely (~65%). Router determines which image types needed for L2. PNP filter thresholds may change.</p>
              <p className="text-[10px] text-emerald-600 font-semibold mt-1">~65% reduction in image processing volume</p>
            </div>
          </div>
        </div>
      </div>

      {/* Risks */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Key Risks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { risk: 'L1 Classifier Precision', desc: 'If fast-path doesn\'t reach ≥99.5% precision, error cost offsets savings. Tune against business cost-of-error curve.', severity: 'high' },
            { risk: 'Migration Deadline', desc: 'Flash deprecation June 17, 2026 is hard. Plan for April completion. No rollback room if it slips.', severity: 'high' },
            { risk: 'Synthesizer SPOF', desc: 'As architecture parallelizes, synthesizer carries more decision weight. Invest in eval + prompt discipline disproportionately.', severity: 'medium' },
            { risk: 'Fine-Tuning Freshness', desc: 'Policies drift; fine-tuned models lag. Plan re-fine-tune every 6 months + held-out eval on current policy.', severity: 'medium' },
            { risk: 'Genvoy Subscription Restructuring', desc: 'Current single provisioned-throughput subscription (RPM 36K) needs multi-model split. Genvoy may not support per-tier RPM allocation natively.', severity: 'medium' },
            { risk: 'Vendor Concentration', desc: 'Heavy Gemini reliance post-migration. L3 to Claude is partly a redundancy bet, not just quality.', severity: 'low' },
            { risk: 'Fraud Adversarial Adaptation', desc: 'Fraudsters probe blind spots. Separate fraud catch rate tracking from general accuracy. Quarterly red-team.', severity: 'medium' },
          ].map(r => {
            const sevColors = { high: 'border-red-300 bg-red-50', medium: 'border-amber-300 bg-amber-50', low: 'border-blue-300 bg-blue-50' };
            const sevBadge = { high: 'bg-red-100 text-red-700', medium: 'bg-amber-100 text-amber-700', low: 'bg-blue-100 text-blue-700' };
            return (
              <div key={r.risk} className={`rounded-xl border-2 ${sevColors[r.severity]} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${sevBadge[r.severity]}`}>{r.severity}</span>
                  <span className="text-sm font-bold text-gray-900">{r.risk}</span>
                </div>
                <p className="text-xs text-gray-600">{r.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
