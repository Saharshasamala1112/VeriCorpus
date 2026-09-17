import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type {
  EvaluationRun,
  EvaluationMetrics,
  CalibrationMetrics,
  QualityGateResult,
} from '../../types/lifelong-learning'

interface EvaluationDetailProps {
  evaluation: EvaluationRun
  gateResults: QualityGateResult[]
}

function MetricsTable({ metrics, title }: { metrics: EvaluationMetrics; title: string }) {
  return (
    <div>
      <h5 className="mb-2 text-[11px] font-semibold text-slate-400">{title}</h5>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {Object.entries(metrics).map(([key, value]) => {
          if (key === 'confusionMatrix' || typeof value !== 'number') return null
          return (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
              </span>
              <span className="text-[11px] font-medium text-slate-300">
                {(value * 100).toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalibrationChart({ calibration }: { calibration: CalibrationMetrics }) {
  return (
    <div>
      <h5 className="mb-2 text-[11px] font-semibold text-slate-400">Calibration</h5>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center">
          <p className="text-lg font-bold text-slate-200">
            {(calibration.expectedCalibrationError * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-500">ECE</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-200">
            {(calibration.brierScore * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-500">Brier</p>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-200">
            {(calibration.maximumCalibrationError * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-500">Max CE</p>
        </div>
      </div>
    </div>
  )
}

function GateResults({ results }: { results: QualityGateResult[] }) {
  if (results.length === 0) return null

  return (
    <div>
      <h5 className="mb-2 text-[11px] font-semibold text-slate-400">Quality Gates</h5>
      <div className="space-y-1.5">
        {results.map((r) => (
          <div
            key={r.gateId}
            className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${
              r.passed
                ? 'border border-emerald-500/20 bg-emerald-500/5'
                : r.required
                  ? 'border border-red-500/20 bg-red-500/5'
                  : 'border border-amber-500/20 bg-amber-500/5'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px]">{r.passed ? '✓' : r.required ? '✗' : '⚠'}</span>
              <span className="text-[11px] text-slate-300">{r.gateName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">{(r.actual * 100).toFixed(1)}%</span>
              <span className="text-[10px] text-slate-600">
                {r.operator} {(r.threshold * 100).toFixed(0)}%
              </span>
              <Badge variant={r.passed ? 'success' : r.required ? 'danger' : 'warning'} size="sm">
                {r.passed ? 'PASS' : 'FAIL'}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function EvaluationDetail({ evaluation, gateResults }: EvaluationDetailProps) {
  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Evaluation Detail</h3>
        <Badge variant={evaluation.passedGates ? 'success' : 'danger'} size="sm">
          {evaluation.passedGates ? 'All Gates Passed' : 'Gates Failed'}
        </Badge>
      </div>

      <div className="space-y-4">
        <MetricsTable metrics={evaluation.metrics} title="Test Set Metrics" />
        <CalibrationChart calibration={evaluation.calibration} />
        <GateResults results={gateResults.length > 0 ? gateResults : evaluation.gateResults} />

        {evaluation.regressionDetected && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
            <p className="text-xs font-medium text-red-400">Regression Detected</p>
            {evaluation.regressionDetails.map((detail, i) => (
              <p key={i} className="mt-1 text-[11px] text-red-300/70">
                {detail}
              </p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-800/40 bg-slate-900/20 p-2.5">
            <p className="text-[10px] text-slate-500">False Positive Rate</p>
            <p className="text-sm font-bold text-slate-200">
              {(evaluation.falsePositiveRate * 100).toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border border-slate-800/40 bg-slate-900/20 p-2.5">
            <p className="text-[10px] text-slate-500">False Negative Rate</p>
            <p className="text-sm font-bold text-slate-200">
              {(evaluation.falseNegativeRate * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
