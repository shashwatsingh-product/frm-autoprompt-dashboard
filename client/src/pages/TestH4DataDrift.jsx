import { useState, useEffect } from 'react';
import { api } from '../api/client';

/* ── Helpers ─────────────────────────────────────────────── */
function accColor(v) {
  if (v == null) return 'text-slate-400';
  return v >= 75 ? 'text-emerald-600' : v >= 50 ? 'text-amber-600' : 'text-rose-600';
}
function accBg(v) {
  if (v == null) return 'bg-slate-100 text-slate-500';
  return v >= 75 ? 'bg-emerald-100 text-emerald-700' : v >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700';
}

function Pill({ label, count, pct, color = 'slate' }) {
  const colors = {
    slate:   'bg-slate-100 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose:    'bg-rose-50 text-rose-700 border-rose-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    violet:  'bg-violet-50 text-violet-700 border-violet-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${colors[color] || colors.slate}`}>
      <p className="text-[10px] font-semibold truncate max-w-[130px]">{label}</p>
      <p className="text-sm font-bold">{count} <span className="text-[10px] font-normal opacity-70">({pct}%)</span></p>
    </div>
  );
}

function StatRow({ label, value, sub, highlight }) {
  return (
    <div className={`flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0 ${highlight ? 'bg-amber-50 -mx-3 px-3 rounded' : ''}`}>
      <span className="text-xs text-slate-600">{label}</span>
      <span className={`text-xs font-bold ${highlight ? 'text-amber-700' : 'text-slate-800'}`}>
        {value} {sub && <span className="font-normal text-slate-400 text-[10px]">{sub}</span>}
      </span>
    </div>
  );
}

