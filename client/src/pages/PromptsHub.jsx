import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import Comments from '../components/Comments';

function PromptCard({ prompt, onToggleStatus, onSelect }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{prompt.name}</h3>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleStatus(prompt.id, !prompt.isLive); }}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                prompt.isLive
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {prompt.isLive ? 'LIVE' : 'NOT LIVE'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-2">{prompt.agent}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{prompt.description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
        {prompt.version && (
          <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            v{prompt.version}
          </span>
        )}
        {prompt.author && (
          <span className="bg-gray-50 text-gray-600 px-2 py-0.5 rounded-full">
            {prompt.author}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Input Classes</p>
          <p className="text-xs text-gray-600 mt-0.5">{prompt.inputClasses}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Output Classes</p>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {prompt.outputClasses.split('|').map(cls => (
              <span key={cls.trim()} className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                {cls.trim()}
              </span>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={() => onSelect(prompt.id)}
        className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        View Full Prompt &rarr;
      </button>
    </div>
  );
}

function PromptDetail({ promptId, onBack }) {
  const [prompt, setPrompt] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPrompt(promptId).then(setPrompt).finally(() => setLoading(false));
  }, [promptId]);

  if (loading) return <div className="text-gray-400 py-10 text-center">Loading...</div>;
  if (!prompt) return <div className="text-red-500 py-10 text-center">Prompt not found</div>;

  return (
    <div>
      <button onClick={onBack} className="text-blue-600 text-sm hover:underline mb-4 inline-block">
        &larr; All Prompts
      </button>
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-lg font-bold text-gray-900">{prompt.name}</h3>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            prompt.isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {prompt.isLive ? 'LIVE IN PRODUCTION' : 'NOT LIVE'}
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase">Agent</p>
            <p className="text-sm text-gray-700 mt-0.5">{prompt.agent}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase">Version</p>
            <p className="text-sm text-gray-700 mt-0.5">{prompt.version || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase">Author</p>
            <p className="text-sm text-gray-700 mt-0.5">{prompt.author || '-'}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase">Status</p>
            <p className="text-sm text-gray-700 mt-0.5">{prompt.isLive ? 'Live' : 'Inactive'}</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Input Classes</p>
          <p className="text-sm text-gray-700">{prompt.inputClasses}</p>
        </div>

        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Output Classes</p>
          <div className="flex flex-wrap gap-1.5">
            {prompt.outputClasses.split('|').map(cls => (
              <span key={cls.trim()} className="text-xs bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium">
                {cls.trim()}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Prompt Text</p>
          <pre className="text-xs bg-gray-50 border border-gray-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap text-gray-700 max-h-[600px] overflow-y-auto leading-relaxed">
            {prompt.promptText}
          </pre>
        </div>
      </div>

      <Comments pageId={`prompt-${promptId}`} />
    </div>
  );
}

export default function PromptsHub() {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [filterAgent, setFilterAgent] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    api.getPrompts().then(setPrompts).finally(() => setLoading(false));
  }, []);

  async function handleToggleStatus(id, isLive) {
    await api.updatePromptStatus(id, isLive);
    setPrompts(prev => prev.map(p => p.id === id ? { ...p, isLive } : p));
  }

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;

  if (selectedPrompt) {
    return <PromptDetail promptId={selectedPrompt} onBack={() => setSelectedPrompt(null)} />;
  }

  const agents = [...new Set(prompts.map(p => p.agent))].sort();
  let filtered = prompts;
  if (filterAgent) filtered = filtered.filter(p => p.agent === filterAgent);
  if (filterStatus === 'live') filtered = filtered.filter(p => p.isLive);
  if (filterStatus === 'notlive') filtered = filtered.filter(p => !p.isLive);

  const liveCount = prompts.filter(p => p.isLive).length;

  return (
    <div>
      <PageHeader
        title="Prompts Hub"
        subtitle="Manage prompts, input/output classes, and production status across all agents"
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Total Prompts</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{prompts.length}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <p className="text-xs text-emerald-600 font-semibold uppercase">Live in Production</p>
          <p className="text-2xl font-bold text-emerald-900 mt-1">{liveCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 font-semibold uppercase">Agents Covered</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{agents.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={filterAgent}
          onChange={e => setFilterAgent(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Agents</option>
          {agents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Status</option>
          <option value="live">Live in Production</option>
          <option value="notlive">Not Live</option>
        </select>

        {(filterAgent || filterStatus) && (
          <button
            onClick={() => { setFilterAgent(''); setFilterStatus(''); }}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            Clear
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {filtered.map(p => (
          <PromptCard
            key={p.id}
            prompt={p}
            onToggleStatus={handleToggleStatus}
            onSelect={setSelectedPrompt}
          />
        ))}
      </div>

      <Comments pageId="prompts-hub" />
    </div>
  );
}
