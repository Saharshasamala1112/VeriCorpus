import { Languages } from 'lucide-react'
import Select from '../ui/Select'
import { SUPPORTED_LANGUAGES } from '../../store/language'

interface LanguageSelectorProps {
  value: string
  onChange: (code: string) => void
}

export default function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const options = SUPPORTED_LANGUAGES.map((lang) => ({
    value: lang.code,
    label: lang.label,
  }))

  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-slate-500" />
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder="Language"
        className="w-40"
      />
    </div>
  )
}
