import { useState, createContext, useContext, type ReactNode } from 'react'

interface TabsContextValue {
  activeTab: string
  setActiveTab: (id: string) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs() {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs components must be used within <Tabs>')
  return ctx
}

interface TabsProps {
  defaultTab: string
  children: ReactNode
  className?: string
}

export function Tabs({ defaultTab, children, className = '' }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab)
  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex gap-1 rounded-xl border border-slate-200 bg-slate-100/50 p-1 dark:border-slate-800 dark:bg-slate-900/50 ${className}`}
      role="tablist"
    >
      {children}
    </div>
  )
}

export function TabsTrigger({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab, setActiveTab } = useTabs()
  const isActive = activeTab === id
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => setActiveTab(id)}
      className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
        isActive ? 'bg-cyan-400 text-slate-950' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

export function TabsContent({ id, children }: { id: string; children: ReactNode }) {
  const { activeTab } = useTabs()
  if (activeTab !== id) return null
  return <div role="tabpanel">{children}</div>
}
