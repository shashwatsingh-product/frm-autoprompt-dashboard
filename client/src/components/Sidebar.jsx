import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';

const sections = [
  {
    title: 'Labelling Data',
    links: [
      { to: '/', label: 'Dashboard', icon: '□' },
      { to: '/verticals', label: 'Verticals', icon: '▥' },
      { to: '/cohorts', label: 'Cohorts', icon: '▦' },
      { to: '/marketplace', label: 'Marketplace', icon: '◐' },
      { to: '/ground-truth', label: 'Ground Truth', icon: '◇' },
      { to: '/labelling-explorer', label: 'Labelling Explorer', icon: '◫' },
    ],
  },
  {
    title: 'FRM Summarisation',
    links: [
      { to: '/agents', label: 'Agents', icon: '◈' },
      { to: '/simulation', label: 'Simulation Results', icon: '◉' },
      { to: '/prompts-hub', label: 'Prompts Hub', icon: '▣' },
      { to: '/cohort-mapping', label: 'Cohort x Prompt Map', icon: '▤' },
      { to: '/prompt-playground', label: 'Prompt Playground', icon: '◎' },
    ],
  },
  {
    title: 'Projects',
    links: [
      { to: '/project-maglev', label: 'Project Maglev', icon: '⚡' },
      { to: '/hpc-automation', label: 'HPC Automation', icon: '◈' },
    ],
  },
  {
    title: 'Design',
    links: [
      { to: '/design/current', label: 'Current Architecture', icon: '▧' },
      { to: '/design/proposed', label: 'Proposed Architecture', icon: '▨' },
      { to: '/design/use-cases', label: 'Use Cases', icon: '◆' },
      { to: '/design/golden-set', label: 'Golden Dataset', icon: '◈' },
    ],
  },
  {
    title: 'Test',
    links: [
      { to: '/test/h1-ground-truth-sanity', label: 'Hypothesis #1', icon: '◇' },
      { to: '/test/sari-misshipment', label: 'Sari Misshipment', icon: '◇' },
      { to: '/test/h2-cohort-sensitivity', label: 'Hypothesis #2', icon: '◉' },
      { to: '/test/h3-nondeterminism', label: 'Hypothesis #3', icon: '◎' },
      { to: '/test/h4-data-drift', label: 'Hypothesis #4', icon: '◭' },
      { to: '/test/h6-model-comparison', label: 'Hypothesis #6', icon: '◈' },
      { to: '/test/token-analysis', label: 'Token Analysis', icon: '◫' },
      { to: '/test/learnings', label: 'Learnings', icon: '◆' },
    ],
  },
];

function SectionGroup({ section, isOpen, onToggle }) {
  const location = useLocation();
  const isActive = section.links.some(l =>
    l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to)
  );

  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider rounded-md transition-colors ${
          isActive ? 'text-blue-300' : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {section.title}
        <span className={`transition-transform text-[10px] ${isOpen ? 'rotate-0' : '-rotate-90'}`}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="mt-1 space-y-0.5 ml-1">
          {section.links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span className="text-base">{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [openSections, setOpenSections] = useState({ 0: true, 1: true, 2: true, 3: true, 4: true });

  function toggle(idx) {
    setOpenSections(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <aside className="w-60 bg-slate-900 text-white h-screen flex flex-col fixed left-0 top-0 overflow-hidden">
      <div className="px-5 py-6 border-b border-slate-700">
        <h1 className="text-lg font-bold tracking-tight">FRM AutoPrompt</h1>
        <p className="text-xs text-slate-400 mt-1">Return Adjudication Dashboard</p>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {sections.map((section, i) => (
          <SectionGroup
            key={i}
            section={section}
            isOpen={openSections[i]}
            onToggle={() => toggle(i)}
          />
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-slate-700 text-xs text-slate-500">
        v1.0 — Local Data Mode
      </div>
    </aside>
  );
}
