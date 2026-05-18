import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';

const TARGET_DATE = new Date('2026-06-15T00:00:00+05:30');
const NOTES_KEY = 'maglev-actions';

function getTimeLeft() {
  const now = new Date();
  const diff = TARGET_DATE - now;
  if (diff <= 0) return { weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
  const seconds = Math.floor(diff / 1000) % 60;
  const minutes = Math.floor(diff / 60000) % 60;
  const hours = Math.floor(diff / 3600000) % 24;
  const totalDays = Math.floor(diff / 86400000);
  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return { weeks, days, hours, minutes, seconds, total: diff };
}

function CountdownBanner() {
  const [time, setTime] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalDays = Math.floor(time.total / 86400000);
  const urgency = totalDays > 30 ? 'emerald' : totalDays > 14 ? 'amber' : 'rose';
  const colors = {
    emerald: 'from-emerald-600 to-emerald-800 border-emerald-400',
    amber: 'from-amber-600 to-amber-800 border-amber-400',
    rose: 'from-rose-600 to-rose-800 border-rose-400',
  };

  const units = [
    { label: 'Weeks', value: time.weeks },
    { label: 'Days', value: time.days },
    { label: 'Hours', value: time.hours },
    { label: 'Minutes', value: time.minutes },
    { label: 'Seconds', value: time.seconds },
  ];

  return (
    <div className={`bg-gradient-to-r ${colors[urgency]} rounded-2xl border p-6 mb-8 text-white`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold">Gemini 2.5 Flash Deprecation Countdown</h2>
          <p className="text-sm opacity-80 mt-0.5">Target: June 15, 2026 (deprecation: June 17)</p>
        </div>
        {time.total <= 0 && (
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">DEADLINE PASSED</span>
        )}
      </div>
      <div className="flex gap-4">
        {units.map(({ label, value }) => (
          <div key={label} className="bg-white/15 rounded-xl px-5 py-3 text-center min-w-[80px]">
            <div className="text-3xl font-mono font-bold tabular-nums">{String(value).padStart(2, '0')}</div>
            <div className="text-[10px] uppercase tracking-wider opacity-70 mt-1">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PRIORITIES = [
  { value: 'P0', label: 'P0', bg: 'bg-rose-100 text-rose-700 border-rose-300' },
  { value: 'P1', label: 'P1', bg: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'P2', label: 'P2', bg: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'P3', label: 'P3', bg: 'bg-sky-100 text-sky-700 border-sky-300' },
];

const STATUS_OPTIONS = [
  { value: 'todo', label: 'To Do' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];

function PriorityBadge({ priority }) {
  const cfg = PRIORITIES.find(p => p.value === priority) || PRIORITIES[2];
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cfg.bg}`}>{cfg.label}</span>;
}

function fmtDateTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function InlineAddForm({ onAdd, placeholder, compact }) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [priority, setPriority] = useState('P2');

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const now = new Date().toISOString();
    onAdd({
      id: Date.now(),
      title: title.trim(),
      owner: owner.trim(),
      priority,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
      children: [],
    });
    setTitle('');
    setOwner('');
    setPriority('P2');
  }

  return (
    <form onSubmit={handleSubmit} className={`flex gap-2 items-end ${compact ? 'mt-2' : 'bg-white rounded-xl border border-gray-200 p-4 mb-6'}`}>
      <div className="flex-1">
        {!compact && <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Action Item</label>}
        <input value={title} onChange={e => setTitle(e.target.value)}
          placeholder={placeholder || 'What needs to be done?'}
          className={`w-full ${compact ? '' : 'mt-1'} px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
      </div>
      <div className={compact ? 'w-28' : 'w-36'}>
        {!compact && <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Owner</label>}
        <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Owner"
          className={`w-full ${compact ? '' : 'mt-1'} px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`} />
      </div>
      <div className={compact ? 'w-20' : 'w-24'}>
        {!compact && <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Priority</label>}
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className={`w-full ${compact ? '' : 'mt-1'} px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}>
          {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <button type="submit"
        className={`px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap ${compact ? 'text-xs' : ''}`}>
        + Add
      </button>
    </form>
  );
}

function EditableCell({ value, onSave, type, className }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function commit() {
    setEditing(false);
    if (draft !== value) onSave(draft);
  }

  if (!editing) {
    return (
      <span className={`cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded ${className || ''}`}
        onDoubleClick={() => { setDraft(value); setEditing(true); }}>
        {value || '-'}
      </span>
    );
  }

  if (type === 'select-priority') {
    return (
      <select autoFocus value={draft} onChange={e => { setDraft(e.target.value); }}
        onBlur={commit}
        className="text-xs px-1 py-0.5 rounded border border-blue-300 bg-white focus:outline-none">
        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
    );
  }

  return (
    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="w-full px-1 py-0.5 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
  );
}

function CommentSection({ comments, onAdd }) {
  const [text, setText] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd({ id: Date.now(), text: text.trim(), createdAt: new Date().toISOString() });
    setText('');
  }

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
      {comments.length > 0 ? (
        <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
          {comments.map(c => (
            <div key={c.id} className="bg-white rounded-md border border-gray-150 px-3 py-2">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{c.text}</p>
              <p className="text-[9px] text-gray-400 mt-1">{fmtDateTime(c.createdAt)}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 mb-2">No comments yet</p>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap">
          Post
        </button>
      </form>
    </div>
  );
}

function ActionItemRow({ item, index, depth, onUpdate, onDelete, onAddChild }) {
  const [expanded, setExpanded] = useState(true);
  const [showAddChild, setShowAddChild] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isDone = item.status === 'done';
  const commentCount = (item.comments || []).length;

  function handleFieldChange(field, value) {
    onUpdate(item.id, { [field]: value, updatedAt: new Date().toISOString() });
  }

  function handleAddComment(comment) {
    const updated = [...(item.comments || []), comment];
    onUpdate(item.id, { comments: updated, updatedAt: new Date().toISOString() });
  }

  const childDone = hasChildren ? item.children.filter(c => c.status === 'done').length : 0;

  return (
    <>
      <tr className={`hover:bg-gray-50 transition-colors ${isDone ? 'opacity-50' : ''} ${depth > 0 ? 'bg-slate-50/60' : ''}`}>
        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
          {depth === 0 ? index : ''}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2" style={{ paddingLeft: depth * 24 }}>
            {depth === 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className={`w-5 h-5 flex items-center justify-center rounded text-xs transition-colors ${
                  hasChildren ? 'text-gray-500 hover:bg-gray-200' : 'text-gray-300'
                }`}
              >
                {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u25CB'}
              </button>
            )}
            {depth > 0 && <span className="text-gray-300 text-xs mr-1">{'└'}</span>}
            <EditableCell
              value={item.title}
              onSave={v => handleFieldChange('title', v)}
              className={`font-medium text-gray-800 ${isDone ? 'line-through' : ''}`}
            />
            {hasChildren && (
              <span className="text-[10px] text-gray-400 ml-1">({childDone}/{item.children.length})</span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-xs">
          <EditableCell value={item.owner} onSave={v => handleFieldChange('owner', v)} className="text-gray-600" />
        </td>
        <td className="px-4 py-3 text-center">
          <EditableCell value={item.priority} type="select-priority" onSave={v => handleFieldChange('priority', v)} />
        </td>
        <td className="px-4 py-3 text-center">
          <select value={item.status} onChange={e => handleFieldChange('status', e.target.value)}
            className="text-xs px-2 py-1 rounded border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </td>
        <td className="px-3 py-3 text-center">
          <div className="text-[10px] text-gray-400 leading-tight">
            <div title="Created">{fmtDateTime(item.createdAt)}</div>
            {item.updatedAt !== item.createdAt && (
              <div className="text-blue-400" title="Updated">{fmtDateTime(item.updatedAt)}</div>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-center whitespace-nowrap">
          <button onClick={() => setShowComments(!showComments)}
            className={`text-xs font-medium mr-2 ${showComments ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`} title="Comments">
            {commentCount > 0 ? <span className="inline-flex items-center gap-0.5">{'\uD83D\uDCAC'}<span className="text-[9px] font-bold">{commentCount}</span></span> : '\uD83D\uDCAC'}
          </button>
          {depth === 0 && (
            <button onClick={() => { setExpanded(true); setShowAddChild(!showAddChild); }}
              className="text-blue-400 hover:text-blue-600 text-xs font-medium mr-2" title="Add sub-item">
              +Sub
            </button>
          )}
          <button onClick={() => onDelete(item.id)}
            className="text-red-400 hover:text-red-600 text-xs font-medium">
            Del
          </button>
        </td>
      </tr>
      {showComments && (
        <tr>
          <td></td>
          <td colSpan={6} className="px-4 pb-3 pt-1">
            <div style={{ paddingLeft: depth * 24 + (depth === 0 ? 28 : 16) }}>
              <CommentSection comments={item.comments || []} onAdd={handleAddComment} />
            </div>
          </td>
        </tr>
      )}
      {expanded && hasChildren && item.children.map(child => (
        <ActionItemRow
          key={child.id}
          item={child}
          index=""
          depth={depth + 1}
          onUpdate={(childId, updates) => {
            const newChildren = item.children.map(c => c.id === childId ? { ...c, ...updates } : c);
            onUpdate(item.id, { children: newChildren, updatedAt: new Date().toISOString() });
          }}
          onDelete={(childId) => {
            const newChildren = item.children.filter(c => c.id !== childId);
            onUpdate(item.id, { children: newChildren, updatedAt: new Date().toISOString() });
          }}
          onAddChild={() => {}}
        />
      ))}
      {expanded && showAddChild && (
        <tr>
          <td></td>
          <td colSpan={6} className="px-4 pb-3">
            <div style={{ paddingLeft: 32 }}>
              <InlineAddForm
                compact
                placeholder="Add sub-action item..."
                onAdd={(child) => {
                  onAddChild(item.id, child);
                  setShowAddChild(false);
                }}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ProjectMaglev() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.getNote(NOTES_KEY).then(res => {
      try { setItems(JSON.parse(res.content || '[]')); }
      catch { setItems([]); }
    }).catch(() => setItems([])).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const persist = useCallback((newItems) => {
    setItems(newItems);
    api.saveNote(NOTES_KEY, JSON.stringify(newItems));
  }, []);

  function addItem(item) {
    persist([item, ...items]);
  }

  function updateItem(id, updates) {
    persist(items.map(i => i.id === id ? { ...i, ...updates } : i));
  }

  function deleteItem(id) {
    persist(items.filter(i => i.id !== id));
  }

  function addChildToItem(parentId, child) {
    persist(items.map(i => {
      if (i.id !== parentId) return i;
      return { ...i, children: [...(i.children || []), child], updatedAt: new Date().toISOString() };
    }));
  }

  const allItems = items.flatMap(i => [i, ...(i.children || [])]);
  const stats = {
    total: allItems.length,
    done: allItems.filter(i => i.status === 'done').length,
    inProgress: allItems.filter(i => i.status === 'in-progress').length,
    todo: allItems.filter(i => i.status === 'todo').length,
  };

  return (
    <div>
      <PageHeader title="Project Maglev" subtitle="Gemini 2.5 Flash deprecation migration tracker" />
      <CountdownBanner />

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Items</p>
          <p className="text-2xl font-bold mt-1 text-gray-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">To Do</p>
          <p className="text-2xl font-bold mt-1 text-gray-600">{stats.todo}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">In Progress</p>
          <p className="text-2xl font-bold mt-1 text-blue-600">{stats.inProgress}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Done</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.done}</p>
          {stats.total > 0 && (
            <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
            </div>
          )}
        </div>
      </div>

      <InlineAddForm onAdd={addItem} />

      {loading ? (
        <div className="text-gray-400 py-10 text-center">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-gray-400 py-10 text-center text-sm">No action items yet. Add one above.</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] text-gray-400">
            Double-click any title, owner, or priority to edit inline. Click {'\uD83D\uDCAC'} to view/add comments.
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-10">#</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Action Item</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase w-28">Owner</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-20">Priority</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-32">Status</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-32">Created / Updated</th>
                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-600 uppercase w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <ActionItemRow
                  key={item.id}
                  item={item}
                  index={idx + 1}
                  depth={0}
                  onUpdate={updateItem}
                  onDelete={deleteItem}
                  onAddChild={addChildToItem}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
