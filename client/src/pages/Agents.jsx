import { useState, useEffect } from 'react';
import { api } from '../api/client';
import PageHeader from '../components/PageHeader';
import AgentCard from '../components/AgentCard';
import Comments from '../components/Comments';

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAgents().then(setAgents).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400 py-20 text-center">Loading...</div>;

  const textAgents = agents.filter(a => !a.inputType.toLowerCase().includes('image'));
  const visionAgents = agents.filter(a => a.inputType.toLowerCase().includes('image'));

  return (
    <div>
      <PageHeader title="Agents" subtitle={`${agents.length} production GenAI agents in the FRM pipeline`} />

      {visionAgents.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Vision Agents ({visionAgents.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {visionAgents.map(a => <AgentCard key={a.id} agent={a} />)}
          </div>
        </>
      )}

      {textAgents.length > 0 && (
        <>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Text Agents ({textAgents.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {textAgents.map(a => <AgentCard key={a.id} agent={a} />)}
          </div>
        </>
      )}

      <Comments pageId="agents" />
    </div>
  );
}
