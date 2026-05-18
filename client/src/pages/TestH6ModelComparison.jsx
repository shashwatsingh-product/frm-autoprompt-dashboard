import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const MODEL_COLORS = {
  gemini_2_5_flash: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' },
  gemini_3_0_flash: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-800' },
  gemini_3_1_pro: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800' },
  gemini_3_1_pro_thinking: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-800' },
};

const MODEL_SHORT = {
  gemini_2_5_flash: '2.5 Flash',
  gemini_3_0_flash: '3.0 Flash',
  gemini_3_1_pro: '3.1 Pro',
  gemini_3_1_pro_thinking: '3.1 Pro ✦',
};

function Badge({ value, thresholds = [90, 80] }) {
  const v = parseFloat(value);
  const color = v >= thresholds[0] ? 'bg-emerald-100 text-emerald-800'
    : v >= thresholds[1] ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{value}%</span>;
}

function StatCard({ label, value, sub, className = '' }) {
  return (
    <div className={`bg-white/10 rounded-xl p-3 ${className}`}>
      <p className="text-[10px] text-teal-200">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-teal-200">{sub}</p>}
    </div>
  );
}

function MetricTriple({ label, accuracy, precision, recall, n, correct }) {
  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-white">
      {label && <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">{label}</p>}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center">
          <p className="text-[9px] text-slate-400 uppercase tracking-wide">Accuracy</p>
          <p className="text-sm font-bold text-slate-800">{accuracy ?? '—'}%</p>
          {n != null && <p className="text-[9px] text-slate-400">{correct}/{n}</p>}
        </div>
        <div className="text-center border-x border-slate-100">
          <p className="text-[9px] text-slate-400 uppercase tracking-wide">Precision</p>
          <p className="text-sm font-bold text-indigo-600">{precision ?? '—'}%</p>
          <p className="text-[9px] text-slate-400">macro</p>
        </div>
        <div className="text-center">
          <p className="text-[9px] text-slate-400 uppercase tracking-wide">Recall</p>
          <p className="text-sm font-bold text-emerald-600">{recall ?? '—'}%</p>
          <p className="text-[9px] text-slate-400">macro</p>
        </div>
      </div>
    </div>
  );
}