function PerClassTable({ perClass }) {
  if (!perClass || Object.keys(perClass).length === 0) return null;
  const rows = Object.entries(perClass)
    .filter(([, v]) => v.support > 0 || v.fp > 0)
    .sort((a, b) => b[1].support - a[1].support);

  return (
    <div className="overflow-x-auto mt-1">
      <table className="text-[10px] w-full">
        <thead>
          <tr className="bg-slate-50">
            {['Class', 'Accuracy', 'Precision', 'Recall', 'TP', 'FP', 'FN', 'Support'].map(h => (
              <th key={h} className="px-2 py-1.5 text-left font-semibold text-slate-500 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([cls, v]) => (
            <tr key={cls} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-2 py-1.5 font-medium text-slate-700 whitespace-nowrap">{cls}</td>
              <td className={`px-2 py-1.5 font-bold ${accColor(v.accuracy)}`}>{v.accuracy != null ? `${v.accuracy}%` : '—'}</td>
              <td className="px-2 py-1.5 font-semibold text-indigo-600">{v.precision != null ? `${v.precision}%` : '—'}</td>
              <td className="px-2 py-1.5 font-semibold text-emerald-600">{v.recall != null ? `${v.recall}%` : '—'}</td>
              <td className="px-2 py-1.5 text-slate-500">{v.tp}</td>
              <td className="px-2 py-1.5 text-rose-500">{v.fp}</td>
              <td className="px-2 py-1.5 text-amber-500">{v.fn}</td>
              <td className="px-2 py-1.5 text-slate-400">{v.support}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalCard({ type, text }) {
  const cfg = {
    entity:   { bg: 'bg-rose-50 border-rose-200',   icon: '⚠', label: 'New Entity',       tc: 'text-rose-700' },
    ambiguity:{ bg: 'bg-amber-50 border-amber-200',  icon: '?', label: 'Ambiguity',         tc: 'text-amber-700' },
    temporal: { bg: 'bg-violet-50 border-violet-200',icon: '⏱', label: 'Temporal Drift',    tc: 'text-violet-700' },
    image:    { bg: 'bg-blue-50 border-blue-200',    icon: '🖼', label: 'Image Gap',         tc: 'text-blue-700' },
    good:     { bg: 'bg-emerald-50 border-emerald-200', icon: '✓', label: 'Signal',          tc: 'text-emerald-700' },
  };
  const c = cfg[type] || cfg.good;
  return (
    <div className={`rounded-lg border px-3 py-2 ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-sm">{c.icon}</span>
        <span className={`text-[9px] font-bold uppercase tracking-wide ${c.tc}`}>{c.label}</span>
      </div>
      <p className={`text-xs ${c.tc}`}>{text}</p>
    </div>
  );
}

/* ── Label Distribution Bar ──────────────────────────────── */
function LabelBar({ dist, total }) {
  const ORDER_COLOR = [
    ['Misshipment',    'bg-rose-400'],
    ['Issue',          'bg-rose-400'],
    ['No Issue',       'bg-emerald-400'],
    ["Can't Say",      'bg-amber-400'],
    ['Minor Damage',   'bg-orange-400'],
    ['Major Damage',   'bg-red-500'],
    ['Multiple Issue', 'bg-pink-400'],
    ['Minor Missing',  'bg-purple-400'],
    ['Major Missing',  'bg-purple-600'],
  ];
  const colorMap = Object.fromEntries(ORDER_COLOR);
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 mb-2">
        {entries.map(([cls, cnt]) => {
          const pct = total ? cnt / total * 100 : 0;
          return (
            <div
              key={cls}
              className={`${colorMap[cls] || 'bg-slate-400'} transition-all`}
              style={{ width: `${pct}%` }}
              title={`${cls}: ${cnt} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([cls, cnt]) => {
          const pct = total ? (cnt / total * 100).toFixed(1) : 0;
          const bg = colorMap[cls] || 'bg-slate-400';
          return (
            <div key={cls} className="flex items-center gap-1 text-[10px] text-slate-600">
              <span className={`w-2 h-2 rounded-full ${bg} inline-block`} />
              {cls}: {cnt} ({pct}%)
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Section Components ──────────────────────────────────── */
function CatalogSection({ data }) {
  const total = data.total;
  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-br from-rose-600 to-pink-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Catalog Images</h2>
            <p className="text-rose-100 text-sm mt-0.5">Product catalog photos used to verify if a returned item matches the ordered product</p>
          </div>
          <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-semibold">catalog_correctness_agent</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">Total Records</p>
            <p className="text-2xl font-bold">{total.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">Image Coverage</p>
            <p className="text-2xl font-bold">{data.image_coverage_pct}%</p>
            <p className="text-[10px] text-rose-200">{data.has_image} / {total}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">Overall Accuracy</p>
            <p className="text-2xl font-bold">{data.overall_accuracy}%</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-rose-200">Ambiguity (Can't Say)</p>
            <p className="text-2xl font-bold">{data.cant_say_pct}%</p>
            <p className="text-[10px] text-rose-200">{data.cant_say_n} records</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Label distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Human Label Distribution</h3>
          <LabelBar dist={data.label_distribution} total={total} />
          <div className="mt-4">
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Per-Class Accuracy / Precision / Recall</h4>
            <PerClassTable perClass={data.per_class} />
          </div>
        </div>

        {/* Mismatches + signals */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Top Mismatch Patterns</h3>
            <div className="space-y-2">
              {data.top_mismatches.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="font-mono text-slate-600">{m.pattern}</span>
                  <span className="font-bold text-slate-800 bg-rose-50 px-2 py-0.5 rounded">{m.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">H4 Signals</h3>
            <div className="space-y-2">
              <SignalCard type="good"
                text={`100% image coverage — catalog images always present, no data gap from missing images.`} />
              <SignalCard type="good"
                text={`Label distribution is heavily skewed: ${data.label_distribution['Issue'] || 0} Issue (${((data.label_distribution['Issue']||0)/total*100).toFixed(0)}%) vs ${data.label_distribution['No Issue']||0} No Issue. Labelling data had clear-cut majority cases.`} />
              {data.new_entities.length > 0 && (
                <SignalCard type="entity"
                  text={`Unexpected label(s) in labelling data: ${data.new_entities.join(', ')}. Expected only: ${data.expected_labels.join(', ')}.`} />
              )}
              <SignalCard type="ambiguity"
                text={`Only ${data.cant_say_pct}% Can't Say — catalog comparison is the most clear-cut signal of all three agents.`} />
              {data.monthly.length > 0 && (
                <SignalCard type="temporal"
                  text={`Data spans ${data.monthly.map(m => m.month).join(', ')}. ${data.monthly.length === 1 ? 'All records from a single month — no temporal spread to measure drift.' : `Monthly accuracy: ${data.monthly.map(m => `${m.month}: ${m.accuracy}%`).join(', ')}.`}`} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OBDSection({ data }) {
  const total = data.total;
  const ivi = data.img_vs_noimg;
  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">OBD Images</h2>
            <p className="text-indigo-100 text-sm mt-0.5">Out-of-Box Delivery agent photos taken during delivery — captured at customer doorstep</p>
          </div>
          <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-semibold">image_adjudication_obd_agent</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Total Records</p>
            <p className="text-2xl font-bold">{total.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Image Coverage</p>
            <p className="text-2xl font-bold">{data.image_coverage_pct}%</p>
            <p className="text-[10px] text-indigo-200">{data.has_image} have OBD img</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Overall Accuracy</p>
            <p className="text-2xl font-bold">{data.overall_accuracy}%</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">Ambiguity (Can't Say)</p>
            <p className="text-2xl font-bold">{data.cant_say_pct}%</p>
            <p className="text-[10px] text-indigo-200">{data.cant_say_n} records</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-indigo-200">With img Acc</p>
            <p className="text-2xl font-bold">{ivi.with_img_acc}%</p>
            <p className="text-[10px] text-indigo-200">vs {ivi.no_img_acc}% no-img</p>
          </div>
        </div>
      </div>

      {/* Image coverage breakdown callout */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-4">
        <div className="text-2xl">🖼</div>
        <div>
          <p className="text-sm font-bold text-blue-800">Critical Image Gap: {data.no_image} / {total} records ({(100 - data.image_coverage_pct).toFixed(1)}%) have NO OBD image</p>
          <p className="text-xs text-blue-600 mt-1">
            Model accuracy with OBD image: <strong>{ivi.with_img_acc}%</strong> ({ivi.with_img_n} cases) vs without: <strong>{ivi.no_img_acc}%</strong> ({ivi.no_img_n} cases).
            A {(ivi.with_img_acc - ivi.no_img_acc).toFixed(1)}pp accuracy gap — the model is essentially blind without OBD photos.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Label distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Human Label Distribution</h3>
          <LabelBar dist={data.label_distribution} total={total} />
          <div className="mt-4">
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Per-Class Accuracy / Precision / Recall</h4>
            <PerClassTable perClass={data.per_class} />
          </div>
        </div>

        <div className="space-y-4">
          {/* Sub-reason */}
          {data.sub_reason_breakdown?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Accuracy by Sub-Reason</h3>
              <div className="space-y-2">
                {data.sub_reason_breakdown.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 flex-1 truncate" title={s.sub_reason}>{s.sub_reason}</span>
                    <span className="text-[10px] text-slate-400">{s.count}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${accBg(s.accuracy)}`}>{s.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mismatches */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Top Mismatch Patterns</h3>
            <div className="space-y-2">
              {data.top_mismatches.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="font-mono text-slate-600">{m.pattern}</span>
                  <span className="font-bold text-slate-800 bg-rose-50 px-2 py-0.5 rounded">{m.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* H4 Signals */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">H4 Signals</h3>
            <div className="space-y-2">
              <SignalCard type="image"
                text={`${(100 - data.image_coverage_pct).toFixed(1)}% of labelled OBD cases have no image. These cases are systematically different — model defaults to Can't Say without visual evidence.`} />
              <SignalCard type="ambiguity"
                text={`${data.cant_say_pct}% Can't Say label rate (${data.cant_say_n} records) — far higher than catalog (0.1%) and CX (11.6%). OBD photos genuinely can't prove misshipment: they show the outer box, not the product.`} />
              {data.new_entities.length > 0 && (
                <SignalCard type="entity"
                  text={`Unexpected labels in OBD data: ${data.new_entities.join(', ')}. Expected: ${data.expected_labels.join(', ')}. New categories not in the model's training scope.`} />
              )}
              <SignalCard type="ambiguity"
                text={`No Issue accuracy is only ${data.per_class?.['No Issue']?.accuracy ?? '?'}% — the model frequently predicts Can't Say when human says No Issue. OBD images rarely show clear "no issue" signals.`} />
              {data.monthly.length > 0 && (
                <SignalCard type="temporal"
                  text={`Data spans: ${data.monthly.map(m => `${m.month} (${m.accuracy}% acc, ${m.cnt} cases)`).join(' → ')}.`} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CXSection({ data }) {
  const total = data.total;
  const imgDist = data.image_count_dist || {};
  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">CX Images</h2>
            <p className="text-emerald-100 text-sm mt-0.5">Customer-uploaded photos of the returned item submitted during the return request</p>
          </div>
          <span className="px-3 py-1 bg-white/20 rounded-full text-xs font-semibold">image_adjudication_cx_agent</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200">Total Records</p>
            <p className="text-2xl font-bold">{total.toLocaleString()}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200">Image Coverage</p>
            <p className="text-2xl font-bold">{data.image_coverage_pct}%</p>
            <p className="text-[10px] text-emerald-200">{data.has_image} / {total}</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200">Overall Accuracy</p>
            <p className="text-2xl font-bold">{data.overall_accuracy}%</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <p className="text-[10px] text-emerald-200">Ambiguity (Can't Say)</p>
            <p className="text-2xl font-bold">{data.cant_say_pct}%</p>
            <p className="text-[10px] text-emerald-200">{data.cant_say_n} records</p>
          </div>
        </div>
      </div>

      {/* New entities callout */}
      {data.new_entities.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex gap-4">
          <div className="text-2xl">⚠</div>
          <div>
            <p className="text-sm font-bold text-rose-800">New label categories detected in CX data: {data.new_entities.join(', ')}</p>
            <p className="text-xs text-rose-600 mt-1">
              These {data.new_entities.reduce((s, e) => s + (data.label_distribution[e] || 0), 0)} records ({
                (data.new_entities.reduce((s, e) => s + (data.label_distribution[e] || 0), 0) / total * 100).toFixed(1)
              }%) carry damage/multi-issue labels on cases filed as MISSHIPMENT. This reflects production complexity — customers return for overlapping reasons.
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {/* Label distribution */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Human Label Distribution</h3>
          <LabelBar dist={data.label_distribution} total={total} />
          <div className="mt-4">
            <h4 className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Per-Class Accuracy / Precision / Recall</h4>
            <PerClassTable perClass={data.per_class} />
          </div>
        </div>

        <div className="space-y-4">
          {/* Image count distribution */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Customer Image Count per Case</h3>
            <div className="flex gap-3">
              {Object.entries(imgDist).map(([n, cnt]) => (
                <div key={n} className="text-center bg-slate-50 rounded-lg p-3 flex-1">
                  <p className="text-lg font-bold text-slate-800">{n}</p>
                  <p className="text-[10px] text-slate-400">image{n !== '1' ? 's' : ''}</p>
                  <p className="text-xs font-semibold text-slate-600 mt-1">{cnt}</p>
                  <p className="text-[9px] text-slate-400">{(cnt / total * 100).toFixed(1)}%</p>
                </div>
              ))}
            </div>
          </div>

          {/* Sub-reason */}
          {data.sub_reason_breakdown?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-3">Accuracy by Sub-Reason</h3>
              <div className="space-y-2">
                {data.sub_reason_breakdown.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-slate-600 flex-1 truncate" title={s.raw}>{s.sub_reason}</span>
                    <span className="text-[10px] text-slate-400">{s.count}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${accBg(s.accuracy)}`}>{s.accuracy}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mismatches */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Top Mismatch Patterns</h3>
            <div className="space-y-2">
              {data.top_mismatches.map((m, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                  <span className="font-mono text-slate-600">{m.pattern}</span>
                  <span className="font-bold text-slate-800 bg-rose-50 px-2 py-0.5 rounded">{m.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* H4 Signals */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">H4 Signals</h3>
            <div className="space-y-2">
              <SignalCard type="good"
                text={`${data.image_coverage_pct}% image coverage — customers almost always upload photos. ${imgDist['3'] || 0} cases have 3 images, providing rich visual evidence.`} />
              {data.new_entities.length > 0 && (
                <SignalCard type="entity"
                  text={`${data.new_entities.length} new label categories not seen in expected scope: ${data.new_entities.join(', ')}. Production has genuinely mixed-reason returns that labelling didn't anticipate.`} />
              )}
              <SignalCard type="ambiguity"
                text={`${data.cant_say_pct}% ambiguity rate. Largest confusion: Misshipment↔No Issue (${(data.top_mismatches[0]?.count || 0) + (data.top_mismatches[1]?.count || 0)} cases). Customers photograph items that don't clearly prove misshipment.`} />
              <SignalCard type="ambiguity"
                text={`No Issue class: only ${data.per_class?.['No Issue']?.recall ?? '?'}% recall — model misses many genuine No Issue cases, classifying them as Misshipment.`} />
              {data.monthly.length > 0 && (
                <SignalCard type="temporal"
                  text={`Temporal span: ${data.monthly.map(m => `${m.month} (${m.accuracy}% acc, ${m.cnt} cases)`).join(' → ')}.`} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
export default function TestH4DataDrift() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('catalog');

  useEffect(() => {
    api.getH4All().then(d => { setData(d); setLoading(false); }).catch(console.error);
  }, []);

  const tabs = [
    { key: 'catalog', label: 'Catalog Images', icon: '🏷' },
    { key: 'obd',     label: 'OBD Images',     icon: '📦' },
    { key: 'cx',      label: 'CX Images',       icon: '📸' },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-rose-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <h1 className="text-xl font-bold">H4: Data Pattern Drift — Sari Misshipment</h1>
        <p className="text-slate-300 text-sm mt-1">
          Validating whether labelling data patterns match production reality across three image signal types
        </p>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4">
          {[
            { label: 'Vertical', value: 'Sari' },
            { label: 'Reason', value: 'MISSHIPMENT' },
            { label: 'Records / Agent', value: '790' },
            { label: 'Catalog Acc', value: `${data?.catalog?.overall_accuracy}%`, color: accColor(data?.catalog?.overall_accuracy) },
            { label: 'OBD Acc', value: `${data?.obd?.overall_accuracy}%`, color: accColor(data?.obd?.overall_accuracy) },
            { label: 'CX Acc', value: `${data?.cx?.overall_accuracy}%`, color: accColor(data?.cx?.overall_accuracy) },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/10 rounded-xl px-3 py-2">
              <p className="text-[10px] text-slate-400">{label}</p>
              <p className={`text-lg font-bold ${color || 'text-white'}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Hypothesis checklist */}
        <div className="mt-4 grid md:grid-cols-3 gap-3">
          {[
            { id: '①', label: 'New Entities', desc: 'Labels in production not represented in labelling' },
            { id: '②', label: 'Ambiguity Gap', desc: 'Labelling had clear cases; production has genuinely ambiguous ones' },
            { id: '③', label: 'Temporal Drift', desc: 'Production data reflects recent trends not in labelling set' },
          ].map(h => (
            <div key={h.id} className="bg-white/10 rounded-xl px-3 py-2">
              <span className="text-xs font-bold text-slate-300">{h.id} {h.label}</span>
              <p className="text-[10px] text-slate-400 mt-0.5">{h.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-slate-200 p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              activeTab === t.key ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'catalog' && data?.catalog && <CatalogSection data={data.catalog} />}
      {activeTab === 'obd'     && data?.obd     && <OBDSection     data={data.obd} />}
      {activeTab === 'cx'      && data?.cx      && <CXSection      data={data.cx} />}
    </div>
  );
}
