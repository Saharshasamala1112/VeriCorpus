import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ScanSearch,
  FileText,
  Image,
  Music,
  Video,
  File,
  History,
  Database,
  BrainCircuit,
  Settings,
  X,
  Shield,
} from 'lucide-react'
import { ROUTES } from '../../config/routes'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

const navItems = [
  { to: ROUTES.DASHBOARD, label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Analyze',
    icon: ScanSearch,
    children: [
      { to: ROUTES.ANALYZE, label: 'Overview', icon: ScanSearch },
      { to: ROUTES.ANALYZE_TEXT, label: 'Text', icon: FileText },
      { to: ROUTES.ANALYZE_IMAGE, label: 'Image', icon: Image },
      { to: ROUTES.ANALYZE_AUDIO, label: 'Audio', icon: Music },
      { to: ROUTES.ANALYZE_VIDEO, label: 'Video', icon: Video },
      { to: ROUTES.ANALYZE_DOCUMENT, label: 'Document', icon: File },
    ],
  },
  { to: ROUTES.HISTORY, label: 'History', icon: History },
  { to: ROUTES.DATASETS, label: 'Datasets', icon: Database },
  { to: ROUTES.MODELS, label: 'Models', icon: BrainCircuit },
  { to: ROUTES.SETTINGS, label: 'Settings', icon: Settings },
]

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800/50 bg-[#0a0e16] transition-transform duration-200 lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-800/50 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10">
            <Shield className="h-4.5 w-4.5 text-cyan-400" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white">VeriCorpus</span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
              AI Platform
            </span>
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          <div className="space-y-1">
            {navItems.map((item) =>
              item.children ? (
                <div key={item.label} className="pt-2">
                  <div className="mb-1 flex items-center gap-2 px-3">
                    <item.icon className="h-4 w-4 text-slate-600" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      {item.label}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-cyan-400/10 text-cyan-300'
                              : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                          }`
                        }
                      >
                        <child.icon className="h-4 w-4 shrink-0" />
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-cyan-400/10 text-cyan-300'
                        : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                    }`
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              ),
            )}
          </div>
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-800/50 px-5 py-4">
          <p className="text-[10px] text-slate-600">VeriCorpus AI v1.0.0</p>
        </div>
      </aside>
    </>
  )
}
