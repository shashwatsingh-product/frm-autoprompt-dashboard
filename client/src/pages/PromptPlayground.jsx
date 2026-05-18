import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

function MetricCard({ label, value, sub, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    rose: 'bg-rose-50 border-rose-200 text-rose-700',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[color]}`}>
      <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

function getApprovalPrecision(metrics) {
  if (!metrics?.per_class) return null;
  const pc = metrics.per_class;
  if (pc['Approve']) return pc['Approve'].precision;
  if (pc['No Issue']) return pc['No Issue'].precision;
  return null;
}

function MetricsRow({ title, metrics, color }) {
  if (!metrics) return null;
  const ap = getApprovalPrecision(metrics);
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-600 mb-2">{title}</h4>
      <div className="grid grid-cols-5 gap-3">
        <MetricCard label="Accuracy" value={`${(metrics.accuracy * 100).toFixed(1)}%`}
          sub={`${metrics.correct}/${metrics.total}`} color={color} />
        <MetricCard label="Macro Precision" value={`${(metrics.macro_precision * 100).toFixed(1)}%`}
          color={color} />
        <MetricCard label="Macro Recall" value={`${(metrics.macro_recall * 100).toFixed(1)}%`}
          color={color} />
        <MetricCard label="Macro F1" value={`${(metrics.macro_f1 * 100).toFixed(1)}%`}
          color={color} />
        <MetricCard label="Approval Prec." value={ap != null ? `${(ap * 100).toFixed(1)}%` : 'N/A'}
          color={color} />
      </div>
    </div>
  );
}

function PerClassTable({ title, metrics, color }) {
  if (!metrics || !metrics.per_class) return null;
  const classes = Object.entries(metrics.per_class);
  if (!classes.length) return null;

  const borderColor = {
    blue: 'border-blue-200', emerald: 'border-emerald-200',
    amber: 'border-amber-200', rose: 'border-rose-200',
  }[color] || 'border-gray-200';

  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-gray-600 mb-2">{title}</h4>
      <table className={`w-full text-sm border ${borderColor} rounded-lg overflow-hidden`}>
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Class</th>
            <th className="text-right px-3 py-2 font-medium">Precision</th>
            <th className="text-right px-3 py-2 font-medium">Recall</th>
            <th className="text-right px-3 py-2 font-medium">F1</th>
            <th className="text-right px-3 py-2 font-medium">Support</th>
          </tr>
        </thead>
        <tbody>
          {classes.map(([cls, m]) => (
            <tr key={cls} className="border-t border-gray-100">
              <td className="px-3 py-2 font-medium">{cls}</td>
              <td className="text-right px-3 py-2">{(m.precision * 100).toFixed(1)}%</td>
              <td className="text-right px-3 py-2">{(m.recall * 100).toFixed(1)}%</td>
              <td className="text-right px-3 py-2">{(m.f1 * 100).toFixed(1)}%</td>
              <td className="text-right px-3 py-2">{m.support}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonBar({ label, values }) {
  const max = Math.max(...values.map(v => v.value), 0.01);
  const colors = ['bg-blue-400', 'bg-emerald-400', 'bg-amber-500'];
  return (
    <div className="mb-3">
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <div className="w-28 text-xs text-gray-500 truncate">{v.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div className={`h-full rounded-full ${colors[i]} transition-all`}
              style={{ width: `${(v.value / max) * 100}%` }} />
          </div>
          <div className="w-14 text-xs text-right font-mono">{(v.value * 100).toFixed(1)}%</div>
        </div>
      ))}
    </div>
  );
}

function DetailTable({ details }) {
  if (!details || !details.length) return null;
  return (
    <div className="mt-6">
      <h4 className="text-sm font-semibold text-gray-600 mb-2">Per-Record Results (sample)</h4>
      <div className="overflow-x-auto max-h-80 overflow-y-auto border rounded-lg">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Human Label</th>
              <th className="px-3 py-2 text-left">Original (Labelling)</th>
              <th className="px-3 py-2 text-left">Production Sim</th>
              <th className="px-3 py-2 text-left">New Prompt</th>
              <th className="px-3 py-2 text-center">Match?</th>
            </tr>
          </thead>
          <tbody>
            {details.map(d => (
              <tr key={d.id} className={`border-t ${d.new_correct ? '' : 'bg-rose-50'}`}>
                <td className="px-3 py-1.5 font-mono">{d.id}</td>
                <td className="px-3 py-1.5 font-medium">{d.human_label}</td>
                <td className={`px-3 py-1.5 ${d.original_predicted === d.human_label ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {d.original_predicted}
                </td>
                <td className={`px-3 py-1.5 ${d.simulated_predicted === d.human_label ? 'text-emerald-600' : d.simulated_predicted ? 'text-rose-600' : 'text-gray-300'}`}>
                  {d.simulated_predicted || '—'}
                </td>
                <td className={`px-3 py-1.5 font-medium ${d.new_correct ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {d.new_predicted}
                </td>
                <td className="px-3 py-1.5 text-center">{d.new_correct ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimulationStatusBanner({ status }) {
  if (!status || !status.ok) return null;
  const pct = status.total > 0 ? ((status.ok / 119895) * 100).toFixed(1) : 0;
  return (
    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-blue-700">Background HPC Simulation</span>
          <span className="text-xs text-blue-500 ml-2">
            {status.ok.toLocaleString()} / 119,895 completed ({pct}%)
          </span>
        </div>
        <div className="text-sm text-blue-600 font-mono">
          Accuracy: {(status.accuracy * 100).toFixed(1)}%
        </div>
      </div>
      {status.by_agent && status.by_agent.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3">
          {status.by_agent.map(a => (
            <span key={a.agent} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              {a.agent.replace('_agent', '')}: {a.ok} ({(a.accuracy * 100).toFixed(0)}%)
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PromptPlayground() {
  const [options, setOptions] = useState({ agents: [], verticals: [], returnReasons: [], marketplaces: [] });
  const [agent, setAgent] = useState('');
  const [vertical, setVertical] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [promptText, setPromptText] = useState('');
  const [sampleSize, setSampleSize] = useState(50);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [simStatus, setSimStatus] = useState(null);

  useEffect(() => {
    api.getPlaygroundOptions().then(setOptions).catch(() => {});
    api.getSimulationStatus().then(setSimStatus).catch(() => {});
  }, []);

  const runSimulation = useCallback(async () => {
    if (!promptText.trim()) {
      setError('Please enter a prompt');
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.runPlaygroundSimulation({
        agent: agent || undefined,
        vertical: vertical || undefined,
        returnReason: returnReason || undefined,
        marketplace: marketplace || undefined,
        promptText,
        sampleSize,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }, [agent, vertical, returnReason, marketplace, promptText, sampleSize]);

  const loadProductionPrompt = useCallback(async () => {
    if (!agent) return;
    try {
      const prompts = await api.getPrompts();
      const match = (prompts.prompts || prompts || []).find(p =>
        p.agent === agent || p.name?.toLowerCase().includes(agent.replace('_agent', ''))
      );
      if (match && match.promptText) {
        setPromptText(match.promptText);
      }
    } catch {}
  }, [agent]);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Prompt Playground</h1>
        <p className="text-sm text-gray-500 mt-1">
          Test custom prompts against ground truth labels. Select cohort filters, paste your prompt, and compare performance.
        </p>
      </div>

      <SimulationStatusBanner status={simStatus} />

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Filters + Prompt */}
        <div className="col-span-2 space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Cohort Filters</h3>
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Agent</label>
                <select value={agent} onChange={e => setAgent(e.target.value)}
                  className="w-full text-sm border rounded-md px-2 py-1.5 bg-white">
                  <option value="">All Agents</option>
                  {options.agents.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Vertical</label>
                <select value={vertical} onChange={e => setVertical(e.target.value)}
                  className="w-full text-sm border rounded-md px-2 py-1.5 bg-white">
                  <option value="">All Verticals</option>
                  {options.verticals.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Return Reason</label>
                <select value={returnReason} onChange={e => setReturnReason(e.target.value)}
                  className="w-full text-sm border rounded-md px-2 py-1.5 bg-white">
                  <option value="">All Reasons</option>
                  {options.returnReasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Marketplace</label>
                <select value={marketplace} onChange={e => setMarketplace(e.target.value)}
                  className="w-full text-sm border rounded-md px-2 py-1.5 bg-white">
                  <option value="">All Marketplaces</option>
                  {options.marketplaces.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Prompt Editor */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Custom Prompt</h3>
              <div className="flex gap-2">
                {agent && (
                  <button onClick={loadProductionPrompt}
                    className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600 transition-colors">
                    Load Production Prompt
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              placeholder="Paste your prompt here. Input data will be auto-injected based on the agent type.&#10;&#10;For decision agents: append ## INPUT or Input Data: marker&#10;For intent resonance: input is appended after # NOW AUDIT&#10;For risk signals: replace # INPUT marker&#10;For image agents: images are passed as multimodal content"
              className="w-full h-64 text-sm border rounded-md px-3 py-2 font-mono resize-y focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
            />
            <div className="text-xs text-gray-400 mt-1">{promptText.length.toLocaleString()} characters</div>
          </div>
        </div>

        {/* Right: Controls + Quick Stats */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Run Configuration</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Sample Size</label>
                <div className="flex gap-2">
                  {[25, 50, 100, 200].map(n => (
                    <button key={n} onClick={() => setSampleSize(n)}
                      className={`flex-1 text-xs py-1.5 rounded-md border transition-colors ${
                        sampleSize === n
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-600 hover:bg-gray-50'
                      }`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={runSimulation}
                disabled={running || !promptText.trim()}
                className={`w-full py-3 rounded-lg font-semibold text-sm transition-colors ${
                  running
                    ? 'bg-gray-300 text-gray-500 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}>
                {running ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Running Simulation...
                  </span>
                ) : `Run on ${sampleSize} Records`}
              </button>
              <p className="text-xs text-gray-400">
                Estimated time: ~{Math.ceil(sampleSize / 3)}s at 3 req/s
              </p>
            </div>
          </div>

          {result && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Quick Comparison</h3>
              <ComparisonBar label="Accuracy" values={[
                { label: 'Labelling', value: result.labelling_metrics.accuracy },
                ...(result.current_production_metrics
                  ? [{ label: 'Production Sim', value: result.current_production_metrics.accuracy }]
                  : []),
                { label: 'New Prompt', value: result.new_prompt_metrics.accuracy },
              ]} />
              <ComparisonBar label="Macro F1" values={[
                { label: 'Labelling', value: result.labelling_metrics.macro_f1 },
                ...(result.current_production_metrics
                  ? [{ label: 'Production Sim', value: result.current_production_metrics.macro_f1 }]
                  : []),
                { label: 'New Prompt', value: result.new_prompt_metrics.macro_f1 },
              ]} />
              <ComparisonBar label="Approval Precision" values={[
                { label: 'Labelling', value: getApprovalPrecision(result.labelling_metrics) || 0 },
                ...(result.current_production_metrics
                  ? [{ label: 'Production Sim', value: getApprovalPrecision(result.current_production_metrics) || 0 }]
                  : []),
                { label: 'New Prompt', value: getApprovalPrecision(result.new_prompt_metrics) || 0 },
              ]} />
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="mt-6 space-y-4">
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Results — {result.sample_size} records sampled
            </h3>

            <MetricsRow title="Labelling Prompt (Original AI predictions at labelling time)"
              metrics={result.labelling_metrics} color="blue" />

            {result.current_production_metrics && (
              <MetricsRow title="Current Production Prompt (Simulated with live prompt)"
                metrics={result.current_production_metrics} color="emerald" />
            )}

            <MetricsRow title="New Prompt (Your custom prompt)"
              metrics={result.new_prompt_metrics} color="amber" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border p-4">
              <PerClassTable title="Labelling Prompt — Per Class"
                metrics={result.labelling_metrics} color="blue" />
            </div>
            <div className="bg-white rounded-lg border p-4">
              <PerClassTable title="New Prompt — Per Class"
                metrics={result.new_prompt_metrics} color="amber" />
            </div>
          </div>

          <div className="bg-white rounded-lg border p-4">
            <DetailTable details={result.details} />
          </div>
        </div>
      )}
    </div>
  );
}
