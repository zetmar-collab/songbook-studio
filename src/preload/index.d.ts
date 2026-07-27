import type { Api } from './index'

export interface Song {
  id: number
  title: string
  artist: string
  key: string
  tags: string
  lyrics: string
  chords: string
  notes: string
  is_favorite: number
  created_at: string
  updated_at: string
}

export interface Version {
  id: number
  song_id: number
  lyrics: string
  chords: string
  label: string
  created_at: string
}

export interface VoiceNote {
  id: number
  song_id: number
  file_path: string
  title: string
  duration: number
  created_at: string
}

declare global {
  interface Window {
    api: Api
  }
}
