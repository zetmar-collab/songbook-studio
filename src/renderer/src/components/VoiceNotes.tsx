import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { VoiceNote } from '../../../preload/index.d'
import type { ToastState } from './Toast'

interface Props {
  songId: number
  showToast: (t: ToastState) => void
}

export default function VoiceNotes({ songId, showToast }: Props): JSX.Element {
  const { t } = useTranslation()
  const [notes, setNotes] = useState<VoiceNote[]>([])
  const [urls, setUrls] = useState<Record<number, string>>({})
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startRef = useRef(0)
  const timerRef = useRef<number | null>(null)

  const load = async (): Promise<void> => {
    const list: VoiceNote[] = await window.api.voice.list(songId)
    setNotes(list)
    const map: Record<number, string> = {}
    for (const n of list) {
      const buf: ArrayBuffer = await window.api.voice.read(n.id)
      map[n.id] = URL.createObjectURL(new Blob([buf], { type: 'audio/webm' }))
    }
    setUrls((prev) => {
      Object.values(prev).forEach((u) => URL.revokeObjectURL(u))
      return map
    })
  }

  useEffect(() => {
    load()
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId])

  const startRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      recorder.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const duration = (Date.now() - startRef.current) / 1000
        const buf = await blob.arrayBuffer()
        const title = new Date().toLocaleString()
        await window.api.voice.save(songId, buf, title, duration)
        await load()
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
    } catch {
      showToast({ message: t('voice.micError'), type: 'error' })
    }
  }

  const stopRecording = (): void => {
    recorderRef.current?.stop()
    setRecording(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
  }

  const deleteNote = async (id: number): Promise<void> => {
    await window.api.voice.delete(id)
    await load()
  }

  const fmt = (s: number): string => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div>
      <div className="voice-controls">
        {!recording ? (
          <button className="btn btn-primary" onClick={startRecording}>
            ⏺ {t('voice.record')}
          </button>
        ) : (
          <button className="btn btn-danger" onClick={stopRecording}>
            <span className="rec-dot" /> {t('voice.stop')} ·{' '}
            {t('voice.recording', { time: fmt(elapsed) })}
          </button>
        )}
      </div>

      {notes.length === 0 && <div className="empty-hint">{t('voice.empty')}</div>}

      {notes.map((n) => (
        <div className="voice-item" key={n.id}>
          <span className="voice-item-title">🎙 {n.title}</span>
          <span className="hint">{fmt(n.duration)}</span>
          {urls[n.id] && <audio controls src={urls[n.id]} />}
          <button
            className="btn btn-danger"
            title={t('voice.delete')}
            onClick={() => deleteNote(n.id)}
          >
            🗑
          </button>
        </div>
      ))}
    </div>
  )
}
