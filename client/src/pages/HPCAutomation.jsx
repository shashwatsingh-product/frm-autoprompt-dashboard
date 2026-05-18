import {
  ComposedChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const RECALL     = 6621 / (6621 + 7856);   // 45.73%
const HC_PER_BPS = 560 / 317;              // 1.766 HC per bps
// Week 17 actuals: 11 bps = 4,087 weekly cases → monthly = × 52/12
const INC_PER_BPS = (4087 / 11) * (52 / 12); // ~1,610 monthly incidents per bps

const rd  = v => Math.round(v * 10) / 10;
const r1  = v => Math.round(v);
const pct = v => `${(v * 100).toFixed(1)}%`;
const hc  = bps => r1(bps * HC_PER_BPS);
const inc = bps => {
  const n = r1(bps * INC_PER_BPS);
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : `${n}`;
};

// ── Colors - FK Blue (#2874F0) + FK Yellow (#FFE500) palette ─────────────────
const FK_BLUE   = '#2874F0';
const FK_YELLOW = '#FFE500';

const CLR = {
  start:   FK_BLUE,    // FK Blue - full bucket / starting bar
  total:   '#93C5FD',  // FK Blue light - subtotal checkpoints
  out:     '#EF4444',  // Red - ineligible exclusions
  unknown: '#F97316',  // Orange - SOP / data quality
  recall:  '#7C3AED',  // Violet - recall / cant-say loss
  mpc:     '#94A3B8',  // Slate - MPC / control (neutral)
  current: FK_BLUE,    // FK Blue - current live bps
  add:     '#16A34A',  // Green - improvement lever / gain
  target:  '#F59E0B',  // Amber-yellow (FK Yellow family) - target
};

// ── Waterfall builder ─────────────────────────────────────────────────────────
function buildWF(steps) {
  let running = 0;
  return steps.map(s => {
    let base, val;
    if (s.type === 'start' || s.type === 'current' || s.type === 'target') {
      base = 0; val = rd(s.bps); running = rd(s.bps);
    } else if (s.type === 'total') {
      base = 0; val = running; // checkpoint bar - running unchanged
    } else if (s.type === 'add') {
      base = running; val = rd(s.bps); running = rd(running + s.bps);
    } else {
      // out, unknown, recall, mpc - decrements
      val = rd(s.bps); base = rd(running - val); running = base;
    }
    return { ...s, base, val, running };
  });
}

// ── Pre-computed values ───────────────────────────────────────────────────────
const CANT_SAY_BPS = rd(38  * (1 - RECALL));   // 20.6
const CANT_SAY_126 = rd(126 * (1 - RECALL));   // 68.4
const RECALL_CEIL  = rd(126 * RECALL);          // 57.6
const OBD_GAIN     = rd(52  * RECALL);          // 23.8
const MATCH_GAIN   = rd(7   * RECALL);          // 3.2
const MPC_SOP      = rd(40 - 11 - OBD_GAIN - MATCH_GAIN); // 2.0

// ── Datasets ──────────────────────────────────────────────────────────────────
const funnelBars = buildWF([
  { name: 'OCR Bucket',     bps: 317,          type: 'start',   note: 'Total OCR-eligible returns · 560 HC' },
  { name: 'Rejected',       bps: 191,          type: 'out',     note: 'Rejection automation paused' },
  { name: 'Approved',                           type: 'total' },
  { name: 'Match Cohorts',  bps: 14,           type: 'out',     note: '5,543 cases - size/spec mismatch' },
  { name: 'MR Returns',     bps: 14,           type: 'out',     note: '5,582 cases - multi-rejection' },
  { name: 'OBD Missing',    bps: 52,           type: 'out',     note: '19,771 cases - OBD URL unavailable' },
  { name: 'OBD Available',                      type: 'total' },
  { name: 'Reason Sel.',    bps: 8,            type: 'unknown', note: '3,138 cases - Unknown sub-reason · SOP issue · NOT part of recall' },
  { name: 'AI Evaluatable',                     type: 'total' },
  { name: "Can't Say",      bps: CANT_SAY_BPS, type: 'recall',  note: `${pct(1 - RECALL)} cant-say · 7,856 cases` },
  { name: 'AI Reco',                            type: 'total' },
  { name: 'Control+MPC',    bps: 6,            type: 'mpc',     note: '890 control + 1,644 MPC cases' },
  { name: 'HPC Live',       bps: 11,           type: 'current', note: `4,087 cases/wk · ${inc(11)}/mo` },
]);

const ceilBars = buildWF([
  { name: 'Approved',          bps: 126,         type: 'start', note: 'Full AI scope' },
  { name: "Can't Say (−54%)",  bps: CANT_SAY_126, type: 'recall', note: `Ceiling = ${RECALL_CEIL} bps` },
  { name: 'Recall Ceiling',                       type: 'total' },
  { name: 'Control+MPC',       bps: 6,           type: 'mpc',   note: '6 bps deducted' },
  { name: 'HPC Ceiling',                          type: 'total' },
]);

const pathBars = buildWF([
  { name: 'HPC Live',       bps: 11,         type: 'current', note: `4,087 cases/wk · ${inc(11)}/mo` },
  { name: 'OBD URL Fix',    bps: OBD_GAIN,   type: 'add',     note: `52 × ${pct(RECALL)} · 19,771 cases unblocked` },
  { name: 'Match Partial',  bps: MATCH_GAIN, type: 'add',     note: `~7 × ${pct(RECALL)}` },
  { name: 'MPC + SOP',      bps: MPC_SOP,    type: 'add',     note: 'SOP adherence + MPC expansion' },
  { name: 'AMJ 40 bps',     bps: 40,         type: 'target',  note: `AMJ quarterly · ${inc(40)}/mo` },
]);

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div style={{
      background: 'white', border: '1px solid #E2E8F0',
      borderRadius: 10, padding: '10px 14px', fontSize: 12, maxWidth: 260,
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: CLR[d.type] ?? '#64748b', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: '#0F172A' }}>{d.name}</span>
      </div>
      <p style={{ color: '#1E293B', margin: '2px 0', fontWeight: 600 }}>
        {d.running} bps · {hc(d.running)} HC · {inc(d.running)}/mo
      </p>
      {d.note && <p style={{ color: '#64748B', marginTop: 6, lineHeight: 1.5, fontSize: 11 }}>{d.note}</p>}
    </div>
  );
}

