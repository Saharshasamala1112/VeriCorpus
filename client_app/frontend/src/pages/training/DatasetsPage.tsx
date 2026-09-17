import { Database, RefreshCw, Plus } from 'lucide-react'
import { Button, EmptyState } from '../../components/ui'

export default function DatasetsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Datasets</h1>
          <p className="mt-1 text-sm text-slate-500">Manage training and evaluation datasets.</p>
        </div>
        <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} disabled>
          Add Dataset
        </Button>
      </div>

      <EmptyState
        title="No live datasets"
        description="Connect a real corpus source to begin managing datasets in production."
        icon={<Database className="h-7 w-7" />}
      />

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3 w-3" />} disabled>
          Sync
        </Button>
      </div>
    </div>
  )
}
