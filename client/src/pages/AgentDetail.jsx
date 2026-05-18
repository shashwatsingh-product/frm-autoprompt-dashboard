import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import Comments from '../components/Comments';

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</h3>
      {children}
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAgent(id).then(setAgent).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;
  if (!agent) return <div className="text-red-500 py-20 text-center">Agent not found</div>;

  return (
    <div>
      <Link to="/agents" className="text-blue-600 text-sm hover:underline mb-4 inline-block">&larr; All Agents</Link>
      <PageHeader title={agent.name} subtitle={agent.useCase} />

      <div className="flex flex-wrap gap-2 mb-6">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
          agent.inputType.toLowerCase().includes('image')
            ? 'bg-purple-100 text-purple-700'
            : 'bg-blue-100 text-blue-700'
        }`}>
          {agent.inputType.includes('Image') ? 'Vision Agent' : 'Text Agent'}
        </span>
        <span className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
          {agent.promptVersions}
        </span>
      </div>

      <Section title="Functionality">
        <p className="text-sm text-gray-700 leading-relaxed">{agent.functionality}</p>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Inputs">
          <p className="text-sm text-gray-700 leading-relaxed">{agent.inputs}</p>
          <p className="text-xs text-gray-400 mt-2">Type: {agent.inputType}</p>
        </Section>

        <Section title="Decision Output">
          <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto text-gray-700 whitespace-pre-wrap">
            {agent.decisionOutput}
          </pre>
          <p className="text-xs text-gray-400 mt-2">Type: {agent.decisionOutputType}</p>
        </Section>
      </div>

      <Section title="Prompt Description">
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{agent.promptDescription}</p>
      </Section>

      <Section title="Evaluation Classes">
        <div className="flex flex-wrap gap-2">
          {agent.evaluationClasses.map(cls => (
            <span key={cls} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-medium">
              {cls}
            </span>
          ))}
        </div>
      </Section>

      <Section title="Decision Output Classes">
        <div className="flex flex-wrap gap-2">
          {agent.decisionOutputClasses.map(cls => (
            <span key={cls} className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
              {cls}
            </span>
          ))}
        </div>
      </Section>

      <Comments pageId={`agent-${id}`} />
    </div>
  );
}
