import { Routes, Route } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Agents from './pages/Agents';
import AgentDetail from './pages/AgentDetail';
import Verticals from './pages/Verticals';
import Cohorts from './pages/Cohorts';
import Marketplace from './pages/Marketplace';
import GroundTruth from './pages/GroundTruth';
import Simulation from './pages/Simulation';
import PromptsHub from './pages/PromptsHub';
import CohortPromptMapping from './pages/CohortPromptMapping';
import LabellingExplorer from './pages/LabellingExplorer';
import PromptPlayground from './pages/PromptPlayground';
import ProjectMaglev from './pages/ProjectMaglev';
import HPCAutomation from './pages/HPCAutomation';
import DesignCurrentArchitecture from './pages/DesignCurrentArchitecture';
import DesignProposedArchitecture from './pages/DesignProposedArchitecture';
import DesignUseCases from './pages/DesignUseCases';
import DesignGoldenDataset from './pages/DesignGoldenDataset';
import TestSariMisshipment from './pages/TestSariMisshipment';
import TestH2CohortSensitivity from './pages/TestH2CohortSensitivity';
import TestH3NonDeterminism from './pages/TestH3NonDeterminism';
import TestH6ModelComparison from './pages/TestH6ModelComparison';
import TestLearnings from './pages/TestLearnings';
import TestH4DataDrift from './pages/TestH4DataDrift';
import TestH1GroundTruthSanity from './pages/TestH1GroundTruthSanity';
import TestTokenAnalysis from './pages/TestTokenAnalysis';

export default function App() {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 ml-60 p-8">
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:id" element={<AgentDetail />} />
          <Route path="/verticals" element={<Verticals />} />
          <Route path="/cohorts" element={<Cohorts />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/ground-truth" element={<GroundTruth />} />
          <Route path="/simulation" element={<Simulation />} />
          <Route path="/prompts-hub" element={<PromptsHub />} />
          <Route path="/cohort-mapping" element={<CohortPromptMapping />} />
          <Route path="/labelling-explorer" element={<LabellingExplorer />} />
          <Route path="/prompt-playground" element={<PromptPlayground />} />
          <Route path="/project-maglev" element={<ProjectMaglev />} />
          <Route path="/hpc-automation" element={<HPCAutomation />} />
          <Route path="/design/current" element={<DesignCurrentArchitecture />} />
          <Route path="/design/proposed" element={<DesignProposedArchitecture />} />
          <Route path="/design/use-cases" element={<DesignUseCases />} />
          <Route path="/design/golden-set" element={<DesignGoldenDataset />} />
          <Route path="/test/h1-ground-truth-sanity" element={<TestH1GroundTruthSanity />} />
          <Route path="/test/sari-misshipment" element={<TestSariMisshipment />} />
          <Route path="/test/h2-cohort-sensitivity" element={<TestH2CohortSensitivity />} />
          <Route path="/test/h3-nondeterminism" element={<TestH3NonDeterminism />} />
          <Route path="/test/h6-model-comparison" element={<TestH6ModelComparison />} />
          <Route path="/test/h4-data-drift" element={<TestH4DataDrift />} />
          <Route path="/test/learnings" element={<TestLearnings />} />
          <Route path="/test/token-analysis" element={<TestTokenAnalysis />} />
        </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}