function PerClassTable({ metrics }) {
  if (!metrics || Object.keys(metrics).length === 0) return null;
  const rows = Object.entries(metrics)
    .filter(([, v]) => v.support > 0 || v.fp > 0)
    .sort((a, b) => b[1].support - a[1].support);

  return (
    <div className="mt-3 pt-3 border-t border-slate-200">
      <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Per-Class Metrics vs Human Labels</p>
      <div className="overflow-x-auto">
        <table className="text-[10px] w-full">
          <thead>
            <tr className="bg-slate-50">
              <th className="px-2 py-1 text-left text-slate-500 font-semibold">Class</th>
              <th className="px-2 py-1 text-center text-slate-500 font-semibold">Acc</th>
              <th className="px-2 py-1 text-center text-indigo-500 font-semibold">Prec</th>
              <th className="px-2 py-1 text-center text-emerald-500 font-semibold">Recall</th>
              <th className="px-2 py-1 text-center text-slate-500 font-semibold">TP</th>
              <th className="px-2 py-1 text-center text-slate-500 font-semibold">FP</th>
              <th className="px-2 py-1 text-center text-slate-500 font-semibold">FN</th>
              <th className="px-2 py-1 text-center text-slate-500 font-semibold">Support</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([cls, v]) => {
              const acc = v.support > 0 ? (v.tp / v.support * 100).toFixed(0) : null;
              return (
                <tr key={cls} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{cls}</td>
                  <td className="px-2 py-1 text-center font-semibold">{acc != null ? `${acc}%` : '—'}</td>
                  <td className="px-2 py-1 text-center font-semibold text-indigo-600">
                    {v.precision != null ? `${v.precision}%` : '—'}
                  </td>
                  <td className="px-2 py-1 text-center font-semibold text-emerald-600">
                    {v.recall != null ? `${v.recall}%` : '—'}
                  </td>
                  <td className="px-2 py-1 text-center text-slate-500">{v.tp}</td>
                  <td className="px-2 py-1 text-center text-rose-500">{v.fp}</td>
                  <td className="px-2 py-1 text-center text-amber-500">{v.fn}</td>
                  <td className="px-2 py-1 text-center text-slate-400">{v.support}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Summary Tab ────────────────────────────────────────── */
function SummaryTab({ data }) {
  if (!data || !data.models) return null;
  const models = data.models;
  const completed = models.filter(m => m.status === 'complete');

  const avgAccuracy = completed.length
    ? (completed.reduce((s, m) => s + (m.accuracy ?? 0), 0) / completed.length).toFixed(1)
    : null;
  const avgMacroP = completed.length
    ? (completed.reduce((s, m) => s + (m.macro_precision ?? 0), 0) / completed.length).toFixed(1)
    : null;
  const avgMacroR = completed.length
    ? (completed.reduce((s, m) => s + (m.macro_recall ?? 0), 0) / completed.length).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-br from-teal-600 via-teal-600 to-emerald-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold">H6: Cross-Model Comparison</h2>
        <p className="text-teal-100 text-sm mt-1">Same data x different Gemini models — do they agree?</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <StatCard label="Models" value={`${completed.length} / 3`} sub="completed" />
          <StatCard label="Rows / Model" value="1,574" sub="787 incidents x 2 agents" />
          <StatCard
            label="Status"
            value={completed.length === 3 ? 'Complete' : 'Running...'}
            sub={completed.length < 3 ? `${3 - completed.length} pending` : 'all models done'}
          />
          {completed.length > 0 && (
            <>
              <StatCard label="Avg Accuracy" value={`${avgAccuracy}%`} sub="correct / total" />
              <StatCard label="Avg Precision / Recall" value={`${avgMacroP}% / ${avgMacroR}%`} sub="macro-averaged" />
            </>
          )}
        </div>
      </div>

      {/* Per-model cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {models.map(m => {
          const mc = MODEL_COLORS[m.key] || {};
          if (m.status === 'not_started') {
            return (
              <div key={m.key} className="rounded-xl border-2 border-dashed border-slate-200 p-5 opacity-50">
                <h3 className="font-bold text-slate-400">{m.label}</h3>
                <p className="text-sm text-slate-400 mt-2">Not started</p>
              </div>
            );
          }
          return (
            <div key={m.key} className={`rounded-xl border ${mc.border} ${mc.bg} p-5`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className={`font-bold ${mc.text}`}>{m.label}</h3>
                  {m.thinking_enabled && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                      ✦ Thinking ON
                    </span>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === 'complete' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {m.status === 'complete' ? 'Done' : 'Running'}
                </span>
              </div>
              {m.thinking_enabled && m.avg_thinking_tokens > 0 && (
                <div className="mb-2 flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                  <span className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide">Thinking</span>
                  <span className="text-xs font-bold text-indigo-700">{Math.round(m.avg_thinking_tokens)} avg tokens/call</span>
                  <span className="text-[10px] text-indigo-400">budget: 2048</span>
                </div>
              )}

              {/* Overall metrics triple */}
              <MetricTriple
                label="Overall vs Human Labels"
                accuracy={m.accuracy}
                precision={m.macro_precision}
                recall={m.macro_recall}
                n={m.accuracy_n}
                correct={m.accuracy_correct}
              />

              {/* CX / OBD triples */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="border border-slate-200 rounded-lg p-2 bg-white">
                  <p className="text-[9px] font-semibold text-slate-500 uppercase mb-1.5">CX Agent</p>
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-400">Accuracy</span>
                      <span className="text-[10px] font-bold text-slate-700">{m.cx_accuracy ?? '—'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-400">Precision</span>
                      <span className="text-[10px] font-bold text-indigo-600">{m.cx_macro_precision ?? '—'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-400">Recall</span>
                      <span className="text-[10px] font-bold text-emerald-600">{m.cx_macro_recall ?? '—'}%</span>
                    </div>
                    <p className="text-[9px] text-slate-400 pt-0.5">{m.cx_correct}/{m.cx_n} correct</p>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-2 bg-white">
                  <p className="text-[9px] font-semibold text-slate-500 uppercase mb-1.5">OBD Agent</p>
                  <div className="space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-400">Accuracy</span>
                      <span className="text-[10px] font-bold text-slate-700">{m.obd_accuracy ?? '—'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-400">Precision</span>
                      <span className="text-[10px] font-bold text-indigo-600">{m.obd_macro_precision ?? '—'}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[9px] text-slate-400">Recall</span>
                      <span className="text-[10px] font-bold text-emerald-600">{m.obd_macro_recall ?? '—'}%</span>
                    </div>
                    <p className="text-[9px] text-slate-400 pt-0.5">{m.obd_correct}/{m.obd_n} correct</p>
                  </div>
                </div>
              </div>

              {/* vs Original Prompt */}
              <div className="mt-2 border border-slate-200 rounded-lg p-2 bg-white">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] text-slate-500">Consistency vs Original Prompt</p>
                  <p className="text-sm font-bold text-slate-700">{m.consistency_vs_original}%</p>
                </div>
                <p className="text-[9px] text-slate-400">{m.matches_vs_original}/{m.matches_vs_original + m.mismatches_vs_original} matches</p>
              </div>

              {/* Per-class table */}
              <PerClassTable metrics={m.per_class_metrics} />

              {m.duration_min > 0 && (
                <p className="text-[10px] text-slate-400 mt-2">{m.duration_min} min | {m.success} success, {m.errors + m.timeouts} err, {m.no_images} no_img</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Comparison Tab ─────────────────────────────────────── */
function ComparisonTab() {
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getH6Comparison(),
      api.getH6Summary(),
    ]).then(([cmp, sum]) => {
      setData(cmp);
      setSummary(sum);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading comparison...</div>;
  if (!data || data.status !== 'ok') return <div className="text-center py-12 text-slate-400">No comparison data yet</div>;

  return (
    <div className="space-y-6">
      {/* 3-way agreement hero */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-600 to-purple-600 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold">3-Way Model Agreement</h2>
        <p className="text-indigo-200 text-sm mt-1">{data.common_rows} rows compared across all models</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">All 3 Agree</p>
            <p className="text-2xl font-bold">{data.three_way_agreement_pct}%</p>
            <p className="text-[10px] text-indigo-200">{data.three_way_agree}/{data.common_rows}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Disagree</p>
            <p className="text-2xl font-bold">{data.three_way_disagree}</p>
            <p className="text-[10px] text-indigo-200">rows with divergence</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Models</p>
            <p className="text-2xl font-bold">{data.model_keys?.length || 0}</p>
            <p className="text-[10px] text-indigo-200">compared</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Common Rows</p>
            <p className="text-2xl font-bold">{data.common_rows}</p>
            <p className="text-[10px] text-indigo-200">with valid decisions</p>
          </div>
        </div>
      </div>

      {/* Per-model accuracy / precision / recall summary */}
      {summary?.models && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-3">Per-Model Accuracy / Precision / Recall vs Human Labels</h3>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Model</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-600">Accuracy</th>
                  <th className="px-3 py-2 text-center font-semibold text-indigo-600">Macro Precision</th>
                  <th className="px-3 py-2 text-center font-semibold text-emerald-600">Macro Recall</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500">CX Acc</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500">CX Prec</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500">CX Recall</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500">OBD Acc</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500">OBD Prec</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-500">OBD Recall</th>
                </tr>
              </thead>
              <tbody>
                {summary.models.filter(m => m.status !== 'not_started').map(m => (
                  <tr key={m.key} className={`border-t border-slate-100 hover:bg-slate-50 ${m.thinking_enabled ? 'bg-indigo-50/40' : ''}`}>
                    <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">
                      <span>{m.label}</span>
                      {m.thinking_enabled && <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-600">✦ thinking</span>}
                    </td>
                    <td className="px-3 py-2 text-center font-bold"><Badge value={m.accuracy} /></td>
                    <td className="px-3 py-2 text-center font-bold text-indigo-600">{m.macro_precision ?? '—'}%</td>
                    <td className="px-3 py-2 text-center font-bold text-emerald-600">{m.macro_recall ?? '—'}%</td>
                    <td className="px-3 py-2 text-center text-slate-600">{m.cx_accuracy ?? '—'}%</td>
                    <td className="px-3 py-2 text-center text-indigo-500">{m.cx_macro_precision ?? '—'}%</td>
                    <td className="px-3 py-2 text-center text-emerald-500">{m.cx_macro_recall ?? '—'}%</td>
                    <td className="px-3 py-2 text-center text-slate-600">{m.obd_accuracy ?? '—'}%</td>
                    <td className="px-3 py-2 text-center text-indigo-500">{m.obd_macro_precision ?? '—'}%</td>
                    <td className="px-3 py-2 text-center text-emerald-500">{m.obd_macro_recall ?? '—'}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-class 3-way */}
      {data.per_class_three_way && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-3">3-Way Agreement by Original Class</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.per_class_three_way).sort((a, b) => b[1].total - a[1].total).map(([cls, s]) => (
              <div key={cls} className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-700">{cls}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <Badge value={s.agreement_pct} />
                  <span className="text-[10px] text-slate-400">{s.agree}/{s.total}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pairwise comparisons */}
      {data.pairwise?.map(pw => (
        <div key={`${pw.model_a}-${pw.model_b}`} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">
              {MODEL_SHORT[pw.model_a] || pw.model_a_label} vs {MODEL_SHORT[pw.model_b] || pw.model_b_label}
            </h3>
            <Badge value={pw.agreement_pct} />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="text-center p-2 bg-slate-50 rounded-lg">
              <p className="text-[10px] text-slate-500">Overall</p>
              <p className="text-lg font-bold">{pw.agreement_pct}%</p>
              <p className="text-[10px] text-slate-400">{pw.agree}/{pw.total}</p>
            </div>
            {['cx', 'obd'].map(ag => (
              <div key={ag} className="text-center p-2 bg-slate-50 rounded-lg">
                <p className="text-[10px] text-slate-500">{ag.toUpperCase()} Agent</p>
                <p className="text-lg font-bold">{pw.per_agent[ag]?.agreement_pct || 0}%</p>
                <p className="text-[10px] text-slate-400">{pw.per_agent[ag]?.agree}/{pw.per_agent[ag]?.total}</p>
              </div>
            ))}
          </div>

          {/* Confusion matrix */}
          {pw.matrix_classes && pw.matrix_classes.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs font-semibold text-slate-600 mb-2">
                Confusion Matrix ({MODEL_SHORT[pw.model_a]} rows vs {MODEL_SHORT[pw.model_b]} cols)
              </p>
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-2 py-1 text-left font-semibold text-slate-600 border border-slate-200"></th>
                    {pw.matrix_classes.map(c => (
                      <th key={c} className="px-2 py-1 text-center font-semibold text-slate-600 border border-slate-200 whitespace-nowrap">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pw.matrix.map(row => (
                    <tr key={row.class}>
                      <td className="px-2 py-1 font-semibold text-slate-700 border border-slate-200 whitespace-nowrap bg-slate-50">{row.class}</td>
                      {pw.matrix_classes.map(c => {
                        const val = row[c] || 0;
                        const isDiag = row.class === c;
                        return (
                          <td key={c} className={`px-2 py-1 text-center border border-slate-200 ${
                            isDiag ? 'bg-emerald-50 font-bold' : val > 0 ? 'bg-rose-50' : ''
                          }`}>
                            {val || ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}

      {/* Disagreement rows */}
      {data.disagreement_rows && data.disagreement_rows.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 mb-1">Disagreement Rows</h3>
          <p className="text-xs text-slate-500 mb-3">{data.disagreement_total} rows where models disagree</p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Incident ID</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Agent</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Human Label</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-slate-600">Original</th>
                  {(data.model_keys || []).map(mk => (
                    <th key={mk} className="px-2 py-1.5 text-left font-semibold text-slate-600">{MODEL_SHORT[mk]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.disagreement_rows.slice(0, 100).map((row, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-1.5 font-mono text-[10px]">{row.incident_id}</td>
                    <td className="px-2 py-1.5">{row.agent?.toUpperCase()}</td>
                    <td className="px-2 py-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">{row.human_label}</span>
                    </td>
                    <td className="px-2 py-1.5 text-slate-500">{row.original_decision}</td>
                    {(data.model_keys || []).map(mk => {
                      const dec = row.decisions?.[mk] || '';
                      const matchesHuman = dec === row.human_label;
                      return (
                        <td key={mk} className="px-2 py-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            matchesHuman ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>{dec}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Data Explorer Tab ──────────────────────────────────── */
function DataExplorerTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ agent: '', agreement: '', search: '', page: 1, limit: 25 });
  const [expanded, setExpanded] = useState(null);
  const [detail, setDetail] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getH6Data(filters);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleExpand = async (row) => {
    const key = `${row.incident_id}|${row.agent}`;
    if (expanded === key) {
      setExpanded(null);
      setDetail(null);
      return;
    }
    setExpanded(key);
    try {
      const d = await api.getH6Detail({ incident_id: row.incident_id, agent: row.agent });
      setDetail(d);
    } catch (e) { console.error(e); }
  };

  const modelKeys = data?.model_keys || [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filters.agent}
            onChange={e => setFilters(f => ({ ...f, agent: e.target.value, page: 1 }))}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          >
            <option value="">All Agents</option>
            <option value="cx">CX Agent</option>
            <option value="obd">OBD Agent</option>
          </select>
          <select
            value={filters.agreement}
            onChange={e => setFilters(f => ({ ...f, agreement: e.target.value, page: 1 }))}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          >
            <option value="">All</option>
            <option value="agree">All Agree</option>
            <option value="disagree">Any Disagree</option>
          </select>
          <input
            placeholder="Search incident ID..."
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value, page: 1 }))}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 w-60"
          />
          {data && <span className="text-xs text-slate-500 ml-auto">{data.total} rows</span>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-3 py-2 text-left font-semibold text-slate-600">Incident ID</th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-600">Agent</th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-600">Human Label</th>
                  <th className="px-2 py-2 text-left font-semibold text-slate-600">Original</th>
                  {modelKeys.map(mk => (
                    <th key={mk} className="px-2 py-2 text-left font-semibold text-slate-600">{MODEL_SHORT[mk]}</th>
                  ))}
                  <th className="px-2 py-2 text-center font-semibold text-slate-600">Agree</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows || []).map((row, i) => {
                  const rowKey = `${row.incident_id}|${row.agent}`;
                  const isExpanded = expanded === rowKey;
                  return (
                    <>
                      <tr
                        key={rowKey}
                        className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                        onClick={() => toggleExpand(row)}
                      >
                        <td className="px-3 py-2 font-mono text-[10px]">{row.incident_id}</td>
                        <td className="px-2 py-2">{row.agent?.toUpperCase()}</td>
                        <td className="px-2 py-2">
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">{row.human_label}</span>
                        </td>
                        <td className="px-2 py-2 text-slate-500">{row.original_decision}</td>
                        {modelKeys.map(mk => {
                          const dec = row.decisions?.[mk] || '';
                          const matchesHuman = dec === row.human_label;
                          return (
                            <td key={mk} className="px-2 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                matchesHuman ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                              }`}>{dec}</span>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 text-center">
                          {row.all_agree
                            ? <span className="text-emerald-600 font-bold">Y</span>
                            : <span className="text-rose-600 font-bold">N</span>}
                        </td>
                      </tr>
                      {isExpanded && detail && (
                        <tr key={`${rowKey}-detail`}>
                          <td colSpan={5 + modelKeys.length} className="px-4 py-4 bg-slate-50 border-t border-slate-200">
                            <div className="space-y-4">
                              {/* Images */}
                              {detail.images && detail.images.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-slate-600 mb-2">Input Images</p>
                                  <div className="flex gap-2 flex-wrap">
                                    {detail.images.map((img, j) => (
                                      <div key={j} className="text-center">
                                        <img src={img.url} alt={img.label} className="w-24 h-24 object-cover rounded-lg border border-slate-200" />
                                        <p className="text-[9px] text-slate-400 mt-1">{img.label}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {/* Per-model outputs */}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {modelKeys.map(mk => {
                                  const out = detail.model_outputs?.[mk];
                                  if (!out) return (
                                    <div key={mk} className="border border-slate-200 rounded-lg p-3 opacity-50">
                                      <p className="text-xs font-bold text-slate-400">{MODEL_SHORT[mk]}</p>
                                      <p className="text-xs text-slate-400 mt-1">No data</p>
                                    </div>
                                  );
                                  const mc = MODEL_COLORS[mk] || {};
                                  const matchesHuman = out.decision === detail.model_outputs?.[modelKeys[0]]?.decision;
                                  return (
                                    <div key={mk} className={`border rounded-lg p-3 ${mc.border} ${mc.bg}`}>
                                      <div className="flex items-center justify-between">
                                        <p className={`text-xs font-bold ${mc.text}`}>{MODEL_SHORT[mk]}</p>
                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${mc.badge}`}>{out.decision}</span>
                                      </div>
                                      {out.raw && (
                                        <pre className="text-[10px] text-slate-600 mt-2 bg-white/50 p-2 rounded overflow-x-auto max-h-32 whitespace-pre-wrap">
                                          {out.raw}
                                        </pre>
                                      )}
                                      <p className="text-[9px] text-slate-400 mt-1">
                                        {out.prompt_tokens} in / {out.output_tokens} out tokens
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total > data.limit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <span className="text-xs text-slate-500">
              Page {data.page} of {Math.ceil(data.total / data.limit)}
            </span>
            <div className="flex gap-2">
              <button
                disabled={data.page <= 1}
                onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
                className="px-3 py-1 text-xs rounded border border-slate-300 disabled:opacity-30"
              >Prev</button>
              <button
                disabled={data.page >= Math.ceil(data.total / data.limit)}
                onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
                className="px-3 py-1 text-xs rounded border border-slate-300 disabled:opacity-30"
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Divergence Explorer Tab ────────────────────────────── */
const DIVERGENCE_COLORS = {
  all_agree:      'bg-emerald-100 text-emerald-700',
  two_one_split:  'bg-amber-100 text-amber-700',
  all_differ:     'bg-rose-100 text-rose-700',
};

const DIV_LABELS = {
  all_agree:     'All Agree',
  two_one_split: '2-1 Split',
  all_differ:    'All Differ',
};

function DecisionCell({ decision, humanLabel }) {
  const match = decision === humanLabel;
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
      match ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300' : 'bg-rose-50 text-rose-700'
    }`}>{decision || '—'}</span>
  );
}

function DivergenceTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ type: '', agent: '', search: '' });
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  useEffect(() => {
    api.getH6Comparison().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-12 text-slate-400">Loading divergence data...</div>;
  if (!data || data.status !== 'ok') return <div className="text-center py-12 text-slate-400">No data</div>;

  const ds = data.divergence_summary;
  const modelKeys = data.model_keys || [];

  // Filter rows
  let rows = data.disagreement_rows || [];
  if (filter.type) rows = rows.filter(r => r.divergence_type === filter.type);
  if (filter.agent) rows = rows.filter(r => r.agent === filter.agent);
  if (filter.search) rows = rows.filter(r =>
    r.incident_id?.toLowerCase().includes(filter.search.toLowerCase()));

  const totalFiltered = rows.length;
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(totalFiltered / PAGE_SIZE);

  const setF = (key, val) => { setFilter(f => ({ ...f, [key]: val })); setPage(1); };

  return (
    <div className="space-y-5">
      {/* Hero stats */}
      <div className="bg-gradient-to-br from-rose-600 via-rose-600 to-pink-700 rounded-2xl p-6 text-white">
        <h2 className="text-xl font-bold">Incident-Level Model Divergence</h2>
        <p className="text-rose-100 text-sm mt-1">
          Which specific incidents get different predictions across Gemini models?
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">Total Incidents</p>
            <p className="text-2xl font-bold">{data.common_rows}</p>
            <p className="text-[10px] text-rose-200">across all models</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">All 3 Agree</p>
            <p className="text-2xl font-bold">{ds.all_agree_pct}%</p>
            <p className="text-[10px] text-rose-200">{ds.all_agree} incidents</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">2-1 Split</p>
            <p className="text-2xl font-bold">{ds.two_one_pct}%</p>
            <p className="text-[10px] text-rose-200">{ds.two_one_split} incidents</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">All 3 Differ</p>
            <p className="text-2xl font-bold">{ds.all_differ_pct}%</p>
            <p className="text-[10px] text-rose-200">{ds.all_differ} incidents</p>
          </div>
        </div>
      </div>

      {/* Divergence breakdown + model outlier + model accuracy */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Agreement donut-style breakdown */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-sm mb-3">Agreement Breakdown</h3>
          {[
            { key: 'all_agree',     label: 'All 3 Agree',  n: ds.all_agree,     pct: ds.all_agree_pct,     bar: 'bg-emerald-400' },
            { key: 'two_one_split', label: '2-1 Split',    n: ds.two_one_split, pct: ds.two_one_pct,       bar: 'bg-amber-400' },
            { key: 'all_differ',    label: 'All 3 Differ', n: ds.all_differ,    pct: ds.all_differ_pct,    bar: 'bg-rose-400' },
          ].map(row => (
            <div key={row.key} className="mb-3">
              <div className="flex justify-between items-center text-xs mb-1">
                <span className="text-slate-600 font-medium">{row.label}</span>
                <span className="font-bold text-slate-800">{row.n} <span className="text-slate-400 font-normal">({row.pct}%)</span></span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className={`${row.bar} h-2 rounded-full`} style={{ width: `${row.pct}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Which model is the outlier most? */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Most Frequent Outlier (2-1 Splits)</h3>
          <p className="text-[10px] text-slate-400 mb-3">Which model disagrees when the other two agree?</p>
          {Object.entries(ds.outlier_counts || {}).sort((a,b) => b[1]-a[1]).map(([model, cnt]) => {
            const pct = ds.two_one_split ? (cnt / ds.two_one_split * 100).toFixed(1) : 0;
            return (
              <div key={model} className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 font-medium">{model}</span>
                  <span className="font-bold text-slate-800">{cnt} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-indigo-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
          <p className="text-[10px] text-slate-400 mt-2">
            Majority decision matches human: {ds.majority_correct_on_2_1} / {ds.two_one_split} ({ds.majority_correct_pct}%)
          </p>
        </div>

        {/* Which model best matches human on disagreements? */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-bold text-slate-800 text-sm mb-1">Matches Human Label on Disagreements</h3>
          <p className="text-[10px] text-slate-400 mb-3">Among {ds.all_agree !== data.common_rows ? data.common_rows - ds.all_agree : 0} divergent incidents, how often does each model get it right?</p>
          {Object.entries(ds.human_match_counts || {}).sort((a,b) => b[1]-a[1]).map(([model, cnt]) => {
            const total = data.common_rows - ds.all_agree;
            const pct = total ? (cnt / total * 100).toFixed(1) : 0;
            return (
              <div key={model} className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-600 font-medium">{model}</span>
                  <span className="font-bold text-slate-800">{cnt} <span className="text-slate-400 font-normal">({pct}%)</span></span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-emerald-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Incident table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Filters */}
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-3 items-center">
          <h3 className="font-bold text-slate-800 text-sm">Diverging Incidents</h3>
          <select
            value={filter.type}
            onChange={e => setF('type', e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          >
            <option value="">All Divergence Types</option>
            <option value="two_one_split">2-1 Split only</option>
            <option value="all_differ">All 3 Differ only</option>
          </select>
          <select
            value={filter.agent}
            onChange={e => setF('agent', e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5"
          >
            <option value="">All Agents</option>
            <option value="cx">CX Agent</option>
            <option value="obd">OBD Agent</option>
          </select>
          <input
            placeholder="Search incident ID..."
            value={filter.search}
            onChange={e => setF('search', e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 w-56"
          />
          <span className="text-xs text-slate-500 ml-auto">{totalFiltered} incidents</span>
        </div>

        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Incident ID</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Agent</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Human Label</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600">Original</th>
                {modelKeys.map(mk => (
                  <th key={mk} className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">
                    {MODEL_SHORT[mk] || mk}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-semibold text-slate-600">Type</th>
                <th className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Outlier</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={`${row.incident_id}|${row.agent}|${i}`}
                    className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-[10px] text-slate-600">{row.incident_id}</td>
                  <td className="px-2 py-2 text-slate-700">{row.agent?.toUpperCase()}</td>
                  <td className="px-2 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">
                      {row.human_label}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-slate-500 text-[10px]">{row.original_decision}</td>
                  {modelKeys.map(mk => (
                    <td key={mk} className="px-2 py-2">
                      <DecisionCell decision={row.decisions?.[mk]} humanLabel={row.human_label} />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${DIVERGENCE_COLORS[row.divergence_type]}`}>
                      {DIV_LABELS[row.divergence_type]}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[10px] text-slate-500">
                    {row.outlier_model ? MODEL_SHORT[row.outlier_model] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-xs rounded border border-slate-300 disabled:opacity-30">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-xs rounded border border-slate-300 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function TestH6ModelComparison() {
  const [activeTab, setActiveTab] = useState('summary');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await api.getH6Summary();
      setSummary(data);
      if (data.completed_models === 3) setAutoRefresh(false);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  useEffect(() => {
    if (!autoRefresh) return;
    const iv = setInterval(fetchSummary, 30000);
    return () => clearInterval(iv);
  }, [autoRefresh, fetchSummary]);

  const tabs = [
    { key: 'summary', label: 'Summary' },
    { key: 'comparison', label: 'Model Comparison' },
    { key: 'divergence', label: 'Divergence Explorer' },
    { key: 'data', label: 'Data Explorer' },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-center h-64 text-slate-400">Loading H6 data...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === t.key ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >{t.label}</button>
        ))}
        {autoRefresh && (
          <span className="ml-auto flex items-center gap-1 px-3 text-xs text-teal-600">
            <span className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
            Auto-refreshing
          </span>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'summary' ? (
        <SummaryTab data={summary} />
      ) : activeTab === 'comparison' ? (
        <ComparisonTab />
      ) : activeTab === 'divergence' ? (
        <DivergenceTab />
      ) : (
        <DataExplorerTab />
      )}
    </div>
  );
}
