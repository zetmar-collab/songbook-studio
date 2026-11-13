import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VoiceMarker, VoiceNote } from '../../../shared/types'
import type { ToastState } from './Toast'
import { errorMessage, formatTime } from '../lib/format'

interface Props {
  songId: number
  showToast: (t: ToastState) => void
}

export default function VoiceNotes({ songId, showToast }: Props): JSX.Element {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<VoiceNote[]>([])
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const mountedRef = useRef(true)
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map())

  const load = useCallback(async (): Promise<void> => {
    try {
      const list = await window.api.voice.list(songId)
      if (mountedRef.current) setNotes(list)
    } catch (e) {
      if (mountedRef.current) showToast({ message: errorMessage(e), type: 'error' })
    }
  }, [songId, showToast])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
      if (timerRef.current) window.clearInterval(timerRef.current)
      // Zamknięcie zakładki w trakcie nagrywania: zatrzymujemy mikrofon, a nagranie, które już jest, zapisujemy.
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') rec.stop()
      else streamRef.current?.getTracks().forEach((tr) => tr.stop())
    }
  }, [load])

  const startRecording = async (): Promise<void> => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      showToast({ message: t('voice.micError'), type: 'error' })
      return
    }
    if (!mountedRef.current) {
      stream.getTracks().forEach((tr) => tr.stop())
      return
    }
    streamRef.current = stream
    const recorder = new MediaRecorder(stream)
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop())
      streamRef.current = null
      recorderRef.current = null
      const chunks = chunksRef.current
      chunksRef.current = []
      if (chunks.length === 0) return
      try {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        const duration = (Date.now() - startRef.current) / 1000
        await window.api.voice.save(songId, await blob.arrayBuffer(), new Date().toLocaleString(), duration)
        if (mountedRef.current) await load()
      } catch (e) {
        showToast({ message: errorMessage(e), type: 'error' })
      }
    }
    recorder.start()
    recorderRef.current = recorder
    startRef.current = Date.now()
    setRecording(true)
    setElapsed(0)
    timerRef.current = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      250
    )
  }

  const stopRecording = (): void => {
    recorderRef.current?.stop()
    setRecording(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
  }

  const patch = async (
    id: number,
    changes: { title?: string; note?: string; markers?: VoiceMarker[] }
  ): Promise<void> => {
    try {
      const updated = await window.api.voice.update(id, changes)
      if (mountedRef.current) setNotes((list) => list.map((n) => (n.id === id ? updated : n)))
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  const deleteNote = async (id: number): Promise<void> => {
    if (!confirm(t('voice.deleteConfirm'))) return
    try {
      await window.api.voice.delete(id)
      await load()
    } catch (e) {
      showToast({ message: errorMessage(e), type: 'error' })
    }
  }

  return (
    <div>
      <div className="voice-controls">
        {!recording ? (
          <button className="btn btn-primary" onClick={() => void startRecording()}>
            ⏺ {t('voice.record')}
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stopRecording}>
            <span className="rec-dot" /> {t('voice.stop')} · {t('voice.recording', { time: formatTime(elapsed) })}
          </button>
        )}
      </div>

      {notes.length === 0 && <div className="empty-hint">{t('voice.empty')}</div>}

      {notes.map((n) => (
        <VoiceItem
          key={n.id}
          note={n}
          registerAudio={(el) => {
            if (el) audioRefs.current.set(n.id, el)
            else audioRefs.current.delete(n.id)
          }}
          getAudio={() => audioRefs.current.get(n.id)}
          onPatch={(changes) => void patch(n.id, changes)}
          onDelete={() => void deleteNote(n.id)}
        />
      ))}
    </div>
  )
}

function VoiceItem({
  note,
  registerAudio,
  getAudio,
  onPatch,
  onDelete
}: {
  note: VoiceNote
  registerAudio: (el: HTMLAudioElement | null) => void
  getAudio: () => HTMLAudioElement | undefined
  onPatch: (changes: { title?: string; note?: string; markers?: VoiceMarker[] }) => void
  onDelete: () => void
}): JSX.Element {
  const { t } = useTranslation()
  const [title, setTitle] = useState(note.title)
  const [text, setText] = useState(note.note)
  const [markerLabel, setMarkerLabel] = useState('')

  const addMarker = (): void => {
    const audio = getAudio()
    const at = audio ? Math.round(audio.currentTime * 10) / 10 : 0
    const label = markerLabel.trim() || t('voice.markerDefault', { n: note.markers.length + 1 })
    const markers = [...note.markers, { t: at, label }].sort((a, b) => a.t - b.t)
    onPatch({ markers })
    setMarkerLabel('')
  }

  const seek = (to: number): void => {
    const audio = getAudio()
    if (!audio) return
    audio.currentTime = to
    void audio.play().catch(() => undefined)
  }

  return (
    <div className="voice-card">
      <div className="voice-item">
        <input
          className="voice-title-input"
          aria-label={t('voice.titlePlaceholder')}
          value={title}
          placeholder={t('voice.titlePlaceholder')}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== note.title && onPatch({ title: title.trim() })}
        />
        <span className="hint">{formatTime(note.duration)}</span>
        <button className="btn btn-danger" title={t('voice.delete')} aria-label={t('voice.delete')} onClick={onDelete}>
          🗑
        </button>
      </div>
      <audio ref={registerAudio} controls preload="metadata" src={window.api.voice.url(note.id)} />
      <div className="voice-markers">
        {note.markers.map((m, i) => (
          <span className="marker-chip" key={`${m.t}-${i}`}>
            <button onClick={() => seek(m.t)} title={t('voice.seek')}>
              ▶ {formatTime(m.t)} · {m.label}
            </button>
            <button
              aria-label={t('voice.removeMarker')}
              onClick={() => onPatch({ markers: note.markers.filter((_, j) => j !== i) })}
            >
              ✕
            </button>
          </span>
        ))}
        <span className="marker-add">
          <input
            aria-label={t('voice.markerLabel')}
            placeholder={t('voice.markerLabel')}
            value={markerLabel}
            onChange={(e) => setMarkerLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addMarker()}
          />
          <button className="btn" onClick={addMarker}>
            📍 {t('voice.addMarker')}
          </button>
        </span>
      </div>
      <textarea
        className="voice-note-text"
        rows={2}
        aria-label={t('voice.noteText')}
        placeholder={t('voice.noteText')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== note.note && onPatch({ note: text })}
      />
    </div>
  )
}
