import { useState, useRef, useCallback, type DragEvent } from 'react'
import { Upload, X, FileIcon, AlertCircle, RotateCw } from 'lucide-react'
import { Button, Progress } from '../ui'
import { type MediaConfig, formatFileSize, isAcceptedFile } from '../../config/media-registry'

interface FileEntry {
  file: File
  id: string
  progress: number
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

interface MediaUploaderProps {
  config: MediaConfig
  onFilesReady: (files: File[]) => void
  disabled?: boolean
}

export default function MediaUploader({ config, onFilesReady, disabled }: MediaUploaderProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming)
      const valid: FileEntry[] = []

      for (const file of list) {
        if (!isAcceptedFile(file, config)) {
          continue
        }
        if (file.size > config.maxFileSize) {
          continue
        }
        valid.push({
          file,
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          progress: 0,
          status: 'pending',
        })
      }

      if (!config.allowMultiple) {
        setFiles(valid.slice(0, 1))
      } else {
        setFiles((prev) => [...prev, ...valid])
      }
    },
    [config],
  )

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }

  const startAnalysis = () => {
    const readyFiles = files.filter((f) => f.status === 'pending').map((f) => f.file)
    if (readyFiles.length === 0) return
    setFiles((prev) =>
      prev.map((f) =>
        f.status === 'pending' ? { ...f, status: 'uploading' as const, progress: 60 } : f,
      ),
    )
    setTimeout(() => {
      setFiles((prev) =>
        prev.map((f) =>
          f.status === 'uploading' ? { ...f, status: 'complete' as const, progress: 100 } : f,
        ),
      )
      onFilesReady(readyFiles)
    }, 800)
  }

  const colorBorder: Record<string, string> = {
    cyan: 'border-cyan-400/30',
    purple: 'border-purple-400/30',
    emerald: 'border-emerald-400/30',
    amber: 'border-amber-400/30',
    rose: 'border-rose-400/30',
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all ${
          dragOver
            ? `${colorBorder[config.color]} bg-slate-800/30`
            : 'border-slate-800 bg-slate-900/30 hover:border-slate-700 hover:bg-slate-800/20'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
        aria-label={`Upload ${config.label}`}
      >
        <div
          className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/50`}
        >
          <Upload className="h-5 w-5 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-white">
          {dragOver ? 'Drop files here' : 'Drag & drop or click to upload'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {config.acceptedFormats.join(', ')} — Max {formatFileSize(config.maxFileSize)}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={config.acceptedMimeTypes.join(',')}
        multiple={config.allowMultiple}
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3"
            >
              <FileIcon className="h-5 w-5 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{entry.file.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">
                    {formatFileSize(entry.file.size)}
                  </span>
                  {entry.status === 'uploading' && (
                    <Progress value={entry.progress} size="sm" className="flex-1" />
                  )}
                  {entry.status === 'complete' && (
                    <span className="text-[11px] text-emerald-400">Ready</span>
                  )}
                  {entry.status === 'error' && (
                    <span className="flex items-center gap-1 text-[11px] text-red-400">
                      <AlertCircle className="h-3 w-3" /> {entry.error || 'Failed'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {entry.status === 'error' && (
                  <button
                    onClick={() => removeFile(entry.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
                    aria-label="Retry"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => removeFile(entry.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          <Button
            onClick={startAnalysis}
            disabled={files.every((f) => f.status !== 'pending')}
            className="w-full"
          >
            Analyze {files.filter((f) => f.status === 'pending').length || ''}{' '}
            {files.filter((f) => f.status === 'pending').length === 1 ? 'file' : 'files'}
          </Button>
        </div>
      )}
    </div>
  )
}
