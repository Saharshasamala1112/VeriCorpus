import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { countries, type Country } from '../../config/countries'

interface CountrySelectProps {
  value: string
  onChange: (country: Country) => void
  error?: string
  disabled?: boolean
  label?: string
  required?: boolean
}

export default function CountrySelect({
  value,
  onChange,
  error,
  disabled,
  label = 'Country',
  required = true,
}: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => countries.find((c) => c.code === value) || countries[0],
    [value],
  )

  const filtered = useMemo(
    () =>
      countries.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.code.toLowerCase().includes(search.toLowerCase()) ||
          c.dialCode.includes(search),
      ),
    [search],
  )

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus()
    }
  }, [isOpen])

  const inputId = label.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="space-y-1.5" ref={dropdownRef}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
          {label} {required && <span className="text-red-400" aria-hidden="true">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-slate-900/70 px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-1 focus:ring-offset-0 ${
            error
              ? 'border-red-500/50 focus:border-red-400/60 focus:ring-red-400/20'
              : 'border-slate-800 focus:border-cyan-400/60 focus:ring-cyan-400/20'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
        >
          <span className="flex items-center gap-2 truncate">
            <span className="text-base">{selected.flag || ''}</span>
            <span>{selected.name}</span>
            <span className="font-mono text-xs text-slate-500 hidden sm:inline">({selected.dialCode})</span>
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-500 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isOpen && !disabled && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full max-w-xs overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-2xl shadow-black/40">
            <div className="p-2 border-b border-slate-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search country..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-cyan-300/60 focus:outline-none"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {filtered.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => {
                    onChange(country)
                    setIsOpen(false)
                    setSearch('')
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    country.code === selected.code
                      ? 'bg-cyan-300/10 text-cyan-300'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                  role="option"
                  aria-selected={country.code === selected.code}
                >
                  <span className="text-base">{country.flag || ''}</span>
                  <span className="flex-1 text-left">{country.name}</span>
                  <span className="font-mono text-xs text-slate-500">{country.dialCode}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-sm text-slate-500">No countries found</p>
              )}
            </div>
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}