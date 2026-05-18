import { useState, useEffect, useRef } from 'react';
import PageHeader from '../components/PageHeader';

const AGENTS = [
  {
    id: 'context_agent',
    name: 'Context Agent',
    shortName: 'Context',
    version: 'v5.0',
    type: 'text',
    phase: 'input',
    functionality: 'Generates structured narrative summary from 60+ raw JSON fields (order, product, return details). Translates Hinglish comments, formats variables, outputs templated markdown summary.',
    inputs: '60+ fields: order_id, return_id, product_title, listing_price, return_reason, return_comments, etc.',
    inputType: 'Text (JSON)',
    outputClasses: ['Narrative Summary'],
    outputSchema: '{ "decision": <string|null>, "analysis": <markdown string> }',
    promptSize: '~8K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: 'Runs in parallel with analysis agents. Output feeds into decision_agent as context.',
  },
  {
    id: 'intent_resonance_agent',
    name: 'Intent Resonance Agent',
    shortName: 'Intent',
    version: 'v5.0',
    type: 'text',
    phase: 'analysis',
    functionality: 'Detects mismatch between customer\'s selected return reason (dropdown) and free-text comment. Translates Hinglish, predicts actual reason, compares with selected reason. Applies Business Unit policy rules.',
    inputs: 'return_reason, return_sub_reason, return_comments, business_unit',
    inputType: 'Text only',
    outputClasses: ['Issue', 'No Issue', "Can't Say"],
    outputSchema: '{ "resonance_label": "Issue|No Issue|Can\'t Say", "resonance_details": "<explanation>" }',
    promptSize: '~12K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: '4-step protocol with 9 reason categories dictionary and 7 few-shot examples.',
  },
  {
    id: 'catalog_correctness_agent',
    name: 'Catalog Correctness Agent',
    shortName: 'Catalog',
    version: 'v2.0',
    type: 'image',
    phase: 'analysis',
    functionality: 'Audits product catalog listing — (1) Visual Verification: specs text vs product images, (2) Internal Data Consistency: text contradictions. Flags catalog errors that make any return valid.',
    inputs: 'product_attributes, product_image, product_title, vertical',
    inputType: 'Text + Images',
    outputClasses: ['Issue', 'No Issue', "Can't Say"],
    outputSchema: '{ "catalog_checker_label": "Issue|No Issue|Can\'t Say", "catalog_checker_details": "<reason>" }',
    promptSize: '~15K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: 'Two-check framework: visual verification + internal consistency.',
  },
  {
    id: 'image_adjudication_cx_agent',
    name: 'Image Adjudication CX Agent',
    shortName: 'CX Images',
    version: 'v3.0',
    type: 'image',
    phase: 'analysis',
    functionality: 'Compares Catalog Image vs Customer Wild Images. 5-phase analysis: Can\'t Say Firewall → Misshipment (5 Identity Pillars) → Damage (Major/Minor) → Missing (Major/Minor) → No Issue. Aggregates across multiple images.',
    inputs: 'cx_images (up to 3), product_image (catalog), return_reason, return_sub_reason, vertical',
    inputType: 'Text + Images (1 catalog + up to 3 CX)',
    outputClasses: ['Misshipment', 'Major Damage', 'Minor Damage', 'Major Missing', 'Minor Missing', 'Multiple Issue', 'No Issue', "Can't Say"],
    outputSchema: '{ "product_in_catalogimage": "<desc>", "product_in_wildimage": "<desc>", "product_match": "<label>", "analysis": "<string>" }',
    promptSize: '~15K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: '4 prompt variants (FK_PROMPT_1-4). 5 Identity Pillars for misshipment detection.',
  },
  {
    id: 'image_adjudication_obd_agent',
    name: 'Image Adjudication OBD Agent',
    shortName: 'OBD Images',
    version: 'v3.0',
    type: 'image',
    phase: 'analysis',
    functionality: 'Same framework as CX Agent but compares Catalog Image vs OBD (Open Box Delivery) images taken by delivery agent at time of delivery. Confirms what was delivered matches what was ordered.',
    inputs: 'obd_images (up to 3), product_image (catalog), return_reason, return_sub_reason, vertical',
    inputType: 'Text + Images (1 catalog + up to 3 OBD)',
    outputClasses: ['Misshipment', 'Major Damage', 'Minor Damage', 'Major Missing', 'Minor Missing', 'Multiple Issue', 'No Issue', "Can't Say"],
    outputSchema: '{ "product_in_catalogimage": "<desc>", "product_in_wildimage": "<desc>", "product_match": "<label>", "analysis": "<string>" }',
    promptSize: '~15K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: 'Uses same FK_PROMPT variants as CX agent. Applied to delivery-time photographs.',
  },
  {
    id: 'image_adjudication_cx_vs_obd_agent',
    name: 'CX vs OBD Agent',
    shortName: 'CX vs OBD',
    version: 'v2.0',
    type: 'crossref',
    phase: 'analysis',
    functionality: 'Fraud Detection — cross-references OBD Images (Proof of Delivery) against Customer Images (Proof of Claim). 4-step algorithm: Visibility Firewall → Identity & Fraud Screen → ROI Verification → Structural Integrity.',
    inputs: 'cx_images, obd_images, return_reason, return_sub_reason, vertical',
    inputType: 'Images only (CX vs OBD)',
    outputClasses: ['Misshipment', 'Damage', 'No Issue', "Can't Say"],
    outputSchema: '{ "product_in_obd_images": "<desc>", "product_in_customer_images": "<desc>", "product_match": "<label>", "decision": "<string>" }',
    promptSize: '~10K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: 'Dedicated fraud detection prompt. Strict visual evidence only — no assumptions.',
  },
  {
    id: 'image_adjudication_cx_vs_pod_agent',
    name: 'CX vs POD Agent',
    shortName: 'CX vs POD',
    version: 'v1.0',
    type: 'crossref',
    phase: 'analysis',
    functionality: 'Conditional agent (~35% of returns have POD images). Compares Customer Images vs POD (Proof of Delivery) last-mile images. Verifies identity match between doorstep delivery and return claim.',
    inputs: 'cx_images, pod_images, product_title, return_reason, return_sub_reason, vertical',
    inputType: 'Images (CX vs POD)',
    outputClasses: ['Misshipment', 'Major Damage', 'Minor Damage', 'No Issue', "Can't Say"],
    outputSchema: '{ "decision": "<string|null>", "product_in_customerimage": "<desc>", "product_in_podimage": "<desc>" }',
    promptSize: '~8K tokens',
    author: 'raghavendra.b',
    conditional: true,
    notes: 'Runs only when POD images are available (~35% of incidents).',
  },
  {
    id: 'risk_signals_agent',
    name: 'Risk Signals Agent',
    shortName: 'Risk',
    version: 'v1.0',
    type: 'text',
    phase: 'analysis',
    functionality: 'Evaluates cluster-level risk signals (phone, terminal, payment, refund bank, UPI, fingerprint clusters for RED/AMBER flags) + image similarity distance for duplicate image fraud detection.',
    inputs: '6 cluster risk labels + image_similarity_distance',
    inputType: 'Text (structured signals)',
    outputClasses: ['Issue', 'No Issue', "Can't Say"],
    outputSchema: '{ "risk_flag": "Issue|No Issue|Can\'t Say", "risk_evaluator_summary": "<explanation>" }',
    promptSize: '~3K tokens',
    author: 'raghavendra.b',
    conditional: false,
    notes: '6 cluster dimensions: phone, terminal, payment, refund bank, refund UPI, fingerprint.',
  },
  {
    id: 'decision_agent',
    name: 'Decision Agent',
    shortName: 'Decision',
    version: 'v4.0',
    type: 'orchestrator',
    phase: 'decision',
    functionality: 'Final orchestrator — consumes outputs from all 8 upstream agents + original context. 3 prompt variants by return reason: DAMAGED_PRODUCT, MISSHIPMENT, REMAINING. Produces final verdict via deterministic decision tree.',
    inputs: 'All upstream agent outputs + order metadata + context summary',
    inputType: 'Text (all agent JSONs)',
    outputClasses: ['Approve', 'Reject', 'Detailed Investigation', 'Reason Selection Issue'],
    outputSchema: '{ "return_recommendation": "<verdict>", "return_recommendation_details": "<reasoning traceback>" }',
    promptSize: '~22-34K tokens (varies by variant)',
    author: 'raghavendra.b',
    conditional: false,
    notes: '3 separate prompts based on return reason. 6-step decision tree logic.',
  },
];