// ── Chart ─────────────────────────────────────────────────────────────────────
function WFChart({ data, height, yMax, refLines = [] }) {
  function BarLabel({ x, y, width, index }) {
    const d = data[index];
    if (!d || d.val === 0) return null;
    let label, color;
    if (d.type === 'add') {
      label = `+${rd(d.val)}`;
      color = CLR.add;
    } else if (['out', 'unknown', 'recall', 'mpc'].includes(d.type)) {
      label = `-${rd(d.val)}`;
      color = CLR[d.type];
    } else {
      label = `${rd(d.val)}`;
      color = '#1E293B';
    }
    return (
      <text x={x + width / 2} y={y - 5} textAnchor="middle"
            fill={color} fontSize={10} fontWeight="700">
        {label}
      </text>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 30, right: 24, left: 10, bottom: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#64748B', fontSize: 11 }}
          interval={0}
          angle={-38}
          textAnchor="end"
          height={80}
        />
        <YAxis
          tick={{ fill: '#94A3B8', fontSize: 11 }}
          unit=" bps"
          width={62}
          domain={[0, yMax]}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={<Tip />} cursor={{ fill: 'rgba(40,116,240,0.05)' }} />
        {refLines.map(rl => (
          <ReferenceLine key={rl.label} y={rl.y} stroke={rl.color}
            strokeDasharray="8 4" strokeWidth={1.5}
            label={{ value: rl.label, fill: rl.color, fontSize: 10, position: 'insideTopRight' }} />
        ))}
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="val" stackId="w" maxBarSize={54} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={CLR[d.type] ?? '#64748b'} />)}
          <LabelList content={BarLabel} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────
const ALL_LEGEND = [
  { key: 'start',   label: 'Starting total' },
  { key: 'total',   label: 'Subtotal checkpoint' },
  { key: 'out',     label: 'Blocked / Excluded' },
  { key: 'unknown', label: 'Reason Selection (SOP)' },
  { key: 'recall',  label: "Can't Say (recall loss)" },
  { key: 'mpc',     label: 'Control + MPC' },
  { key: 'current', label: 'Current live' },
  { key: 'add',     label: 'Improvement lever' },
  { key: 'target',  label: 'Target' },
];

function Legend({ keys }) {
  const items = keys ? ALL_LEGEND.filter(l => keys.includes(l.key)) : ALL_LEGEND;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginBottom: 16 }}>
      {items.map(({ key, label }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#64748B' }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: CLR[key], flexShrink: 0 }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, accent }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid #E2E8F0', background: 'white', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <p style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, fontFamily: 'monospace', color: accent ?? '#0F172A', margin: 0 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5, lineHeight: 1.5 }}>{sub}</p>}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────
function Section({ title, sub, accent, children }) {
  return (
    <div style={{ borderRadius: 16, border: '1px solid #E2E8F0', background: 'white', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {accent && <span style={{ width: 4, borderRadius: 2, background: accent, alignSelf: 'stretch', flexShrink: 0 }} />}
          <div>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', margin: 0 }}>{title}</h2>
            {sub && <p style={{ fontSize: 12, color: '#64748B', marginTop: 5, lineHeight: 1.6, maxWidth: 800 }}>{sub}</p>}
          </div>
        </div>
      </div>
      <div style={{ padding: '18px 24px' }}>{children}</div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HPCAutomation() {
  const kpis = [
    { label: 'HPC Live',         value: '11 bps',          sub: `${hc(11)} HC · ${inc(11)}/mo`,           accent: CLR.current },
    { label: 'JFM Target (Q1)',  value: '40 bps',          sub: `${hc(40)} HC · ${inc(40)}/mo · in progress`, accent: '#22d3ee' },
    { label: 'AMJ Target (Q2)',  value: '40 bps',          sub: `${hc(40)} HC · ${inc(40)}/mo`,              accent: CLR.add },
    { label: 'Cumul. Q1+Q2',     value: '80 bps',          sub: `${hc(80)} HC · ${inc(80)}/mo · 3-phase plan`, accent: CLR.out },
    { label: 'Model Recall',     value: pct(RECALL),       sub: 'reco ÷ (reco + cant-say)',               accent: CLR.recall },
    { label: 'Recall Ceiling',   value: `~${r1(RECALL_CEIL - 6)} bps`, sub: `${hc(r1(RECALL_CEIL-6))} HC · ${inc(r1(RECALL_CEIL-6))}/mo`, accent: '#f472b6' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>HPC Automation</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
          Week 17 (Apr 22–26) · Recall = {pct(RECALL)} · {hc(1)} HC/bps · {inc(1)}/mo per bps
        </p>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 14 }}>
        {kpis.map(k => <Stat key={k.label} {...k} />)}
      </div>

      {/* Recall callout */}
      <div style={{ borderRadius: 12, border: `1px solid ${FK_BLUE}30`, background: `${FK_BLUE}08`, padding: '14px 18px' }}>
        <p style={{ color: FK_BLUE, fontWeight: 600, fontSize: 13, margin: '0 0 6px' }}>
          Recall = AI reco to approve ÷ (AI reco + Can't say) = 6,621 ÷ 14,477 = {pct(RECALL)}
        </p>
        <p style={{ color: '#475569', fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          <span style={{ color: CLR.unknown, fontWeight: 600 }}>Reason Selection (3,138 cases / 8 bps)</span> is "Unknown" sub-reason - SOP data quality issue, excluded from recall denominator.
          The 23.2% "Current AI-decision recall" in the pipeline sheet is end-to-end: HPC test ÷ OBD-available = 4,087 ÷ 17,615.
        </p>
      </div>

      {/* Funnel chart */}
      <Section
        title="Funnel - OCR Bucket → HPC Live"
        sub={`Exclusions first (Match, MR, OBD Missing, Reason Selection), then recall (${pct(RECALL)}) on 38 bps AI-evaluatable. 38 × 54.3% = 20.6 cant-say → 17 AI reco → 6 control+MPC → 11 HPC live.`}
        accent={CLR.start}
      >
        <Legend keys={['start', 'total', 'out', 'unknown', 'recall', 'mpc', 'current']} />
        <WFChart
          data={funnelBars}
          height={420}
          yMax={340}
          refLines={[
            { y: 80, label: 'JFM+AMJ 80 bps (Phase 1+2+3)', color: CLR.out },
            { y: 40, label: 'JFM/AMJ 40 bps',         color: '#22d3ee' },
            { y: 11, label: 'Current 11 bps',          color: CLR.current },
          ]}
        />
      </Section>

      {/* Ceiling + Path */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Section
          title="Recall-First Ceiling Analysis"
          sub={`Apply recall (${pct(RECALL)}) to full 126 bps approved → theoretical ceiling ${RECALL_CEIL} bps. After MPC/control deduction: ~52 bps (${hc(52)} HC · ${inc(52)}/mo). OCR approval scope has a hard ceiling - full 80 bps path requires rejection + non-OCR expansion.`}
          accent={CLR.recall}
        >
          <Legend keys={['start', 'recall', 'total', 'mpc']} />
          <WFChart
            data={ceilBars}
            height={300}
            yMax={140}
            refLines={[
              { y: 80, label: 'Cumul. 80 bps (Phase 1+2+3)', color: CLR.out },
              { y: 40, label: 'AMJ target 40',    color: CLR.target },
            ]}
          />
        </Section>

        <Section
          title="Path to AMJ 40 bps - OCR Approval Scope"
          sub={`OBD fix, match partial, and MPC+SOP levers get to 40 bps (AMJ quarterly target). Phase 2 rejection automation and Phase 3 non-OCR expansion open the path to 80 bps cumulative.`}
          accent={CLR.add}
        >
          <Legend keys={['current', 'add', 'target']} />
          <WFChart
            data={pathBars}
            height={300}
            yMax={90}
            refLines={[
              { y: 80, label: 'Cumul. 80 bps (Phase 1+2+3)', color: CLR.out },
              { y: 52, label: 'OCR approval ceiling ~52 bps',           color: '#f472b6' },
              { y: 40, label: 'AMJ target 40 bps',                      color: CLR.target },
            ]}
          />
        </Section>
      </div>

      {/* Expansion plan callout */}
      <div style={{ borderRadius: 12, border: '1px solid #E2E8F0', background: 'white', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <p style={{ color: '#0F172A', fontWeight: 700, fontSize: 14, margin: '0 0 12px' }}>
          Path to 80 bps - Three Phases of Automation Expansion
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[
            {
              phase: 'Phase 1 - OCR Approval HPC',
              status: '40 bps achievable',
              statusColor: CLR.target,
              items: [
                `Fix OBD URL: +${OBD_GAIN} bps (${inc(OBD_GAIN)}/mo)`,
                `Match partial: +${MATCH_GAIN} bps (${inc(MATCH_GAIN)}/mo)`,
                `MPC + SOP: +${MPC_SOP} bps (${inc(MPC_SOP)}/mo)`,
              ],
              note: 'Ceiling ~52 bps with perfect data quality. Currently in progress.',
            },
            {
              phase: 'Phase 2 - Rejection Automation',
              status: '191 bps available · sizing TBD',
              statusColor: CLR.unknown,
              items: [
                '191 bps OCR bucket - largest single addressable opportunity',
                'Precision-driven: model confidence thresholds determine safe automation rate',
                'Re-enabling rejection pipeline could contribute significantly to 80 bps',
              ],
              note: 'DS - rejection model precision eval · Ops - rejection SOP readiness.',
            },
            {
              phase: 'Phase 3 - Non-OCR / Non-OBD Expansion',
              status: 'incremental opportunity · sizing TBD',
              statusColor: CLR.recall,
              items: [
                'Returns outside the current OCR pipeline - new addressable universe',
                'Returns currently blocked by non-OBD reasons (outside present funnel)',
                'Expands total addressable base beyond the current 317 bps scope',
              ],
              note: 'PM - scope full returns universe · identify non-OCR routes eligible for automation.',
            },
          ].map(p => (
            <div key={p.phase} style={{ background: '#F8FAFC', borderRadius: 10, padding: '14px 16px', border: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: 10, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px' }}>{p.phase}</p>
              <p style={{ fontSize: 12, fontWeight: 700, color: p.statusColor, margin: '0 0 10px' }}>{p.status}</p>
              <ul style={{ margin: 0, padding: '0 0 0 14px', fontSize: 11, color: '#475569', lineHeight: 1.7 }}>
                {p.items.map(item => <li key={item}>{item}</li>)}
              </ul>
              <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 8, fontStyle: 'italic' }}>{p.note}</p>
            </div>
          ))}
        </div>
        <p style={{ color: '#64748B', fontSize: 11, marginTop: 12, lineHeight: 1.6 }}>
          JFM and AMJ each have a 40 bps target - cumulative 80 bps by AMJ end.
          Phase 1 (OCR approval HPC) gets to 40 bps. Phases 2+3 (rejection automation + non-OCR expansion) open up the next 40 bps.
          Recall improvement is a sub-lever within Phase 1 that raises the ceiling from ~52 bps within OCR approval scope.
        </p>
      </div>

      {/* Lever table */}
      <Section title="Full Lever Breakdown - Path to 80 bps" accent={CLR.add}
        sub="Phase 1 = OCR approval HPC (current scope). Phase 2 = Rejection automation. Phase 3 = Non-OCR / non-OBD expansion.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#94A3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {['Lever', 'Raw bps', '× Recall', '+bps', '+HC', '+Inc/mo', 'Cumulative', 'Owner / Action'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: i >= 3 && i <= 6 ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Phase 1 header */}
              <tr style={{ background: '#F0FDF4', borderTop: '2px solid #E2E8F0' }}>
                <td colSpan={8} style={{ padding: '8px 12px', color: CLR.add, fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
                  PHASE 1 - OCR Approval HPC (current scope)
                </td>
              </tr>
              {[
                { lever: 'Baseline - HPC live',       raw: '-',  mult: '-',         gain: '-',          hcG: `${hc(11)}`,          incG: `${inc(11)}/mo`,          run: '11 bps',                       color: CLR.current, action: '4,087 cases/wk · 13 agents' },
                { lever: 'Fix OBD URL availability',  raw: 52,   mult: pct(RECALL), gain: `+${OBD_GAIN}`,   hcG: `+${hc(OBD_GAIN)}`,   incG: `+${inc(OBD_GAIN)}/mo`,   run: `${rd(11+OBD_GAIN)} bps`,       color: CLR.add,     action: 'Engg - OBD pipeline · 19,771 cases unblocked' },
                { lever: 'Match Cohorts (partial)',   raw: '~7', mult: pct(RECALL), gain: `+${MATCH_GAIN}`, hcG: `+${hc(MATCH_GAIN)}`, incG: `+${inc(MATCH_GAIN)}/mo`, run: `${rd(11+OBD_GAIN+MATCH_GAIN)} bps`, color: CLR.add, action: 'DS - match positions via MR route' },
                { lever: 'MPC expansion + SOP fix',   raw: '-',  mult: '-',         gain: `+${MPC_SOP}`,    hcG: `+${hc(MPC_SOP)}`,    incG: `+${inc(MPC_SOP)}/mo`,    run: '40 bps',                       color: CLR.mpc,     action: 'Ops - sub-reason SOP · PM - MPC cohort setup' },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, color: '#1E293B' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: row.color, flexShrink: 0 }} />
                    {row.lever}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>{row.raw}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: CLR.recall, fontFamily: 'monospace', fontSize: 11 }}>{row.mult}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: CLR.add, fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>{row.gain}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontFamily: 'monospace' }}>{row.hcG}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontFamily: 'monospace' }}>{row.incG}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#0F172A', fontFamily: 'monospace', fontWeight: 700 }}>{row.run}</td>
                  <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 11 }}>{row.action}</td>
                </tr>
              ))}
              {/* Phase 1 subtotal */}
              <tr style={{ background: `${FK_BLUE}0D`, borderTop: '1px solid ${FK_BLUE}20' }}>
                <td style={{ padding: '10px 12px', color: FK_BLUE, fontWeight: 700 }}>JFM Target (Phase 1 complete)</td>
                <td colSpan={5} style={{ padding: '10px 12px' }} />
                <td style={{ padding: '10px 12px', textAlign: 'right', color: FK_BLUE, fontFamily: 'monospace', fontWeight: 700 }}>40 bps</td>
                <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 11 }}>{hc(40)} HC · {inc(40)}/mo · Phase 1 complete</td>
              </tr>

              {/* Phase 2 header */}
              <tr style={{ background: '#FFF7ED', borderTop: '2px solid #E2E8F0' }}>
                <td colSpan={8} style={{ padding: '8px 12px', color: CLR.unknown, fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
                  PHASE 2 - Rejection Automation (OCR bucket, currently paused)
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, color: '#1E293B' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CLR.unknown, flexShrink: 0 }} />
                  Rejection automation - restart
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>191</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace', fontSize: 11 }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: CLR.unknown, fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontFamily: 'monospace', fontWeight: 700 }}>40+ bps</td>
                <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 11 }}>DS - rejection precision eval · Ops - SOP · 191 bps potential bucket</td>
              </tr>

              {/* Phase 3 header */}
              <tr style={{ background: '#F5F3FF', borderTop: '2px solid #E2E8F0' }}>
                <td colSpan={8} style={{ padding: '8px 12px', color: CLR.recall, fontWeight: 700, fontSize: 11, letterSpacing: '0.05em' }}>
                  PHASE 3 - Non-OCR / Non-OBD Bucket Expansion
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid #F1F5F9' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, color: '#1E293B' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: CLR.recall, flexShrink: 0 }} />
                  Non-OCR returns automation
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace', fontSize: 11 }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: CLR.recall, fontFamily: 'monospace', fontWeight: 700, fontSize: 14 }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B', fontFamily: 'monospace' }}>TBD</td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569', fontFamily: 'monospace', fontWeight: 700 }}>TBD</td>
                <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 11 }}>PM - scope returns outside OCR pipeline · returns blocked by non-OBD reasons</td>
              </tr>

              {/* Cumulative target */}
              <tr style={{ background: '#FEF3C7', borderTop: '2px solid #E2E8F0' }}>
                <td style={{ padding: '10px 12px', color: '#92400E', fontWeight: 700 }}>JFM+AMJ Cumulative Target</td>
                <td colSpan={5} style={{ padding: '10px 12px' }} />
                <td style={{ padding: '10px 12px', textAlign: 'right', color: '#92400E', fontFamily: 'monospace', fontWeight: 700 }}>80 bps</td>
                <td style={{ padding: '10px 12px', color: '#64748B', fontSize: 11 }}>{hc(80)} HC · {inc(80)}/mo · Phases 1+2+3</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* Full detail table */}
      <Section title="Full Funnel Detail - Week 17 Actuals" sub="bps, HC, and monthly incident estimates across the full funnel">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#94A3B8', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {['Stage', 'bps', 'HC', 'Inc/mo', 'Notes'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: i >= 1 && i <= 3 ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { stage: 'OCR Bucket',                          bps: 317, t: 'start',   note: 'Total OCR-eligible returns · 560 HC' },
                { stage: '  Rejected (paused)',                 bps: 191, t: 'out',     note: 'Rejection automation paused this cycle' },
                { stage: '  Approved - AI scope',               bps: 126, t: 'start',   note: 'Approval rate 39.6% (plan 55%)' },
                { stage: '    Match Cohorts (excluded)',        bps: 14,  t: 'out',     note: '5,543 cases' },
                { stage: '    MR Returns (excluded)',           bps: 14,  t: 'out',     note: '5,582 cases' },
                { stage: '    Fresh Returns',                   bps: 98,  t: 'start',   note: '37,386 cases' },
                { stage: '      OBD URL Missing  ← fix first', bps: 52,  t: 'out',     note: '19,771 cases - biggest solvable blocker' },
                { stage: '      OBD URL Available',             bps: 46,  t: 'start',   note: '17,615 cases (47%)' },
                { stage: '        Reason Selection (Unknown)',  bps: 8,   t: 'unknown', note: '3,138 cases - SOP fix · not recall' },
                { stage: '        AI Evaluatable',              bps: 38,  t: 'start',   note: '14,477 = recall denominator' },
                { stage: `          Can't Say (${pct(1-RECALL)})`, bps: rd(38*(1-RECALL)), t: 'recall', note: `7,856 cases · recall = ${pct(RECALL)}` },
                { stage: '          AI Reco to Approve',        bps: 17,  t: 'add',     note: '6,621 cases' },
                { stage: '            Control (10%)',           bps: 2,   t: 'mpc',     note: '890 cases' },
                { stage: '            MPC',                     bps: 4,   t: 'mpc',     note: '1,644 cases' },
                { stage: '            HPC Live ✓',              bps: 11,  t: 'current', note: '4,087 cases · 13 agents · Wk 17' },
              ].map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, color: CLR[row.t] ?? '#475569' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, flexShrink: 0, background: CLR[row.t] ?? '#475569' }} />
                    {row.stage}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#1E293B', fontWeight: row.t === 'current' ? 700 : 400 }}>{row.bps}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#64748B' }}>{hc(row.bps)}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#64748B' }}>{inc(row.bps)}</td>
                  <td style={{ padding: '8px 12px', color: '#475569', fontSize: 11 }}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#334155', fontSize: 11, marginTop: 12 }}>
          Wk 17 (Apr 22–26) · Recall = {pct(RECALL)} · HC/bps = {HC_PER_BPS.toFixed(3)} · {r1(INC_PER_BPS)} monthly incidents per bps
        </p>
      </Section>
    </div>
  );
}
