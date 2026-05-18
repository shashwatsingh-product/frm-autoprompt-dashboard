import { useState, useEffect } from 'react';
import { api } from '../api/client';

function timeAgo(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function Comments({ pageId }) {
  const [comments, setComments] = useState([]);
  const [author, setAuthor] = useState('');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getComments(pageId).then(setComments).catch(() => {});
  }, [pageId]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      const comment = await api.addComment(pageId, { author: author.trim() || 'Anonymous', text: text.trim() });
      setComments(prev => [...prev, comment]);
      setText('');
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  }

  async function handleDelete(commentId) {
    try {
      await api.deleteComment(pageId, commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="mt-10 border-t border-gray-200 pt-8">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        Comments ({comments.length})
      </h3>

      {comments.length > 0 && (
        <div className="space-y-3 mb-6">
          {comments.map(c => (
            <div key={c.id} className="bg-white rounded-lg border border-gray-200 p-4 group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {c.author.charAt(0).toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-gray-800">{c.author}</span>
                  <span className="text-xs text-gray-400">{timeAgo(c.timestamp)}</span>
                </div>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-xs text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  delete
                </button>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{c.text}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg border border-gray-200 p-4">
        <div className="flex gap-3 mb-3">
          <input
            type="text"
            placeholder="Your name"
            value={author}
            onChange={e => setAuthor(e.target.value)}
            className="w-40 px-3 py-1.5 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <textarea
          placeholder="Add a comment..."
          value={text}
          onChange={e => setText(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
        />
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={!text.trim() || submitting}
            className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Posting...' : 'Post Comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
