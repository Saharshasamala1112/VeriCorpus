import { FileText, Image, Music, Video, File } from 'lucide-react'

export type MediaType = 'text' | 'image' | 'audio' | 'video' | 'document'

export interface MediaConfig {
  type: MediaType
  label: string
  description: string
  icon: typeof FileText
  acceptedFormats: string[]
  acceptedMimeTypes: string[]
  maxFileSize: number // bytes
  allowMultiple: boolean
  color: string
  bgGradient: string
}

export const MEDIA_REGISTRY: Record<MediaType, MediaConfig> = {
  text: {
    type: 'text',
    label: 'Text Analysis',
    description:
      'Detect AI-generated text, plagiarism, and writing patterns across multiple languages.',
    icon: FileText,
    acceptedFormats: ['.txt', '.docx', '.pdf', '.rtf', '.md'],
    acceptedMimeTypes: [
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/markdown',
    ],
    maxFileSize: 5 * 1024 * 1024, // 5MB
    allowMultiple: false,
    color: 'cyan',
    bgGradient: 'from-cyan-400/10 to-cyan-600/5',
  },
  image: {
    type: 'image',
    label: 'Image Forensics',
    description: 'Analyze images for manipulation, deepfakes, and synthetic content.',
    icon: Image,
    acceptedFormats: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff'],
    acceptedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/bmp',
      'image/tiff',
    ],
    maxFileSize: 50 * 1024 * 1024, // 50MB
    allowMultiple: true,
    color: 'purple',
    bgGradient: 'from-purple-400/10 to-purple-600/5',
  },
  audio: {
    type: 'audio',
    label: 'Audio Analysis',
    description: 'Identify voice synthesis, cloning, and audio manipulation.',
    icon: Music,
    acceptedFormats: ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'],
    acceptedMimeTypes: [
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/flac',
      'audio/mp4',
      'audio/aac',
    ],
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowMultiple: true,
    color: 'emerald',
    bgGradient: 'from-emerald-400/10 to-emerald-600/5',
  },
  video: {
    type: 'video',
    label: 'Video Forensics',
    description: 'Detect deepfakes, face swaps, and video synthesis.',
    icon: Video,
    acceptedFormats: ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
    acceptedMimeTypes: [
      'video/mp4',
      'video/x-msvideo',
      'video/quicktime',
      'video/x-matroska',
      'video/webm',
    ],
    maxFileSize: 500 * 1024 * 1024, // 500MB
    allowMultiple: false,
    color: 'amber',
    bgGradient: 'from-amber-400/10 to-amber-600/5',
  },
  document: {
    type: 'document',
    label: 'Document Analysis',
    description: 'Examine documents for AI content, metadata anomalies, and authenticity.',
    icon: File,
    acceptedFormats: ['.pdf', '.docx', '.xlsx', '.pptx', '.txt'],
    acceptedMimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
    ],
    maxFileSize: 25 * 1024 * 1024, // 25MB
    allowMultiple: true,
    color: 'rose',
    bgGradient: 'from-rose-400/10 to-rose-600/5',
  },
}

export const MEDIA_TYPES = Object.keys(MEDIA_REGISTRY) as MediaType[]

export function getMediaConfig(type: MediaType): MediaConfig {
  return MEDIA_REGISTRY[type]
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function isAcceptedFile(file: File, config: MediaConfig): boolean {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  return config.acceptedFormats.includes(ext) || config.acceptedMimeTypes.includes(file.type)
}
