import { Link } from 'react-router-dom';

const typeColors = {
  text: 'bg-blue-100 text-blue-700',
  'text + images': 'bg-purple-100 text-purple-700',
  'text (json object)': 'bg-blue-100 text-blue-700',
  'text (structured risk signals - numeric + categorical)': 'bg-orange-100 text-orange-700',
  'text (json - aggregated outputs from all other agents + order metadata)': 'bg-red-100 text-red-700',
};

function getTypeColor(inputType) {
  const key = (inputType || '').toLowerCase();
  for (const [pattern, cls] of Object.entries(typeColors)) {
    if (key.includes(pattern)) return cls;
  }
  return 'bg-gray-100 text-gray-700';
}

export default function AgentCard({ agent }) {
  const shortDesc = agent.functionality.length > 150
    ? agent.functionality.slice(0, 150) + '...'
    : agent.functionality;

  return (
    <Link
      to={`/agents/${agent.id}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 text-sm">{agent.name}</h3>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${getTypeColor(agent.inputType)}`}>
          {agent.inputType.includes('Image') ? 'Vision' : 'Text'}
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{shortDesc}</p>
      <div className="flex flex-wrap gap-1 mt-3">
        {agent.decisionOutputClasses.slice(0, 4).map(cls => (
          <span key={cls} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
            {cls}
          </span>
        ))}
        {agent.decisionOutputClasses.length > 4 && (
          <span className="text-[10px] text-gray-400">+{agent.decisionOutputClasses.length - 4}</span>
        )}
      </div>
    </Link>
  );
}
