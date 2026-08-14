import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ToastState } from './Toast'

interface Props {
  content: string
  provider: string
  model: string
  onClose: () => void
  showToast: (t: ToastState) => void
}

/**
 * Zgłaszanie nieodpowiednich treści wygenerowanych przez AI.
 * Wymagane przez politykę Sklepu Microsoft 11.16 (Live Generative AI Content).
 *
 * Nic nie jest wysyłane automatycznie — użytkownik widzi dokładnie, co zostanie
 * przekazane, i sam wysyła wiadomość ze swojego klienta poczty.
 */
export default function ReportAiModal({
  content,
  provider,
  model,
  onClose,
  showToast
}: Props): JSX.Element {
  const { t } = useTranslation()
  const [description, setDescription] = useState('')
  const [sending, setSending] = useState(false)

  const sendEmail = async (): Promise<void> => {
    setSending(true)
    try {
      await window.api.report.ai({ description, content, provider, model })
      showToast({ message: t('report.opened'), duration: 6000 })
      onClose()
    } catch (e) {
      showToast({ message: String(e instanceof Error ? e.message : e), type: 'error' })
    } finally {
      setSending(false)
    }
  }

  const openIssues = async (): Promise<void> => {
    await window.api.report.issues()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">⚠️ {t('report.title')}</div>
        <div className="modal-body">
          <div className="hint">{t('report.intro')}</div>

          <div className="field">
            <label>{t('report.describe')}</label>
            <textarea
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
              placeholder={t('report.describePlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            <label>{t('report.included')}</label>
            <pre className="report-preview">{content || t('report.noContent')}</pre>
            <div className="hint" style={{ marginTop: 6 }}>
              {t('report.providerLine', {
                provider: provider || '—',
                model: model || '—'
              })}
            </div>
          </div>

          <div className="hint">🔒 {t('report.privacy')}</div>
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={openIssues}>
            🐙 {t('report.github')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('report.cancel')}
          </button>
          <button className="btn btn-primary" onClick={sendEmail} disabled={sending}>
            ✉️ {t('report.send')}
          </button>
        </div>
      </div>
    </div>
  )
}