const TYPE_COLORS = {
  text: { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
  image: { bg: 'bg-purple-50', border: 'border-purple-300', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  crossref: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  orchestrator: { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
};

const TYPE_LABELS = { text: 'Text Only', image: 'Text + Image', crossref: 'Cross-Reference', orchestrator: 'Orchestrator' };

function AgentNode({ agent, onClick, isExpanded }) {
  const c = TYPE_COLORS[agent.type];
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border-2 p-4 text-left transition-all hover:shadow-lg cursor-pointer ${c.border} ${isExpanded ? c.bg : 'bg-white'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className="font-semibold text-gray-900 text-sm">{agent.shortName}</span>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.badge}`}>{TYPE_LABELS[agent.type]}</span>
      </div>
      <p className="text-[10px] text-gray-500">{agent.version} &middot; {agent.promptSize}</p>
      {agent.conditional && (
        <span className="absolute -top-2 -right-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200">~35%</span>
      )}
      <div className="flex flex-wrap gap-1 mt-2">
        {agent.outputClasses.slice(0, 4).map(cls => (
          <span key={cls} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{cls}</span>
        ))}
        {agent.outputClasses.length > 4 && (
          <span className="text-[9px] text-gray-400">+{agent.outputClasses.length - 4}</span>
        )}
      </div>
    </button>
  );
}

function AgentDetailPanel({ agent }) {
  const c = TYPE_COLORS[agent.type];
  return (
    <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-6 mb-6 transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{agent.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${c.badge}`}>{TYPE_LABELS[agent.type]}</span>
            <span className="text-xs text-gray-500">{agent.version}</span>
            <span className="text-xs text-gray-400">by {agent.author}</span>
            {agent.conditional && <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-600">Conditional (~35%)</span>}
          </div>
        </div>
        <span className="text-xs text-gray-400 font-mono">{agent.promptSize}</span>
      </div>

      <p className="text-sm text-gray-700 leading-relaxed mb-4">{agent.functionality}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Inputs</h4>
          <p className="text-xs text-gray-600">{agent.inputs}</p>
          <p className="text-[10px] text-gray-400 mt-1">Type: {agent.inputType}</p>
        </div>
        <div>
          <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Output Schema</h4>
          <pre className="text-[10px] text-gray-600 bg-white/60 rounded p-2 font-mono whitespace-pre-wrap">{agent.outputSchema}</pre>
        </div>
      </div>

      <div className="mt-4">
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Output Classes</h4>
        <div className="flex flex-wrap gap-1.5">
          {agent.outputClasses.map(cls => (
            <span key={cls} className="text-xs bg-white/80 text-gray-700 px-2.5 py-1 rounded-full border border-gray-200 font-medium">{cls}</span>
          ))}
        </div>
      </div>

      {agent.notes && (
        <p className="text-xs text-gray-500 mt-3 italic">{agent.notes}</p>
      )}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div className="flex flex-col items-center justify-center px-1">
      <div className="w-8 h-0.5 bg-gray-300" />
      <svg className="w-3 h-3 text-gray-300 -mt-0.5" viewBox="0 0 12 12"><path d="M2 2 L10 6 L2 10" fill="currentColor" /></svg>
      {label && <span className="text-[8px] text-gray-400 mt-0.5">{label}</span>}
    </div>
  );
}

function DownArrow() {
  return (
    <div className="flex justify-center py-2">
      <div className="flex flex-col items-center">
        <div className="w-0.5 h-6 bg-gray-300" />
        <svg className="w-3 h-3 text-gray-300" viewBox="0 0 12 12"><path d="M2 2 L6 10 L10 2" fill="currentColor" /></svg>
      </div>
    </div>
  );
}

function AnimatedPipelineFlow() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [t, setT] = useState(0);
  const rafRef = useRef(null);
  const t0Ref = useRef(null);

  const play = () => { t0Ref.current = performance.now(); setT(0); setIsPlaying(true); };
  const reset = () => { cancelAnimationFrame(rafRef.current); setT(0); setIsPlaying(false); };

  useEffect(() => {
    if (!isPlaying) return;
    const tick = (now) => {
      const s = (now - t0Ref.current) / 1000 * 5;
      if (s >= 14.5) { setT(14.5); setIsPlaying(false); return; }
      setT(s);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const lit = (th) => t >= th;
  const between = (a, b) => t >= a && t < b;
  const pipeTime = Math.min(t, 13).toFixed(1);
  const finished = t >= 14;

  const AGENT_DATA = [
    { name: 'Context', color: 'blue' }, { name: 'Intent', color: 'blue' },
    { name: 'Catalog', color: 'purple' }, { name: 'CX Img', color: 'purple' },
    { name: 'OBD Img', color: 'purple' }, { name: 'CX×OBD', color: 'amber' },
    { name: 'CX×POD', color: 'amber' }, { name: 'Risk', color: 'blue' },
  ];

  const cMap = {
    blue:   { on: 'border-blue-400 bg-blue-50',     ring: 'ring-blue-300/40',   dn: 'border-blue-300 bg-blue-100' },
    purple: { on: 'border-purple-400 bg-purple-50', ring: 'ring-purple-300/40', dn: 'border-purple-300 bg-purple-100' },
    amber:  { on: 'border-amber-400 bg-amber-50',   ring: 'ring-amber-300/40',  dn: 'border-amber-300 bg-amber-100' },
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-blue-50/50 rounded-2xl border border-gray-200 p-6 mb-8 overflow-hidden">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Live Pipeline Animation</h2>
          <p className="text-xs text-gray-400 mt-0.5">Every return follows the same path — all 9 agents, every time</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={isPlaying ? reset : play} className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${isPlaying ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {isPlaying ? '■ Stop' : t > 0 ? '▶ Replay' : '▶ Play'}
          </button>
          <div className={`font-mono text-xl font-bold tabular-nums px-4 py-1 rounded-lg border-2 min-w-[80px] text-center transition-colors ${finished ? 'bg-red-50 border-red-300 text-red-700' : t > 0 ? 'bg-gray-900 border-gray-700 text-emerald-400' : 'bg-gray-100 border-gray-200 text-gray-400'}`}>
            {pipeTime}s
          </div>
        </div>
      </div>

      <div className="h-2 bg-gray-200 rounded-full mb-6 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-75 bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500" style={{ width: `${Math.min(t / 13 * 100, 100)}%` }} />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className={`rounded-xl border-2 px-6 py-2.5 transition-all duration-300 ${lit(0.3) ? 'border-gray-400 bg-white shadow-md' : 'border-gray-200 bg-gray-100/50 opacity-25'}`}>
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            {between(0.3, 0.8) && <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />}
            Return Request
          </span>
        </div>

        <div className={`w-0.5 h-5 rounded transition-colors duration-300 ${lit(0.6) ? 'bg-blue-400' : 'bg-gray-200'}`} />

        <div className={`relative w-full max-w-4xl border-2 border-dashed rounded-2xl p-4 transition-all duration-500 ${lit(0.6) ? 'border-blue-300 bg-white/60 shadow-lg' : 'border-gray-200 bg-gray-50/30 opacity-25'}`}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 py-0.5 rounded-full border border-blue-200 whitespace-nowrap flex items-center gap-2">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Parallel — ALL 8 Agents Always Run</span>
            {between(1, 8) && <span className="text-[10px] text-blue-400 font-mono">{Math.min(t, 8).toFixed(1)}s / 8.0s</span>}
          </div>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mt-1">
            {AGENT_DATA.map((agent, i) => {
              const c = cMap[agent.color];
              const agentLit = lit(0.8 + i * 0.08);
              const processing = between(0.8 + i * 0.08, 8);
              const agentDone = lit(8);
              return (
                <div key={agent.name} className={`rounded-lg border-2 py-2 px-1 text-center transition-all duration-400 ${agentDone ? c.dn : processing ? `${c.on} ring-2 ${c.ring} animate-pulse` : agentLit ? c.on : 'border-gray-200 bg-gray-50 opacity-25'}`} style={{ animationDelay: `${i * 150}ms` }}>
                  <p className="text-[10px] font-bold text-gray-700 leading-tight">{agent.name}</p>
                  {agentDone && <span className="text-emerald-500 text-xs">✓</span>}
                </div>
              );
            })}
          </div>
          {between(1.5, 8) && (
            <p className="text-[10px] text-center text-blue-500 mt-2 animate-pulse font-medium">
              All 8 agents processing every return — even simple SIZE_FIT cases...
            </p>
          )}
        </div>

        <div className={`w-0.5 h-5 rounded transition-colors duration-300 ${lit(8.5) ? 'bg-rose-400' : 'bg-gray-200'}`} />
        {lit(8.3) && <span className="text-[9px] text-gray-400 font-medium">8 outputs collected</span>}

        <div className={`rounded-xl border-2 px-8 py-3 text-center transition-all duration-500 ${lit(8.5) ? 'border-rose-400 bg-rose-50 shadow-lg' : 'border-gray-200 bg-gray-50 opacity-25'} ${between(8.5, 13) ? 'ring-4 ring-rose-300/30 animate-pulse' : ''}`}>
          <p className="text-sm font-bold text-gray-700 flex items-center justify-center gap-2">
            {between(8.5, 13) && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
            Decision Agent
          </p>
          <p className="text-[10px] text-gray-500">22-34K token prompt &middot; Gemini 2.5 Flash</p>
          {between(8.5, 13) && <p className="text-[10px] text-rose-500 font-mono mt-1">{(Math.min(t, 13) - 8).toFixed(1)}s / 5.0s</p>}
        </div>

        <div className={`w-0.5 h-5 rounded transition-colors duration-300 ${lit(13) ? 'bg-emerald-400' : 'bg-gray-200'}`} />

        <div className={`flex gap-3 transition-all duration-500 ${lit(13) ? 'opacity-100' : 'opacity-20'}`}>
          {[
            { l: 'Approve', c: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
            { l: 'Reject', c: 'bg-red-100 text-red-700 border-red-300' },
            { l: 'Investigate', c: 'bg-amber-100 text-amber-700 border-amber-300' },
          ].map(o => (
            <div key={o.l} className={`rounded-lg px-4 py-2 text-xs font-bold border-2 ${o.c} ${lit(13) ? 'shadow-md' : ''}`}>{o.l}</div>
          ))}
        </div>
      </div>

      <div className={`mt-6 transition-all duration-700 ${finished ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-5">
          <div className="flex items-center justify-center gap-6 mb-3 flex-wrap">
            {[
              { v: '~13s', l: 'Total Latency' },
              { v: '8-9', l: 'LLM Calls' },
              { v: '100%', l: 'Agents Run' },
              { v: '$8.7K', l: 'Weekly Cost' },
            ].map((s, i) => (
              <div key={s.l} className="flex items-center gap-4">
                {i > 0 && <div className="w-px h-8 bg-red-200 hidden sm:block" />}
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-700">{s.v}</p>
                  <p className="text-[10px] text-red-500 uppercase font-bold">{s.l}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-red-600 text-center">Every return — even simple SIZE_FIT — traverses all 9 agents, every LLM call, every time</p>
        </div>
      </div>
    </div>
  );
}

export default function DesignCurrentArchitecture() {
  const [expandedAgent, setExpandedAgent] = useState(null);

  const toggleAgent = (id) => setExpandedAgent(prev => prev === id ? null : id);

  const inputAgent = AGENTS.find(a => a.phase === 'input');
  const analysisAgents = AGENTS.filter(a => a.phase === 'analysis');
  const decisionAgent = AGENTS.find(a => a.phase === 'decision');

  return (
    <div>
      <PageHeader
        title="Current Architecture"
        subtitle="Returns Adjudication Automation — Infinium Pipeline Design"
      />

      {/* Hero Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        {[
          { label: 'Active Agents', value: '9', sub: '8 core + 1 conditional' },
          { label: 'LLM', value: 'Gemini 2.5 Flash', sub: 'via Genvoy gateway' },
          { label: 'Calls / Return', value: '8-9', sub: 'parallel + decision' },
          { label: 'Returns / Day', value: '~70K', sub: '~2M / month' },
          { label: 'Labelled Records', value: '614K', sub: '85K incidents' },
          { label: 'Cohorts', value: '725', sub: 'marketplace x vertical x reason' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-[10px] text-gray-500">{s.sub}</p>
          </div>
        ))}
      </div>

      <AnimatedPipelineFlow />

      {/* Pipeline Flow */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-6">Pipeline Flow</h2>

        {/* Input */}
        <div className="flex items-center justify-center mb-2">
          <div className="bg-gray-100 rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 border border-gray-200">
            Return Request Received
          </div>
        </div>
        <DownArrow />

        {/* Parallel Block: Context + Analysis */}
        <div className="relative border-2 border-dashed border-blue-200 rounded-2xl p-5 mb-2 bg-blue-50/30">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white px-3 py-0.5 rounded-full border border-blue-200">
            <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Parallel Execution</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 items-start mt-2">
            {/* Left: Context Agent */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase text-center mb-1">Summarisation</p>
              <AgentNode agent={inputAgent} onClick={() => toggleAgent(inputAgent.id)} isExpanded={expandedAgent === inputAgent.id} />
            </div>

            {/* Right: 7 Analysis Agents */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase text-center mb-1">Analysis Agents (7)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {analysisAgents.map(a => (
                  <AgentNode key={a.id} agent={a} onClick={() => toggleAgent(a.id)} isExpanded={expandedAgent === a.id} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Expanded detail for any parallel-stage agent */}
        {expandedAgent === inputAgent.id && <AgentDetailPanel agent={inputAgent} />}
        {expandedAgent && analysisAgents.find(a => a.id === expandedAgent) && (
          <AgentDetailPanel agent={analysisAgents.find(a => a.id === expandedAgent)} />
        )}

        <DownArrow />

        {/* Sequential: All outputs feed into Decision */}
        <p className="text-[10px] font-bold text-gray-400 uppercase text-center mb-1">All 8 agent outputs collected</p>
        <DownArrow />

        {/* Decision Agent */}
        <div className="flex justify-center mb-2">
          <div className="w-80">
            <p className="text-[10px] font-bold text-rose-400 uppercase text-center mb-1">Sequential — Final Decision</p>
            <AgentNode agent={decisionAgent} onClick={() => toggleAgent(decisionAgent.id)} isExpanded={expandedAgent === decisionAgent.id} />
          </div>
        </div>
        {expandedAgent === decisionAgent.id && <AgentDetailPanel agent={decisionAgent} />}
        <DownArrow />

        {/* Output */}
        <div className="flex items-center justify-center gap-3">
          {['Approve', 'Reject', 'Detailed Investigation', 'Reason Selection Issue'].map(cls => {
            const colors = {
              'Approve': 'bg-emerald-100 text-emerald-700 border-emerald-200',
              'Reject': 'bg-red-100 text-red-700 border-red-200',
              'Detailed Investigation': 'bg-amber-100 text-amber-700 border-amber-200',
              'Reason Selection Issue': 'bg-blue-100 text-blue-700 border-blue-200',
            };
            return (
              <div key={cls} className={`rounded-lg px-4 py-2 text-xs font-bold border ${colors[cls]}`}>
                {cls}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Type Legend */}
      <div className="flex flex-wrap gap-4 mb-8">
        {Object.entries(TYPE_LABELS).map(([type, label]) => {
          const c = TYPE_COLORS[type];
          return (
            <div key={type} className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${c.dot}`} />
              <span className="text-xs text-gray-600">{label}</span>
            </div>
          );
        })}
      </div>

      {/* Architecture Characteristics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-bold text-emerald-700 uppercase tracking-wider mb-3">Strengths</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-emerald-500 flex-shrink-0">+</span>Modular agent decomposition — each agent has clear single responsibility</li>
            <li className="flex gap-2"><span className="text-emerald-500 flex-shrink-0">+</span>Multi-modal: handles text, images, structured data, cross-referencing</li>
            <li className="flex gap-2"><span className="text-emerald-500 flex-shrink-0">+</span>Fraud detection via OBD/CX cross-reference (switcheroo detection)</li>
            <li className="flex gap-2"><span className="text-emerald-500 flex-shrink-0">+</span>Comprehensive evaluation: 10 output classes for image agents</li>
            <li className="flex gap-2"><span className="text-emerald-500 flex-shrink-0">+</span>Deterministic decision tree in final agent — auditable reasoning</li>
            <li className="flex gap-2"><span className="text-emerald-500 flex-shrink-0">+</span>85K labelled incidents for ground truth evaluation</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-bold text-red-700 uppercase tracking-wider mb-3">Limitations</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">-</span>No intelligent routing — all 8 agents always run, even for simple returns</li>
            <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">-</span>No early exit — can't short-circuit if a single agent is already decisive</li>
            <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">-</span>No confidence scoring — hard classifications only, no probabilities</li>
            <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">-</span>No feedback loops — human corrections don't feed back automatically</li>
            <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">-</span>Manual prompt versioning — no systematic A/B testing framework</li>
            <li className="flex gap-2"><span className="text-red-500 flex-shrink-0">-</span>Single model dependency — all agents on Gemini 2.5 Flash (being deprecated)</li>
          </ul>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wider mb-3">Scale & Operations</h3>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>~2M returns/month across Flipkart Blue + Hyperlocal</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>~70K returns/day, each generating 8-9 LLM calls</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>Up to 10 images per return (catalog + CX + OBD + POD)</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>725 cohorts (marketplace x vertical x return reason)</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>Gemini 2.5 Flash via Genvoy (provisioned throughput, RPM limit: 36K, cache layer)</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>Image pipeline: Verifi (download → compress → PNP filter → YOLO → agents)</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>Monitoring: Infinium Agents dashboard (per-agent latency/tokens) + Genvoy dashboard (RPM/TPM/errors)</li>
            <li className="flex gap-2"><span className="text-blue-500 flex-shrink-0">&bull;</span>Deprecation deadline: June 17, 2026 (migration required)</li>
          </ul>
        </div>
      </div>

      {/* Data Flow Detail */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Data Flow Detail</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['#', 'Agent', 'Type', 'Input From', 'Output To', 'Latency', 'Conditional'].map(h => (
                  <th key={h} className="px-4 py-2 text-xs font-semibold text-gray-600 uppercase text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { n: 1, agent: 'context_agent', type: 'Text', from: 'Raw return JSON (60+ fields)', to: 'decision_agent', latency: '~3s', cond: 'Always' },
                { n: 2, agent: 'intent_resonance_agent', type: 'Text', from: 'Return reason + comments', to: 'decision_agent', latency: '~3s', cond: 'Always' },
                { n: 3, agent: 'catalog_correctness_agent', type: 'Text+Img', from: 'Product attributes + catalog image', to: 'decision_agent', latency: '~5s', cond: 'Always' },
                { n: 4, agent: 'image_adjudication_cx_agent', type: 'Text+Img', from: 'Catalog image + customer images', to: 'decision_agent, cx_vs_obd', latency: '~8s', cond: 'Always' },
                { n: 5, agent: 'image_adjudication_obd_agent', type: 'Text+Img', from: 'Catalog image + OBD images', to: 'decision_agent, cx_vs_obd', latency: '~8s', cond: 'Always' },
                { n: 6, agent: 'cx_vs_obd_agent', type: 'Images', from: 'CX images + OBD images', to: 'decision_agent', latency: '~6s', cond: 'Always' },
                { n: 7, agent: 'cx_vs_pod_agent', type: 'Images', from: 'CX images + POD images', to: 'decision_agent', latency: '~6s', cond: '~35% (POD exists)' },
                { n: 8, agent: 'risk_signals_agent', type: 'Text', from: '6 cluster risk labels + img distance', to: 'decision_agent', latency: '~2s', cond: 'Always' },
                { n: 9, agent: 'decision_agent', type: 'Text', from: 'All 8 agent outputs + context', to: 'Final verdict', latency: '~5s', cond: 'Always' },
              ].map(row => (
                <tr key={row.n} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{row.n}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{row.agent}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      row.type === 'Text' ? 'bg-blue-50 text-blue-600' :
                      row.type === 'Images' ? 'bg-amber-50 text-amber-600' :
                      'bg-purple-50 text-purple-600'
                    }`}>{row.type}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{row.from}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{row.to}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{row.latency}</td>
                  <td className="px-4 py-2">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      row.cond === 'Always' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'
                    }`}>{row.cond}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-3">Context + 7 analysis agents run in parallel (~8s). Decision agent runs sequentially after all outputs are collected (~5s). Total latency: ~13 seconds per return.</p>
      </div>

      {/* Image Flow */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Image Sources per Return</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-bold text-blue-700 uppercase">Catalog Image</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">1</p>
            <p className="text-[10px] text-gray-600 mt-1">Official product listing photo</p>
            <p className="text-[9px] text-gray-400 mt-2">Used by: catalog, cx_img, obd_img</p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <p className="text-xs font-bold text-purple-700 uppercase">Customer Images</p>
            <p className="text-2xl font-bold text-purple-800 mt-1">Up to 3</p>
            <p className="text-[10px] text-gray-600 mt-1">Wild images uploaded by customer</p>
            <p className="text-[9px] text-gray-400 mt-2">Used by: cx_img, cx_vs_obd, cx_vs_pod</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold text-amber-700 uppercase">OBD Images</p>
            <p className="text-2xl font-bold text-amber-800 mt-1">Up to 3</p>
            <p className="text-[10px] text-gray-600 mt-1">Open Box Delivery photos by courier</p>
            <p className="text-[9px] text-gray-400 mt-2">Used by: obd_img, cx_vs_obd</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-xs font-bold text-orange-700 uppercase">POD Images</p>
            <p className="text-2xl font-bold text-orange-800 mt-1">Up to 3</p>
            <p className="text-[10px] text-gray-600 mt-1">Proof of Delivery (last mile) — ~35%</p>
            <p className="text-[9px] text-gray-400 mt-2">Used by: cx_vs_pod (conditional)</p>
          </div>
        </div>
      </div>

      {/* Production Infrastructure & Monitoring */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 mb-8 mt-8">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4">Production Infrastructure & Monitoring</h2>
        <p className="text-xs text-slate-500 mb-4">Live Grafana dashboards: Genvoy User Dashboard (LLM gateway) + Infinium Agents (agent platform)</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Genvoy LLM Gateway */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-bold text-gray-900">Genvoy — LLM Gateway</h3>
            </div>
            <div className="space-y-2 text-xs text-gray-700">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Subscription ID</p>
                <p className="font-mono text-[11px] text-gray-800 mt-0.5 break-all">tns.g2n.online.tns.automation.image.intelligence.gemini.2.5.flash</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">RPM Limit</p>
                  <p className="font-bold text-gray-800">36,000 <span className="text-[10px] font-normal text-red-500">red threshold</span></p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2.5">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">P99 Latency Alert</p>
                  <p className="font-bold text-gray-800">60,000ms <span className="text-[10px] font-normal text-red-500">(1 min)</span></p>
                </div>
              </div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase mt-2 mb-1">Tracked Metrics</p>
              <div className="flex flex-wrap gap-1">
                {['RPM', 'TPM (prompt+completion+total)', 'P99 Latency', 'P95 Latency', 'Avg Latency', 'Status Codes (200/400/429/500)', 'Images Analyzed', 'Cache Hit Rate', 'Cache Latency P95', 'Provisioned Throughput', 'Thinking Tokens'].map(m => (
                  <span key={m} className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">{m}</span>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Provisioned throughput (not pay-per-use) with burndown monitoring. Cache layer reduces repeat LLM calls.</p>
            </div>
          </div>

          {/* Infinium Agent Platform */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <h3 className="text-sm font-bold text-gray-900">Infinium — Agent Platform</h3>
            </div>
            <div className="space-y-2 text-xs text-gray-700">
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase">FRM Workflow QPS</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[
                    { label: 'Total QPS', color: 'text-blue-600' },
                    { label: 'Success QPS', color: 'text-emerald-600' },
                    { label: 'Error QPS', color: 'text-red-600' },
                    { label: 'Filtered QPS', color: 'text-gray-600' },
                    { label: 'Repeat Incidents', color: 'text-purple-600' },
                  ].map(q => (
                    <span key={q.label} className={`text-[10px] font-semibold ${q.color}`}>{q.label}</span>
                  ))}
                </div>
              </div>
              <div className="bg-slate-50 rounded-lg p-2.5">
                <p className="text-[10px] font-bold text-slate-500 uppercase">Per-Agent Monitoring</p>
                <p className="text-gray-600 mt-0.5">P99 + Avg latency per agent, success/error rates, prompt/completion/total tokens per agent</p>
              </div>
              <div className="bg-rose-50 rounded-lg p-2.5 border border-rose-200">
                <p className="text-[10px] font-bold text-rose-600 uppercase">FRM API Latency Alarm</p>
                <p className="font-bold text-rose-700">10 second red threshold</p>
                <p className="text-[10px] text-rose-500 mt-0.5">Agent invocation P99 breaching 10s triggers alert</p>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">8 agents monitored individually. cx_vs_pod_agent not in main dashboard (conditional, ~35%).</p>
            </div>
          </div>
        </div>

        {/* Verifi Image Pre-Processing Pipeline */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <h3 className="text-sm font-bold text-gray-900">Verifi — Image Pre-Processing Pipeline</h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Before Agent Invocation</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {[
              { name: 'Download Images', desc: 'Fetch CX/OBD/POD images', color: 'border-blue-300 bg-blue-50' },
              { name: 'Parallel Compression', desc: 'Resize & compress', color: 'border-indigo-300 bg-indigo-50' },
              { name: 'AI Processing', desc: 'LLM-based analysis', color: 'border-purple-300 bg-purple-50', alert: '5s / 10s thresholds' },
              { name: 'PNP Classification', desc: '"Probably Not Product" filter', color: 'border-amber-300 bg-amber-50' },
              { name: 'YOLO Detection', desc: 'Object detection model', color: 'border-orange-300 bg-orange-50' },
            ].map((step, i) => (
              <div key={step.name} className="flex items-center gap-2">
                {i > 0 && <span className="text-gray-300 text-lg">&rarr;</span>}
                <div className={`rounded-lg border ${step.color} px-3 py-2 min-w-[140px]`}>
                  <p className="text-[11px] font-bold text-gray-800">{step.name}</p>
                  <p className="text-[9px] text-gray-500">{step.desc}</p>
                  {step.alert && <p className="text-[9px] text-red-500 font-semibold mt-0.5">{step.alert}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase">PNP Filter</p>
              <p className="text-xs text-gray-700">Images that fail PNP ("Probably Not Product") are filtered out before reaching LLM agents — reduces wasted LLM calls on irrelevant images</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Verifi Metrics</p>
              <p className="text-xs text-gray-700">Total QPS, Success QPS, Error QPS tracked per use_case. Separate latency monitoring (P99 + avg)</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase">YOLO Integration</p>
              <p className="text-xs text-gray-700">Object detection model runs on images for product identification before LLM analysis. Has separate latency monitoring.</p>
            </div>
          </div>
        </div>

        {/* Per-Agent Production Metrics */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-200">
            <p className="text-[10px] font-bold text-slate-600 uppercase">Per-Agent Production Metrics (from Infinium Agents Grafana)</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 uppercase">Agent</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600 uppercase">Latency Tracked</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600 uppercase">Tokens Tracked</th>
                <th className="px-3 py-2 text-center font-semibold text-slate-600 uppercase">Success/Error Rate</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-600 uppercase">Metric Key</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { agent: 'context_agent', latency: true, tokens: true, rates: true },
                { agent: 'intent_resonance_agent', latency: true, tokens: true, rates: true },
                { agent: 'risk_signals_agent', latency: true, tokens: true, rates: true },
                { agent: 'catalog_correctness_agent', latency: true, tokens: true, rates: true },
                { agent: 'image_adjudication_cx_agent', latency: true, tokens: true, rates: true },
                { agent: 'image_adjudication_obd_agent', latency: true, tokens: true, rates: true },
                { agent: 'image_adjudication_cx_vs_obd_agent', latency: true, tokens: true, rates: true },
                { agent: 'image_adjudication_cx_vs_pod_agent', latency: false, tokens: false, rates: false, note: 'Not in main dashboard' },
                { agent: 'decision_agent', latency: true, tokens: false, rates: true },
              ].map(r => (
                <tr key={r.agent} className={r.note ? 'bg-amber-50/30' : ''}>
                  <td className="px-3 py-2 font-mono font-medium text-gray-800">{r.agent}</td>
                  <td className="px-3 py-2 text-center">{r.latency ? <span className="text-emerald-600 font-bold">P99 + Avg</span> : <span className="text-gray-300">--</span>}</td>
                  <td className="px-3 py-2 text-center">{r.tokens ? <span className="text-blue-600 font-bold">P + C + T</span> : <span className="text-gray-300">--</span>}</td>
                  <td className="px-3 py-2 text-center">{r.rates ? <span className="text-emerald-600 font-bold">Yes</span> : <span className="text-gray-300">--</span>}</td>
                  <td className="px-3 py-2 text-gray-500 font-mono text-[10px]">
                    {r.note || `statsd_timers_infinium_agent_execution_duration_*{agent="${r.agent}"}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-400">
            P = Prompt tokens, C = Completion tokens, T = Total tokens. Token metrics via <span className="font-mono">statsd_gauges_infinium_agent_tokens_*</span>. Latency in ms.
          </div>
        </div>
      </div>

      {/* Grafana Dashboard References */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">Grafana Dashboard References</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">&#128202;</span>
              <h3 className="text-sm font-bold text-gray-900">Genvoy User Dashboard</h3>
            </div>
            <p className="text-xs text-gray-500 mb-2">LLM gateway metrics — RPM, TPM, latency, status codes, cache, throughput</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Datasource: jarvis-services-prod-ch-2</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">UID: -uqEOLhSk</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">10 panels</span>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">&#128202;</span>
              <h3 className="text-sm font-bold text-gray-900">Infinium Agents</h3>
            </div>
            <p className="text-xs text-gray-500 mb-2">Agent platform metrics — per-agent latency, tokens, success/error, Verifi pipeline, PNP filter</p>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Datasource: infinium-ch-2</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">4 sections, 20+ panels</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">FRM + Verifi + Tokens + Low-Level</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
