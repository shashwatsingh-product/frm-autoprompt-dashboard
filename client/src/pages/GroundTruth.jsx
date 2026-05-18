import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import Comments from '../components/Comments';

export default function GroundTruth() {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  useEffect(() => {
    api.getNote('ground-truth').then(data => {
      setContent(data.content);
      setSaved(data.content);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveNote('ground-truth', content);
      setSaved(content);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
    }
    setSaving(false);
  }, [content]);

  const hasChanges = content !== saved;

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;

  return (
    <div>
      <PageHeader
        title="Ground Truth Understanding"
        subtitle="Document understanding and observations about the labelled ground truth dataset"
      />

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">Notes</h3>
          <div className="flex items-center gap-3">
            {saveStatus === 'saved' && (
              <span className="text-xs text-emerald-600 font-medium">Saved</span>
            )}
            {saveStatus === 'error' && (
              <span className="text-xs text-red-600 font-medium">Failed to save</span>
            )}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          className="w-full min-h-[300px] px-4 py-3 border border-gray-200 rounded-lg text-sm text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          placeholder="Write your understanding of the ground truth data here..."
        />
        {hasChanges && (
          <p className="text-xs text-amber-600 mt-2">You have unsaved changes</p>
        )}
      </div>

      <Comments pageId="ground-truth" />
    </div>
  );
}
