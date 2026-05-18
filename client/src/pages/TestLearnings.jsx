import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const HYPOTHESES = [
  {
    id: 'h1',
    title: 'Hypothesis #1',
    subtitle: 'Ground Truth Sanity',
    color: 'blue',
    description: 'Is our human-labelled ground truth reliable? Audit of agent failures, classification inconsistencies, and human workflow flaws that corrupt labels.',
  },
  {
    id: 'h2',
    title: 'Hypothesis #2',
    subtitle: 'Cohort Sensitivity',
    color: 'emerald',
    description: 'Do different verticals show different Prod vs PG divergence? Are some cohorts more sensitive to prompt changes?',
  },
  {
    id: 'h3',
    title: 'Hypothesis #3',
    subtitle: 'Non-Determinism (Same Model)',
    color: 'amber',
    description: 'Same data x same Gemini 2.5 Flash call yields different results across runs?',
  },
  {
    id: 'h4',
    title: 'Hypothesis #4',
    subtitle: 'Human Label Quality',
    color: 'rose',
    description: 'Are human labels consistent and reliable as ground truth?',
  },
  {
    id: 'h5',
    title: 'Hypothesis #5',
    subtitle: 'Image Quality Impact',
    color: 'violet',
    description: 'Does image quality/availability drive prediction errors?',
  },
  {
    id: 'h6',
    title: 'Hypothesis #6',
    subtitle: 'Cross-Model Comparison',
    color: 'teal',
    description: 'Do different Gemini models (2.5 Flash, 3.0 Flash, 3.1 Pro) produce different predictions on the same data?',
  },
];

const COLOR_MAP = {
  blue:    { hero: 'from-blue-600 via-blue-600 to-indigo-600', light: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-800', ring: 'ring-blue-300' },
  emerald: { hero: 'from-emerald-600 via-emerald-600 to-green-600', light: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-800', ring: 'ring-emerald-300' },
  amber:   { hero: 'from-amber-600 via-amber-600 to-orange-600', light: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-800', ring: 'ring-amber-300' },
  rose:    { hero: 'from-rose-600 via-rose-600 to-pink-600', light: 'bg-rose-50 border-rose-200', text: 'text-rose-700', badge: 'bg-rose-100 text-rose-800', ring: 'ring-rose-300' },
  violet:  { hero: 'from-violet-600 via-violet-600 to-purple-600', light: 'bg-violet-50 border-violet-200', text: 'text-violet-700', badge: 'bg-violet-100 text-violet-800', ring: 'ring-violet-300' },
  teal:    { hero: 'from-teal-600 via-teal-600 to-emerald-600', light: 'bg-teal-50 border-teal-200', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-800', ring: 'ring-teal-300' },
};

function HypothesisCard({ hypothesis, content, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const c = COLOR_MAP[hypothesis.color];

  useEffect(() => { setDraft(content); }, [content]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(hypothesis.id, draft);
    setSaving(false);
    setEditing(false);
  };

  return (
    <div className={`rounded-xl border ${c.light} overflow-hidden`}>
      <div className={`bg-gradient-to-r ${c.hero} px-5 py-3 flex items-center justify-between`}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold text-sm">{hypothesis.title}</h3>
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-[10px] text-white font-medium">{hypothesis.subtitle}</span>
          </div>
          <p className="text-white/70 text-xs mt-0.5">{hypothesis.description}</p>
        </div>
        <button
          onClick={() => editing ? handleSave() : setEditing(true)}
          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
            editing
              ? 'bg-white text-slate-800 hover:bg-slate-100'
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
        >
          {saving ? 'Saving...' : editing ? 'Save' : 'Edit'}
        </button>
      </div>

      <div className="p-5">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`Write your learnings for ${hypothesis.title} here...\n\nUse plain text or markdown-style formatting:\n- Key finding 1\n- Key finding 2\n\nConclusion: ...`}
              className={`w-full min-h-[160px] p-3 text-sm border rounded-lg focus:outline-none focus:ring-2 ${c.ring} resize-y font-mono`}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setDraft(content); setEditing(false); }}
                className="px-3 py-1 text-xs text-slate-500 hover:text-slate-700"
              >Cancel</button>
            </div>
          </div>
        ) : content ? (
          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{content}</pre>
        ) : (
          <p className="text-sm text-slate-400 italic">No learnings recorded yet. Click "Edit" to add.</p>
        )}
      </div>
    </div>
  );
}

export default function TestLearnings() {
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const results = {};
    await Promise.all(
      HYPOTHESES.map(async h => {
        try {
          const data = await api.getNote(`learning-${h.id}`);
          results[h.id] = data.content || '';
        } catch { results[h.id] = ''; }
      })
    );
    setNotes(results);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async (id, content) => {
    await api.saveNote(`learning-${id}`, content);
    setNotes(prev => ({ ...prev, [id]: content }));
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-center h-64 text-slate-400">Loading learnings...</div>
      </div>
    );
  }

  const filledCount = Object.values(notes).filter(v => v.trim()).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-br from-slate-800 via-slate-800 to-slate-900 rounded-2xl p-6 text-white">
        <h1 className="text-xl font-bold">Test Learnings</h1>
        <p className="text-slate-300 text-sm mt-1">Document key findings and conclusions from each hypothesis test</p>
        <div className="flex gap-4 mt-4">
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Hypotheses</p>
            <p className="text-lg font-bold">{HYPOTHESES.length}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-[10px] text-slate-400">Documented</p>
            <p className="text-lg font-bold">{filledCount}/{HYPOTHESES.length}</p>
          </div>
        </div>
      </div>

      {/* Hypothesis cards */}
      {HYPOTHESES.map(h => (
        <HypothesisCard
          key={h.id}
          hypothesis={h}
          content={notes[h.id] || ''}
          onSave={handleSave}
        />
      ))}
    </div>
  );
}
