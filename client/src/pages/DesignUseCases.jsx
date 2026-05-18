import { useState } from 'react';
import PageHeader from '../components/PageHeader';

const CATEGORIES = [
  {
    id: 'l1-training',
    title: 'L1 Fast-Path Classifier',
    icon: '1',
    color: 'border-emerald-300 bg-emerald-50',
    badgeColor: 'bg-emerald-100 text-emerald-700',
    description: 'Training data and validation for the L1 fast-path classifier that handles 60-75% of returns without invoking the full agent stack.',
    useCases: [
      {
        title: 'Auto-Approve Training Set',
        description: 'Returns where TNS=APPROVE + final status=completed + process=OTHERS. These are confirmed-correct auto-approvals.',
        dataPoints: '3.01M records (75.5% of all returns)',
        columns: 'return_reason, return_sub_reason, return_amount, marketplace_id, cms_vertical',
        binary: true,
        output: 'Binary: approve / needs_adjudication',
        priority: 'critical',
      },
      {
        title: 'Auto-Reject Training Set',
        description: 'Returns rejected by FRM-INLINE or BULK process. High-confidence rejections suitable for L1 auto-reject.',
        dataPoints: '31K records (0.8%)',
        columns: 'return_reason, return_amount, marketplace_id, process, tns_recommendation',
        binary: true,
        output: 'Binary: reject / needs_adjudication',
        priority: 'critical',
      },
      {
        title: 'L1 Confidence Threshold Simulation',
        description: 'Simulate different L1 confidence thresholds against the data. At what threshold do we achieve ≥99.5% precision on auto-decisions?',
        dataPoints: '3.99M full dataset',
        columns: 'All 13 columns + derived rejection rate per cohort',
        binary: false,
        output: 'Threshold → precision/recall curve per marketplace/BU',
        priority: 'high',
      },
      {
        title: 'Reason-Based Fast-Path Rules',
        description: 'SIZE_FIT_ISSUES (0.5% rejection) and CUSTOMER_REMORSE (4.1% rejection) are strong L1 auto-approve candidates by reason alone.',
        dataPoints: '1.46M SIZE_FIT + REMORSE returns',
        columns: 'return_reason, return_item_status, marketplace_id',
        binary: true,
        output: 'Rule: reason ∈ {SIZE_FIT, REMORSE} → auto-approve (with marketplace exceptions)',
        priority: 'high',
      },
    ],
  },
  {
    id: 'routing',
    title: 'Router / Gating Rules',
    icon: '2',
    color: 'border-indigo-300 bg-indigo-50',
    badgeColor: 'bg-indigo-100 text-indigo-700',
    description: 'Conditional agent invocation rules — which agents to run for which return types.',
    useCases: [
      {
        title: 'Reason → Agent Mapping Validation',
        description: 'Map each return_reason to the minimal set of agents needed. MISSHIPMENT → catalog_vs_evidence + consistency. DAMAGE → image agents + risk.',
        dataPoints: '92 unique return_reasons, top 7 cover 97.6%',
        columns: 'return_reason, process, return_item_status, tns_recommendation',
        binary: false,
        output: 'Routing table: reason → [required_agents]',
        priority: 'critical',
      },
      {
        title: 'Image Availability Skip Rules',
        description: 'Estimate how many returns lack OBD/POD images and would skip image agents entirely. Currently ~65% skip cx_vs_pod.',
        dataPoints: 'Needs join with image availability data from base tables',
        columns: 'forward_unit_id (to join with image metadata)',
        binary: false,
        output: 'Skip rates: OBD absent %, POD absent %, both absent %',
        priority: 'medium',
      },
      {
        title: 'FRM_CHECK Decomposition',
        description: 'TNS flags 640K returns as FRM_CHECK. Break down what happens to them — which process handles them and at what rejection rate.',
        dataPoints: '639,856 FRM_CHECK returns',
        columns: 'tns_recommendation=FRM_CHECK x process x return_item_status',
        binary: false,
        output: 'FRM_CHECK → FRM-INLINE (31.2%, 10.8% rej) / DETAILED (28.1%, 22.3% rej) / BULK (20.3%, 7.0% rej) / OCR (11.0%, 44.2% rej)',
        priority: 'high',
      },
      {
        title: 'High-Fraud Cohort Identification',
        description: 'Cohorts with >30% rejection rate need full agent stack. Identify these for mandatory L2 routing.',
        dataPoints: '15 cohorts with >50% rejection rate (min 500 returns)',
        columns: 'marketplace_id x cms_vertical x return_reason → rejection_rate',
        binary: false,
        output: 'Mandatory L2 list: computer+DEFECTIVE (84.5%), air_cooler+MISSHIPMENT (81.2%), television+DEFECTIVE (73.7%)...',
        priority: 'high',
      },
    ],
  },
  {
    id: 'gepa',
    title: 'GEPA Prompt Optimization',
    icon: '3',
    color: 'border-cyan-300 bg-cyan-50',
    badgeColor: 'bg-cyan-100 text-cyan-700',
    description: 'Binary decomposition and per-cohort prompt evolution using GEPA (Genetic-Pareto).',
    useCases: [
      {
        title: 'Binary Decomposition Targets',
        description: 'Decompose 7 classifying agents into 23 binary sub-agents for GEPA. Text agents (intent, risk) → 1 binary each. Catalog (text+image) → 1 binary. Image agents (cx, obd) → 8 binary each (misshipment, damage major/minor, missing major/minor, quality, multiple, expiry). Cross-ref agents → 2 binary each (misshipment, damage).',
        dataPoints: '85K labelled records for fitness evaluation',
        columns: 'Agent outputs from labelling.db: simulated_class, human_label per agent',
        binary: true,
        output: '7 agents → 23 binary sub-agents. Image agents have 10 output classes each → 8 binary (excl. No Issue/Can\'t Say defaults).',
        priority: 'critical',
      },
      {
        title: 'Cohort-Specific Prompt Variants',
        description: '566 cohorts have >1K returns/week. High variance across cohorts (0.5% to 84.5% rejection) means universal prompts are suboptimal. GEPA evolves per-cohort variants.',
        dataPoints: '566 cohorts × 23 binary sub-agents = 13,018 prompt optimization targets',
        columns: 'marketplace_id x cms_vertical x return_reason (cohort key)',
        binary: false,
        output: 'Pareto frontier of prompt variants per cohort per agent',
        priority: 'high',
      },
      {
        title: 'GEPA Fitness Function Design',
        description: 'Define the multi-objective fitness function: accuracy (vs human_label), calibrated confidence, false-positive cost weighting (based on return_amount), and per-cohort ECE.',
        dataPoints: 'Split: 5K frozen golden (validation) + 10K calibration + remainder for GEPA training',
        columns: 'human_label, simulated_class, return_amount, cohort',
        binary: false,
        output: 'Fitness = weighted(accuracy, confidence_calibration, cost_adjusted_FP_rate)',
        priority: 'high',
      },
      {
        title: 'Prompt Length Optimization',
        description: 'Current prompts are 8K-15K tokens with static few-shot examples. GEPA can find shorter, equally effective variants. Track token count as a Pareto objective alongside accuracy.',
        dataPoints: '14 production prompts, avg 12K tokens',
        columns: 'Prompt text from prompts_data.json + production_prompts_from_docx.json',
        binary: false,
        output: 'Pareto frontier: accuracy vs token_count. Target: same accuracy at <50% tokens.',
        priority: 'medium',
      },
      {
        title: 'Dynamic Few-Shot Retrieval Embeddings',
        description: 'Embed all 85K labelled examples for GEPA\'s dynamic few-shot retrieval. At inference, retrieve top-K similar cases instead of static examples. GEPA evolves the retrieval prompt template.',
        dataPoints: '85K labelled examples with full context',
        columns: 'return_reason, vertical, customer_comment, agent_outputs, human_label',
        binary: false,
        output: 'Vector index (pgvector/Vertex) + GEPA-optimized retrieval template per agent',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'cohort-analysis',
    title: 'Cohort & Segment Analysis',
    icon: '4',
    color: 'border-purple-300 bg-purple-50',
    badgeColor: 'bg-purple-100 text-purple-700',
    description: 'Deep analysis across 24,869 unique cohorts (marketplace × vertical × return reason) from 1-week data.',
    useCases: [
      {
        title: 'Per-Cohort Rejection Rate Baseline',
        description: 'Establish weekly rejection rate baselines for all 566 cohorts (>1K volume). Use as drift detection reference.',
        dataPoints: '566 cohorts with >1K returns, 3,261 with >100 returns',
        columns: 'marketplace_id x cms_vertical x return_reason → rejection_rate',
        binary: false,
        output: 'Baseline CSV: cohort, volume, rejection_rate, avg_amount, process_distribution',
        priority: 'high',
      },
      {
        title: 'Marketplace Risk Profiling',
        description: 'FLIPKART (3.3% rej) vs SHOPSY (3.4%) vs HYPERLOCAL (14.3%) vs GROCERY (34.3%). Different risk profiles need different adjudication strategies.',
        dataPoints: '5 marketplaces',
        columns: 'marketplace_id x return_item_status',
        binary: false,
        output: 'Risk tier per marketplace. GROCERY/HYPERLOCAL = high risk, mandate L2.',
        priority: 'high',
      },
      {
        title: 'Business Unit Segmentation',
        description: 'MOBILE (59.1% rejection!) vs LIFESTYLE (1.9%). BU-level routing rules for the gating layer.',
        dataPoints: '10 BUs, MOBILE is extreme outlier',
        columns: 'business_unit x return_item_status x return_reason',
        binary: false,
        output: 'BU → risk_tier mapping. MOBILE + LARGEAPPLIANCES = always L2.',
        priority: 'medium',
      },
      {
        title: 'Vertical-Level Deep Dive',
        description: '3,701 unique verticals. Top 15 by rejection rate (min 10K returns): smartwatch (31.5%), milk (11.5%), headphone (10.5%).',
        dataPoints: '3,701 verticals, ~100 with >10K returns',
        columns: 'cms_vertical x return_item_status x return_reason x return_amount',
        binary: false,
        output: 'Vertical risk score + recommended agent subset per vertical',
        priority: 'medium',
      },
      {
        title: 'Sub-Reason Pattern Analysis',
        description: '150 unique sub_reasons. Map sub-reasons to binary outcomes for fine-grained routing.',
        dataPoints: '150 sub_reasons across 92 reasons',
        columns: 'return_reason x return_sub_reason x return_item_status',
        binary: true,
        output: 'Sub-reason → binary (approve/escalate) with confidence scores',
        priority: 'low',
      },
    ],
  },
  {
    id: 'financial',
    title: 'Financial & Cost Analysis',
    icon: '5',
    color: 'border-amber-300 bg-amber-50',
    badgeColor: 'bg-amber-100 text-amber-700',
    description: 'GMV at risk, cost-of-error modeling, and ROI projections for the proposed architecture.',
    useCases: [
      {
        title: 'Cost-of-Error Curve',
        description: 'Map return_amount × decision type → financial impact. False approve = goods + shipping cost. False reject = CSAT loss + regulatory risk. Asymmetric costs per BU.',
        dataPoints: '3.99M returns, total GMV at risk = 236 Cr/week',
        columns: 'return_amount x return_item_status x business_unit x marketplace_id',
        binary: false,
        output: 'Cost matrix: {false_approve_cost, false_reject_cost} per BU per amount_bucket',
        priority: 'critical',
      },
      {
        title: 'Amount-Based Routing Thresholds',
        description: 'High-value returns (>5K: 35K returns) need more careful adjudication. Low-value (<100: 299K) can tolerate higher auto-approve rates.',
        dataPoints: 'Amount buckets: <100 (299K), 100-500 (2.59M), 500-1K (740K), 1K-5K (328K), 5K+ (35K)',
        columns: 'return_amount x process x return_item_status',
        binary: false,
        output: 'Amount → L1/L2 routing rule. >5K = always L2. <300 + low-risk reason = L1 auto-approve.',
        priority: 'high',
      },
      {
        title: 'OCR Process ROI Analysis',
        description: 'OCR handles 75K returns at 44.2% rejection rate with avg amount 2,251. Highest-value FRM process. Quantify savings from OCR rejections.',
        dataPoints: '74,984 OCR returns, avg 2,251 per return',
        columns: 'process=OCR x return_amount x return_item_status',
        binary: false,
        output: 'OCR saves ~7.5Cr/week in prevented fraudulent returns (33K rejections × avg 2,251)',
        priority: 'medium',
      },
      {
        title: 'LLM Cost Projection: Current vs Proposed',
        description: 'Model cost per call × calls per architecture → weekly/monthly cost comparison. Current infra uses Genvoy provisioned throughput (RPM limit: 36K, cache layer), not pay-per-use. Cost model changes with routing.',
        dataPoints: 'Current: ~8.7M calls/week (provisioned throughput via Genvoy). Proposed: ~4-5M calls with cheaper model mix.',
        columns: 'Genvoy TPM metrics (prompt+completion+total), Infinium per-agent token counts, RPM utilization',
        binary: false,
        output: 'Current: ~$8,700/week → Proposed: ~$2,600-3,400/week. Savings: $21K-25K/month. Provisioned throughput may need re-negotiation.',
        priority: 'high',
      },
      {
        title: 'Automation Rate Impact on Manual Review Cost',
        description: 'Each 1% increase in automation rate = ~700 fewer manual reviews/day. At ₹50/review, quantify savings from 70% → 85% automation.',
        dataPoints: '70K returns/day × 15pp automation increase = 10,500 fewer reviews/day',
        columns: 'Derived from process distribution (DETAILED + OCR = manual)',
        binary: false,
        output: '10,500 reviews/day × ₹50 = ₹5.25L/day = ₹15.75Cr/year savings',
        priority: 'high',
      },
    ],
  },
  {
    id: 'frm-process',
    title: 'FRM Process Effectiveness',
    icon: '6',
    color: 'border-rose-300 bg-rose-50',
    badgeColor: 'bg-rose-100 text-rose-700',
    description: 'Analysis of the 4 FRM process tracks: INLINE, DETAILED, BULK, OCR — effectiveness, coverage, and optimization.',
    useCases: [
      {
        title: 'Process Track Effectiveness Comparison',
        description: 'Compare all 5 process types on rejection rate, avg amount, volume, and inferred accuracy.',
        dataPoints: 'FRM-INLINE (203K, 10.8%), DETAILED (184K, 22.3%), BULK (132K, 7.0%), OCR (75K, 44.2%), OTHERS (3.4M, 1.9%)',
        columns: 'process x return_item_status x return_amount',
        binary: false,
        output: 'Effectiveness matrix per process track',
        priority: 'high',
      },
      {
        title: 'TNS → FRM Funnel Analysis',
        description: 'TNS recommends APPROVE (83.8%), FRM_CHECK (16%), REJECT (0.1%). Of FRM_CHECK, 31.2% go to INLINE, 28.1% DETAILED, 20.3% BULK, 11% OCR, 9.4% OTHERS.',
        dataPoints: '639K FRM_CHECK returns decomposed by process',
        columns: 'tns_recommendation x process x return_item_status',
        binary: false,
        output: 'Funnel: TNS → Process → Final Status. Where does the funnel leak?',
        priority: 'medium',
      },
      {
        title: 'TNS False Negatives',
        description: 'Returns where TNS=APPROVE but final status=rejected. These slipped past the first filter. 42,230 false negatives (1.3% of APPROVE).',
        dataPoints: '42,230 returns (TNS=APPROVE + rejected)',
        columns: 'tns_recommendation=APPROVE x return_item_status=rejected x return_reason x cms_vertical',
        binary: true,
        output: 'False negative profile: which reasons/verticals slip past TNS?',
        priority: 'high',
      },
      {
        title: 'Process Assignment Optimization',
        description: 'The CASE WHEN logic for process assignment uses agent_type_new, queue_name, and cms.source. Validate if the rules are optimal or if DETAILED cases could be BULK.',
        dataPoints: 'Full process derivation logic from SQL query',
        columns: 'All process derivation columns: user_approved_by, agent_type_new, queue_name, source',
        binary: false,
        output: 'Optimized process assignment rules reducing DETAILED reviews',
        priority: 'low',
      },
    ],
  },
  {
    id: 'confidence',
    title: 'Confidence & Calibration',
    icon: '7',
    color: 'border-blue-300 bg-blue-50',
    badgeColor: 'bg-blue-100 text-blue-700',
    description: 'Building calibrated confidence scores for the proposed architecture\'s decision routing.',
    useCases: [
      {
        title: 'Temperature Scaling Calibration Set',
        description: 'Reserve 10K labelled records for confidence calibration. Stratified by cohort to cover full distribution.',
        dataPoints: '10K from 85K labelled records',
        columns: 'agent_output, human_label, confidence (to be collected), cohort',
        binary: false,
        output: 'Calibrated temperature T per agent such that confidence/T matches observed accuracy',
        priority: 'critical',
      },
      {
        title: '"Can\'t Say" Decomposition',
        description: 'Split Can\'t Say into insufficient_evidence (missing images, blurry photos) vs genuine_uncertainty (low confidence between valid classes). Different routing for each.',
        dataPoints: 'Can\'t Say outputs from 85K labelled records in labelling.db',
        columns: 'simulated_class, simulated_output (contains reasoning), human_label',
        binary: true,
        output: 'Two distinct flags: {insufficient_evidence: bool, confidence: float}',
        priority: 'high',
      },
      {
        title: 'Confidence Threshold Simulation',
        description: 'Simulate different confidence thresholds (0.60, 0.80, 0.95) against labelled data. What automation rate do we achieve at each threshold?',
        dataPoints: '85K labelled + 110K simulated records',
        columns: 'simulated_class, human_label, confidence (derived)',
        binary: false,
        output: 'Threshold → {automation_rate, error_rate, escalation_rate}',
        priority: 'high',
      },
    ],
  },
  {
    id: 'operational',
    title: 'Operational & Temporal',
    icon: '8',
    color: 'border-gray-300 bg-gray-50',
    badgeColor: 'bg-gray-100 text-gray-700',
    description: 'Time-based patterns, channel analysis, and operational insights from the 1-week window.',
    useCases: [
      {
        title: 'Channel-Based Routing',
        description: 'SELF_SERVE (87.1%) vs EHC (7.4%) vs CS_AGENT (5.3%). Returns via CS_AGENT may have richer context from agent notes.',
        dataPoints: '5 channels',
        columns: 'return_request_channel x return_reason x return_item_status',
        binary: false,
        output: 'Channel → supplementary context availability flag for agents',
        priority: 'low',
      },
      {
        title: 'Incident Timeline Analysis',
        description: 'Time from return request to incident creation. Patterns in delay → outcome correlation.',
        dataPoints: '3.98M returns with incident dates',
        columns: 'incident_creation_date x return_item_status x process',
        binary: false,
        output: 'Latency distribution by process. SLA compliance rate.',
        priority: 'medium',
      },
      {
        title: 'FRM Recommendation Gap Diagnostic',
        description: 'frm_recommendation is 100% NULL in the extract. The decision_agent events table may not be populating. Need diagnostic query.',
        dataPoints: '3.99M rows, ALL null for frm_recommendation',
        columns: 'frm_recommendation (all null)',
        binary: false,
        output: 'Diagnostic: check tnsfrmdecisionprodevents for the date range. Fix JOIN or date filter.',
        priority: 'high',
      },
      {
        title: 'Week-over-Week Volume Trends',
        description: 'Run the same query for multiple weeks to track volume trends, seasonal patterns, and rejection rate drift.',
        dataPoints: 'Current: 1 week. Target: 4-8 weeks for trend analysis.',
        columns: 'All columns × week_number',
        binary: false,
        output: 'Trend dashboard: volume, rejection_rate, process_distribution per week',
        priority: 'medium',
      },
    ],
  },
  {
    id: 'model-eval',
    title: 'Model Evaluation & Migration',
    icon: '9',
    color: 'border-orange-300 bg-orange-50',
    badgeColor: 'bg-orange-100 text-orange-700',
    description: 'Evaluation infrastructure for model migration (Gemini Flash sunset June 2026) and ongoing quality monitoring.',
    useCases: [
      {
        title: 'Golden Eval Set Construction',
        description: 'Build a frozen 5K golden set stratified across all 725 cohorts. Used for release-gating any prompt or model change.',
        dataPoints: '5K from 614K labelled records, stratified',
        columns: 'All labelling columns + cohort key',
        binary: false,
        output: 'Frozen golden set CSV: never used for training, only for release gates.',
        priority: 'critical',
      },
      {
        title: 'Shadow-Mode A/B Framework',
        description: 'Run new model (Flash-Lite, Pro, Claude) in parallel with current Flash. Compare outputs on real traffic without affecting decisions.',
        dataPoints: '70K returns/day = shadow evaluation volume',
        columns: 'Current output vs shadow output per agent per return',
        binary: false,
        output: 'Per-agent, per-cohort accuracy comparison: Flash vs Flash-Lite vs Pro',
        priority: 'critical',
      },
      {
        title: 'Fine-Tuning Training Set Preparation',
        description: 'For intent_resonance and risk_signals: extract labelled examples with full context. Clean labels, balance classes, deduplicate.',
        dataPoints: '85K labelled records, filtered to intent/risk agent outputs',
        columns: 'Agent input context + human_label + cohort metadata',
        binary: true,
        output: 'Training JSONL: {input, label, metadata} per agent. 70/15/15 train/val/test split.',
        priority: 'high',
      },
      {
        title: 'Per-Cohort Regression Detection',
        description: 'Alert when any cohort\'s accuracy drops >2pp from baseline. Most regressions surface in 2-10 cohorts before aggregate.',
        dataPoints: '725 cohorts tracked daily',
        columns: 'cohort x date x accuracy x volume',
        binary: false,
        output: 'Daily alert: "FLIPKART|smartwatch|MISSHIPMENT accuracy dropped 3.2pp (68.3% → 65.1%)"',
        priority: 'high',
      },
    ],
  },
];

const PRIORITY_COLORS = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-gray-100 text-gray-600 border-gray-200',
};

function CategoryCard({ category, isExpanded, onToggle }) {
  const totalUseCases = category.useCases.length;
  const binaryCount = category.useCases.filter(u => u.binary).length;
  const criticalCount = category.useCases.filter(u => u.priority === 'critical').length;

  return (
    <div className={`rounded-xl border-2 ${category.color} transition-all`}>
      <button onClick={onToggle} className="w-full p-5 text-left cursor-pointer">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white bg-gray-800">
              {category.icon}
            </span>
            <div>
              <h3 className="font-bold text-gray-900">{category.title}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{category.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">{totalUseCases} use cases</span>
            {binaryCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 border border-cyan-200">{binaryCount} GEPA-ready</span>}
            {criticalCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">{criticalCount} critical</span>}
            <span className={`transition-transform text-gray-400 ${isExpanded ? 'rotate-180' : ''}`}>&#9662;</span>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-3">
          {category.useCases.map((uc, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-900">{uc.title}</span>
                  {uc.binary && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700 border border-cyan-200">BINARY</span>}
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${PRIORITY_COLORS[uc.priority]}`}>{uc.priority}</span>
              </div>
              <p className="text-xs text-gray-600 mb-3">{uc.description}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Data Available</p>
                  <p className="text-xs text-gray-700 mt-0.5">{uc.dataPoints}</p>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <p className="text-[10px] font-bold text-gray-500 uppercase">Columns Used</p>
                  <p className="text-xs text-gray-700 mt-0.5">{uc.columns}</p>
                </div>
              </div>
              <div className="bg-emerald-50 rounded p-2 mt-2">
                <p className="text-[10px] font-bold text-emerald-600 uppercase">Expected Output</p>
                <p className="text-xs text-gray-700 mt-0.5">{uc.output}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DesignUseCases() {
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterBinary, setFilterBinary] = useState(false);

  const toggleCategory = (id) => setExpandedCategory(prev => prev === id ? null : id);

  const totalUseCases = CATEGORIES.reduce((sum, c) => sum + c.useCases.length, 0);
  const binaryUseCases = CATEGORIES.reduce((sum, c) => sum + c.useCases.filter(u => u.binary).length, 0);
  const criticalUseCases = CATEGORIES.reduce((sum, c) => sum + c.useCases.filter(u => u.priority === 'critical').length, 0);

  const filteredCategories = CATEGORIES.map(cat => ({
    ...cat,
    useCases: cat.useCases.filter(uc => {
      if (filterPriority !== 'all' && uc.priority !== filterPriority) return false;
      if (filterBinary && !uc.binary) return false;
      return true;
    }),
  })).filter(cat => cat.useCases.length > 0);

  return (
    <div>
      <PageHeader
        title="Use Cases & Data Opportunities"
        subtitle="Exhaustive use cases from 1-week returns data (3.99M records, Apr 12-19, 2026)"
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: 'Total Use Cases', value: totalUseCases, sub: `across ${CATEGORIES.length} categories` },
          { label: 'GEPA-Ready (Binary)', value: binaryUseCases, sub: 'binary decomposition candidates' },
          { label: 'Critical Priority', value: criticalUseCases, sub: 'must-do for architecture' },
          { label: 'Data Source', value: '3.99M', sub: 'returns in 1 week' },
          { label: 'Unique Cohorts', value: '24,869', sub: '566 with >1K volume' },
          { label: 'GMV at Risk', value: '236 Cr', sub: 'weekly return amount' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1">{s.value}</p>
            <p className="text-[10px] text-gray-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Data Source Info */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-indigo-500 text-lg flex-shrink-0">&#9432;</span>
          <div>
            <p className="text-sm font-semibold text-indigo-800">Data Source: 13 columns from 9 Bigfoot base tables</p>
            <p className="text-xs text-indigo-600 mt-1">incident, marketplace_id, cms_vertical, business_unit, return_reason, return_sub_reason, return_amount, tns_recommendation, frm_recommendation (null), return_item_status, incident_creation_date, return_request_channel, process</p>
            <p className="text-xs text-indigo-500 mt-1">Additional columns available from base tables — DESCRIBE queries pending. Full SQL query saved at Documents/Return-Adjudication-Automation/returns_volume_query.sql</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <span className="text-xs font-semibold text-gray-500">Filter:</span>
        <div className="flex gap-1">
          {['all', 'critical', 'high', 'medium', 'low'].map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                filterPriority === p
                  ? 'bg-gray-800 text-white border-gray-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFilterBinary(!filterBinary)}
          className={`text-[10px] font-bold px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
            filterBinary
              ? 'bg-cyan-600 text-white border-cyan-600'
              : 'bg-white text-cyan-600 border-cyan-200 hover:bg-cyan-50'
          }`}
        >
          GEPA Binary Only
        </button>
        <span className="text-[10px] text-gray-400">
          Showing {filteredCategories.reduce((s, c) => s + c.useCases.length, 0)} of {totalUseCases} use cases
        </span>
      </div>

      {/* Category Cards */}
      <div className="space-y-3 mb-8">
        {filteredCategories.map(cat => (
          <CategoryCard
            key={cat.id}
            category={cat}
            isExpanded={expandedCategory === cat.id}
            onToggle={() => toggleCategory(cat.id)}
          />
        ))}
      </div>

      {/* Decision Agent Elimination */}
      <div className="bg-rose-50 rounded-2xl border-2 border-rose-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-rose-700 uppercase tracking-wider mb-1">Decision Agent Elimination</h2>
        <p className="text-xs text-rose-600 mb-4">Replace the decision_agent LLM call with deterministic weighted scoring rules — current LLM is worse than trivial baselines</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-rose-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Current Performance</h3>
            <div className="space-y-2.5">
              {[
                { label: 'Decision Agent (LLM)', value: '26.2%', bar: 26.2, color: 'bg-rose-500' },
                { label: 'Majority Vote (rule)', value: '34.4%', bar: 34.4, color: 'bg-amber-500' },
                { label: 'Always Approve (trivial)', value: '78.5%', bar: 78.5, color: 'bg-emerald-500' },
              ].map(b => (
                <div key={b.label}>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-600">{b.label}</span>
                    <span className="font-bold text-gray-900">{b.value}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-0.5">
                    <div className={`${b.color} h-1.5 rounded-full`} style={{ width: `${b.bar}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-rose-500 mt-3 font-semibold">LLM call is 52.3pp WORSE than trivially approving everything</p>
          </div>
          <div className="bg-white rounded-xl border border-rose-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Proposed Deterministic Rules</h3>
            <ol className="space-y-2 text-xs text-gray-700">
              <li><span className="font-bold text-emerald-600">1.</span> All upstream = "No Issue" → <span className="font-bold text-emerald-600">Approve</span> <span className="text-gray-400">(~65%)</span></li>
              <li><span className="font-bold text-rose-600">2.</span> Any agent = "Misshipment" high conf → <span className="font-bold text-rose-600">Reject</span> <span className="text-gray-400">(~8%)</span></li>
              <li><span className="font-bold text-rose-600">3.</span> Majority agents = "Issue" → <span className="font-bold text-rose-600">Reject</span> <span className="text-gray-400">(~12%)</span></li>
              <li><span className="font-bold text-amber-600">4.</span> Otherwise → <span className="font-bold text-amber-600">Human Review</span> <span className="text-gray-400">(~15%)</span></li>
            </ol>
            <p className="text-[10px] text-gray-500 mt-3">Zero hallucination risk. Fully interpretable. Auditable.</p>
          </div>
          <div className="bg-white rounded-xl border border-rose-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Impact</h3>
            <ul className="space-y-2 text-xs text-gray-700">
              <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold text-sm">-1</span> LLM call eliminated per return</li>
              <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold text-sm">-70K</span> LLM calls/day saved</li>
              <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold text-sm">-$1.2K</span> weekly cost reduction</li>
              <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold text-sm">-4.5s</span> latency reduction per return</li>
              <li className="flex items-center gap-2"><span className="text-emerald-600 font-bold text-sm">0%</span> hallucination risk</li>
            </ul>
            <p className="text-[10px] text-gray-500 mt-3">Based on 614K labelled records from labelling.db</p>
          </div>
        </div>
      </div>

      {/* GEPA Binary Decomposition */}
      <div className="bg-cyan-50 rounded-2xl border-2 border-cyan-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-cyan-700 uppercase tracking-wider mb-1">GEPA Binary Decomposition — Agent Breakdown</h2>
        <p className="text-xs text-cyan-600 mb-4">7 classifying agents → 23 binary sub-agents + 1 eliminated + 1 preprocessor. Image agents expand from 10 classes to 8 binary each. Binary prompts enable per-cohort GEPA optimization.</p>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Current Agents', value: '9', sub: '7 classifying + 1 preprocessor + 1 eliminated', color: 'text-gray-800' },
            { label: 'Binary Sub-Agents', value: '23', sub: 'optimized by GEPA', color: 'text-cyan-700' },
            { label: 'Eliminated', value: '1', sub: 'decision_agent → rules', color: 'text-rose-600' },
            { label: 'GEPA Targets', value: '13,018', sub: '23 agents × 566 cohorts', color: 'text-indigo-700' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-cyan-200 p-3 text-center">
              <p className="text-[10px] font-semibold text-gray-400 uppercase">{s.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-500">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-cyan-200 overflow-hidden mb-4">
          <table className="w-full text-xs">
            <thead className="bg-cyan-100/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-cyan-800">Current Agent</th>
                <th className="px-3 py-2 text-center font-semibold text-cyan-800">Accuracy</th>
                <th className="px-3 py-2 text-center font-semibold text-cyan-800">Type</th>
                <th className="px-3 py-2 text-center font-semibold text-cyan-800">Classes</th>
                <th className="px-3 py-2 text-left font-semibold text-cyan-800">Binary Sub-Agents</th>
                <th className="px-3 py-2 text-center font-semibold text-cyan-800">#</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { agent: 'intent_resonance', acc: '91.9%', type: 'Text', accColor: 'text-emerald-600', classes: 3, subs: [
                  { name: 'intent_binary', output: 'Issue / No Issue', desc: 'Compares customer\'s selected return reason (dropdown) against their free-text comment. Detects reason-selection mismatches using a dictionary of 9 major categories and 100+ sub-reasons. Translates Hinglish/Hindi, cleans up spelling. Applies Electronics vs. non-Electronics business unit policy rules.' },
                ], count: 1, typeColor: 'bg-blue-100 text-blue-700' },
                { agent: 'risk_signals', acc: '99.5%', type: 'Text', accColor: 'text-emerald-600', classes: 3, subs: [
                  { name: 'risk_binary', output: 'Issue / No Issue', desc: 'Rule-based classifier evaluating 6 cluster risk labels (delivery_phone, terminal_id, payment_instrument, refund_bank, refund_upi, fingerprint) for RED/AMBER flags, plus image_similarity_distance check (0-1 = duplicate image fraud). Any RED cluster or 2+ AMBER clusters → Issue.' },
                ], count: 1, typeColor: 'bg-blue-100 text-blue-700' },
                { agent: 'catalog_correctness', acc: '56.1%', type: 'Text + Image', accColor: 'text-amber-600', classes: 3, subs: [
                  { name: 'catalog_binary', output: 'Issue / No Issue', desc: 'Two-part audit: (1) Visual Verification — validates product spec text claims against product images (e.g., "Nylon Braided Cable" vs. smooth rubber in image). (2) Internal Data Consistency — finds contradicting values in same text (e.g., "12 Hours battery" vs. "8 Hours playtime"). Uses product_attributes, product_image, title, and vertical.' },
                ], count: 1, typeColor: 'bg-teal-100 text-teal-700' },
                { agent: 'cx_image_adjudication', acc: '58.3%', type: 'Image', accColor: 'text-amber-600', classes: 10, subs: [
                  { name: 'cx_img_misshipment', output: 'Y/N', desc: 'Compares catalog image against customer images using 5 Identity Pillars: (1) Category/Form — object class & silhouette, (2) Brand/Logo — name & execution style, (3) Material & Pattern — type, density, execution, (4) Color DNA — base family & shade variance, (5) Electronics Physical Specs — chassis, bezel, buttons, strap.' },
                  { name: 'cx_img_damage_major', output: 'Y/N', desc: 'Detects major structural damage: sole separation, torn fabric, broken threads/zippers/tubes, cut wires, heavy scratches, broken parts, crushed items, cracked screens. Damage that renders the product non-functional.' },
                  { name: 'cx_img_damage_minor', output: 'Y/N', desc: 'Detects minor cosmetic damage: surface scratches, scuffs, stains, loose lint, light scratches. Product remains functional but shows visible wear or imperfections.' },
                  { name: 'cx_img_missing_major', output: 'Y/N', desc: 'Detects if the primary product unit is absent — empty box, only accessories present, main product completely missing from the shipment.' },
                  { name: 'cx_img_missing_minor', output: 'Y/N', desc: 'Detects missing accessories — charger, manual, mounting hardware, or other expected bundle items are absent while the primary unit is present.' },
                  { name: 'cx_img_quality_issue', output: 'Y/N', desc: 'Flags product quality/defect issues visible in images — manufacturing defects, functionality problems that are visually evident, quality not matching expectations.' },
                  { name: 'cx_img_multiple_issue', output: 'Y/N', desc: 'Detects when 2+ failure categories co-exist (e.g., minor damage + missing accessory). Highest-priority label when multiple issues detected simultaneously.' },
                  { name: 'cx_img_expiry', output: 'Y/N', desc: 'Checks for product expiry/shelf-life issues visible in customer images — expired dates, deteriorated products, spoiled items.' },
                ], count: 8, typeColor: 'bg-purple-100 text-purple-700' },
                { agent: 'obd_image_adjudication', acc: '62.1%', type: 'Image', accColor: 'text-amber-600', classes: 10, subs: [
                  { name: 'obd_img_misshipment', output: 'Y/N', desc: 'Same 5 Identity Pillars comparison as CX agent but applied to OBD (Open Box Delivery) images taken at dispatch/delivery time. Verifies the correct product was shipped before reaching the customer.' },
                  { name: 'obd_img_damage_major', output: 'Y/N', desc: 'Checks OBD delivery images for major damage present at time of shipping — pre-existing defects visible before the customer received the product. Establishes damage timeline (pre-transit vs. post-transit).' },
                  { name: 'obd_img_damage_minor', output: 'Y/N', desc: 'Checks OBD delivery images for minor cosmetic issues at time of shipping — scratches, scuffs visible in delivery photos establish pre-existing condition.' },
                  { name: 'obd_img_missing_major', output: 'Y/N', desc: 'Flags if the primary product unit appears absent in OBD images — empty packaging at delivery time, wrong item packed.' },
                  { name: 'obd_img_missing_minor', output: 'Y/N', desc: 'Flags missing accessories visible in OBD images — expected bundle items not present at time of delivery.' },
                  { name: 'obd_img_quality_issue', output: 'Y/N', desc: 'Detects quality/defect issues visible in OBD delivery images — manufacturing defects evident before customer handling.' },
                  { name: 'obd_img_multiple_issue', output: 'Y/N', desc: 'Multiple failure categories co-existing in OBD images (damage + missing, etc.). Triggered when 2+ issues detected simultaneously.' },
                  { name: 'obd_img_expiry', output: 'Y/N', desc: 'Checks for expired/deteriorated products visible in OBD images — establishes the product was already expired at delivery time.' },
                ], count: 8, typeColor: 'bg-purple-100 text-purple-700' },
                { agent: 'cx_vs_obd_comparison', acc: '61.3%', type: 'Cross-Ref', accColor: 'text-amber-600', classes: 4, subs: [
                  { name: 'cx_obd_misshipment', output: 'Y/N', desc: 'Fraud/switcheroo detection: cross-references customer images with OBD delivery images using Identity Matrix (item, color, model, size). Detects if a different product appears in customer images vs. what was delivered. Uses ROI Conflict Rule — misshipment only if same specific region shows conflicting info.' },
                  { name: 'cx_obd_damage', output: 'Y/N', desc: 'Condition integrity check: compares product condition in OBD images (delivery time) vs. customer images (return claim). Distinguishes permanent connections (hinges/joints = broken) from detachable parts (clips/caps = disassembled). Detects self-inflicted damage by comparing surface/hygiene state across both image sets.' },
                ], count: 2, typeColor: 'bg-amber-100 text-amber-700' },
                { agent: 'cx_vs_pod_comparison', acc: '15.9%', type: 'Cross-Ref', accColor: 'text-rose-600', classes: 4, subs: [
                  { name: 'cx_pod_misshipment', output: 'Y/N', desc: 'Compares customer images with POD (Proof of Delivery / last-mile) images to detect product swaps between delivery and return claim. Conditional agent — runs only when POD images exist (~35% of incidents).' },
                  { name: 'cx_pod_damage', output: 'Y/N', desc: 'Compares product condition in POD images (doorstep delivery moment) vs. customer return images to detect damage that occurred after delivery — post-delivery damage vs. transit damage.' },
                ], count: 2, typeColor: 'bg-amber-100 text-amber-700' },
                { agent: 'decision_agent', acc: '26.2%', type: 'Orchestrator', accColor: 'text-rose-600', classes: 4, subs: [{ name: 'ELIMINATED → deterministic rules', output: '', desc: '' }], count: 0, typeColor: 'bg-rose-100 text-rose-700', eliminated: true },
              ].map(r => (
                <tr key={r.agent} className={r.eliminated ? 'bg-rose-50/50' : ''}>
                  <td className={`px-3 py-2.5 font-mono font-medium ${r.eliminated ? 'line-through text-gray-400' : 'text-gray-800'}`}>{r.agent}</td>
                  <td className={`px-3 py-2.5 text-center font-bold ${r.accColor}`}>{r.acc}</td>
                  <td className="px-3 py-2.5 text-center"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.typeColor}`}>{r.type}</span></td>
                  <td className="px-3 py-2.5 text-center text-gray-600">{r.classes}</td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5">
                      {r.subs.map((s, i) => (
                        <div key={i} className={`text-[11px] flex items-center gap-1 ${r.eliminated ? 'text-rose-500 font-semibold' : 'text-gray-700'}`}>
                          {s.output ? (
                            <>
                              <span className="font-mono text-cyan-700">{s.name}</span>
                              <span className="text-gray-400">: {s.output}</span>
                              {s.desc && (
                                <span className="relative group ml-0.5">
                                  <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-cyan-200 text-cyan-700 text-[8px] font-bold cursor-help leading-none">i</span>
                                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 p-2 bg-gray-900 text-white text-[10px] leading-tight rounded-lg shadow-xl opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                                    {s.desc}
                                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                                  </span>
                                </span>
                              )}
                            </>
                          ) : (
                            <span>{s.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className={`px-3 py-2.5 text-center font-bold ${r.eliminated ? 'text-rose-500' : 'text-cyan-700'}`}>{r.eliminated ? '\u00d7' : r.count}</td>
                </tr>
              ))}
              <tr className="bg-cyan-50 font-bold">
                <td className="px-3 py-2.5 text-cyan-800" colSpan={5}>Total Binary Sub-Agents for GEPA Optimization</td>
                <td className="px-3 py-2.5 text-center text-cyan-700 text-lg">23</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-cyan-200 p-3">
            <p className="text-[10px] font-bold text-gray-500 uppercase">LLM Calls: Current</p>
            <p className="text-lg font-bold text-gray-800">8-9 per return</p>
            <p className="text-[10px] text-gray-500">All agents run on every return, no routing</p>
          </div>
          <div className="bg-white rounded-lg border border-cyan-200 p-3">
            <p className="text-[10px] font-bold text-cyan-600 uppercase">LLM Calls: Proposed (Full Path)</p>
            <p className="text-lg font-bold text-cyan-700">3-5 binary calls</p>
            <p className="text-[10px] text-gray-500">Router selects only needed agents, decision eliminated</p>
          </div>
          <div className="bg-white rounded-lg border border-cyan-200 p-3">
            <p className="text-[10px] font-bold text-emerald-600 uppercase">LLM Calls: Proposed (Fast Path)</p>
            <p className="text-lg font-bold text-emerald-600">1 call (L1 classifier)</p>
            <p className="text-[10px] text-gray-500">65% of returns resolved with single binary call</p>
          </div>
        </div>
      </div>

      {/* 100% Returns Scope */}
      <div className="bg-indigo-50 rounded-2xl border-2 border-indigo-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-indigo-700 uppercase tracking-wider mb-1">100% Returns Coverage — Beyond FRM Track</h2>
        <p className="text-xs text-indigo-600 mb-4">Current system handles only 7-8% (FRM track). Proposed architecture covers all 3.99M weekly returns including SIZE_FIT, CUSTOMER_REMORSE, and non-FRM reasons.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-xl border border-indigo-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Current: FRM Track Only (7-8%)</h3>
            <div className="space-y-1.5 text-xs text-gray-700">
              {[
                { label: 'FRM-INLINE', vol: '203K (5.1%)' },
                { label: 'FRM-DETAILED', vol: '184K (4.6%)' },
                { label: 'FRM-BULK', vol: '132K (3.3%)' },
                { label: 'FRM-OCR', vol: '75K (1.9%)' },
              ].map(r => (
                <div key={r.label} className="flex justify-between"><span>{r.label}</span><span className="font-bold">{r.vol}</span></div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5 font-bold text-gray-900">
                <span>Total FRM</span><span>594K (14.9%)</span>
              </div>
            </div>
            <p className="text-[10px] text-rose-500 mt-2 font-semibold">5 return reasons only: DAMAGED, MISSHIPMENT, MISSING, QUALITY, SMART_PICKUP</p>
          </div>
          <div className="bg-white rounded-xl border border-indigo-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Proposed: All Returns (100%)</h3>
            <div className="space-y-1.5 text-xs text-gray-700">
              {[
                { label: 'L1 Auto-Approve (SIZE_FIT, REMORSE, low-risk)', vol: '~2.6M (65%)', color: 'text-emerald-600' },
                { label: 'L1 Auto-Reject (high-confidence fraud)', vol: '~31K (0.8%)', color: 'text-rose-600' },
                { label: 'L2 Binary Agent Stack (routed)', vol: '~1.0M (25%)', color: 'text-amber-600' },
                { label: 'L3 Human Escalation', vol: '~360K (9%)', color: 'text-indigo-600' },
              ].map(r => (
                <div key={r.label} className="flex justify-between"><span>{r.label}</span><span className={`font-bold ${r.color}`}>{r.vol}</span></div>
              ))}
              <div className="flex justify-between border-t border-gray-200 pt-1.5 mt-1.5 font-bold text-gray-900">
                <span>Total Coverage</span><span className="text-emerald-600">3.99M (100%)</span>
              </div>
            </div>
            <p className="text-[10px] text-emerald-500 mt-2 font-semibold">92 return reasons covered including SIZE_FIT_ISSUES, CUSTOMER_REMORSE, DEFECTIVE, etc.</p>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-indigo-200 p-4">
          <h3 className="text-xs font-bold text-indigo-600 uppercase mb-2">Non-FRM Return Reasons Now Covered</h3>
          <div className="flex flex-wrap gap-1.5">
            {['SIZE_FIT_ISSUES (31%)', 'CUSTOMER_REMORSE (6%)', 'DEFECTIVE_PRODUCT (6%)', 'PERFORMANCE_ISSUE (3%)', 'PRODUCT_NOT_AS_DESCRIBED (2%)', 'WARRANTY_CLAIM (1%)', 'WRONG_SIZE (1%)', '+ 85 more reasons'].map(r => (
              <span key={r} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">{r}</span>
            ))}
          </div>
        </div>
      </div>

      {/* GEPA Integration Summary */}
      <div className="bg-cyan-50 rounded-2xl border-2 border-cyan-200 p-6 mb-8">
        <h2 className="text-sm font-bold text-cyan-700 uppercase tracking-wider mb-4">GEPA Integration Across Use Cases</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-cyan-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Binary Decomposition Summary</h3>
            <ul className="space-y-1 text-xs text-gray-700">
              <li><span className="font-bold text-cyan-700">2</span> text agents → <span className="font-bold">2</span> binary (intent, risk)</li>
              <li><span className="font-bold text-cyan-700">1</span> text+image agent → <span className="font-bold">1</span> binary (catalog)</li>
              <li><span className="font-bold text-cyan-700">2</span> image agents → <span className="font-bold">16</span> binary (8 each: cx, obd)</li>
              <li><span className="font-bold text-cyan-700">2</span> cross-ref agents → <span className="font-bold">4</span> binary (2 each: cx_obd, cx_pod)</li>
              <li><span className="font-bold text-rose-500">1</span> decision agent → <span className="font-bold text-rose-500">ELIMINATED</span> (deterministic rules)</li>
              <li className="border-t border-gray-200 pt-1 mt-1"><span className="font-bold text-cyan-700">7 agents → 23 binary sub-agents</span> + 1 eliminated + 1 preprocessor</li>
            </ul>
          </div>
          <div className="bg-white rounded-xl border border-cyan-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-2">GEPA Algorithm Flow</h3>
            <ol className="space-y-1 text-xs text-gray-700">
              <li><span className="font-bold text-cyan-700">1.</span> Sample execution traces from Layer 7 telemetry</li>
              <li><span className="font-bold text-cyan-700">2.</span> Reflect: LLM diagnoses failure modes in natural language</li>
              <li><span className="font-bold text-cyan-700">3.</span> Mutate: propose targeted prompt edits based on diagnosis</li>
              <li><span className="font-bold text-cyan-700">4.</span> Evaluate: test against 5K frozen golden set</li>
              <li><span className="font-bold text-cyan-700">5.</span> Select: Pareto frontier preserves diverse solutions</li>
              <li><span className="font-bold text-cyan-700">6.</span> Deploy: push optimized prompts to Layer 4 agents</li>
            </ol>
          </div>
          <div className="bg-white rounded-xl border border-cyan-200 p-4">
            <h3 className="text-sm font-bold text-gray-900 mb-2">Expected Impact</h3>
            <ul className="space-y-1 text-xs text-gray-700">
              <li>+5-15% accuracy on tail cohorts (published benchmarks)</li>
              <li>+10% over MIPROv2 prompt optimizer (ICLR 2026)</li>
              <li>35x fewer rollouts than GRPO (cost-efficient)</li>
              <li>Per-cohort specialization across 566 active cohorts</li>
              <li>Eliminates manual prompt v1→v5 iteration cycles</li>
              <li>Interpretable: human-readable mutation explanations</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Key Data Insights */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Key Data Insights (from 4M returns analysis)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-xs font-bold text-gray-600 uppercase mb-2">Volume Distribution</h3>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-gray-100">
                {[
                  { label: 'SIZE_FIT_ISSUES', vol: '1.24M (31%)', rej: '0.5%', tag: 'AUTO-APPROVE' },
                  { label: 'QUALITY_ISSUE', vol: '1.17M (29%)', rej: '1.4%', tag: 'AUTO-APPROVE' },
                  { label: 'MISSHIPMENT', vol: '468K (12%)', rej: '10.7%', tag: 'ADJUDICATE' },
                  { label: 'DAMAGED_PRODUCT', vol: '371K (9%)', rej: '8.5%', tag: 'ADJUDICATE' },
                  { label: 'DEFECTIVE_PRODUCT', vol: '244K (6%)', rej: '3.4%', tag: 'LOW-RISK' },
                  { label: 'CUSTOMER_REMORSE', vol: '220K (6%)', rej: '4.1%', tag: 'LOW-RISK' },
                  { label: 'MISSING_ITEM', vol: '190K (5%)', rej: '19.8%', tag: 'HIGH-REJECT' },
                ].map(r => (
                  <tr key={r.label}>
                    <td className="py-1.5 font-medium text-gray-800">{r.label}</td>
                    <td className="py-1.5 text-gray-600">{r.vol}</td>
                    <td className="py-1.5 text-gray-600">{r.rej} rej</td>
                    <td className="py-1.5"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      r.tag === 'AUTO-APPROVE' ? 'bg-emerald-100 text-emerald-700' :
                      r.tag === 'LOW-RISK' ? 'bg-blue-100 text-blue-700' :
                      r.tag === 'ADJUDICATE' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>{r.tag}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-xs font-bold text-gray-600 uppercase mb-2">Highest-Risk Cohorts (>50% rejection)</h3>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-gray-100">
                {[
                  { cohort: 'FK | computer | DEFECTIVE', rate: '84.5%', vol: '569' },
                  { cohort: 'FK | air_cooler | MISSHIPMENT', rate: '81.2%', vol: '1,129' },
                  { cohort: 'FK | television | DEFECTIVE', rate: '73.7%', vol: '1,084' },
                  { cohort: 'FK | water_purifier | DEFECTIVE', rate: '73.2%', vol: '1,115' },
                  { cohort: 'FK | AC_new | DAMAGED', rate: '72.4%', vol: '548' },
                  { cohort: 'FK | mobile | PERFORMANCE', rate: '71.2%', vol: '1,153' },
                  { cohort: 'FK | AC_new | DEFECTIVE', rate: '69.6%', vol: '1,039' },
                  { cohort: 'FK | fan | MISSHIPMENT', rate: '69.2%', vol: '1,312' },
                  { cohort: 'FK | smartwatch | MISSHIPMENT', rate: '68.3%', vol: '2,621' },
                ].map(r => (
                  <tr key={r.cohort}>
                    <td className="py-1.5 font-medium text-gray-800">{r.cohort}</td>
                    <td className="py-1.5 text-red-600 font-bold">{r.rate}</td>
                    <td className="py-1.5 text-gray-500">{r.vol}/week</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
