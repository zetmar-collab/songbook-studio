import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ToastState } from './Toast'

interface Props {
  onClose: () => void
  onLanguage: (lng: string) => void
  onThemeChanged: (dark: boolean) => void
  showToast: (t: ToastState) => void
}

type ThemeSource = 'system' | 'light' | 'dark'

function fmtTokens(n: number): string {
  if (!n) return '?'
  if (n >= 1000) return Math.round(n / 1000) + 'k'
  return String(n)
}

export default function SettingsModal({
  onClose,
  onLanguage,
  onThemeChanged,
  showToast
}: Props): JSX.Element {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [theme, setTheme] = useState<ThemeSource>('system')
  const [testing, setTesting] = useState(false)
  const [version, setVersion] = useState('')
  const [updateMsg, setUpdateMsg] = useState('')
  const [freeModels, setFreeModels] = useState<
    { id: string; name: string; context: number; maxOutput: number }[]
  >([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsMsg, setModelsMsg] = useState('')

  useEffect(() => {
    window.api.settings.getAll().then((s) => {
      setSettings(s)
      setTheme((s.theme as ThemeSource) || 'system')
    })
    window.api.update.version().then(setVersion)
    const unsub = window.api.update.onStatus((p) => {
      const state = p.state as string
      if (state === 'checking') setUpdateMsg(t('update.checking'))
      else if (state === 'available') setUpdateMsg(t('update.available', { version: p.version }))
      else if (state === 'progress') setUpdateMsg(t('update.progress', { percent: p.percent }))
      else if (state === 'downloaded') setUpdateMsg(t('update.downloaded', { version: p.version }))
      else if (state === 'none') setUpdateMsg(t('update.none'))
      else if (state === 'dev') setUpdateMsg(t('update.dev'))
      else if (state === 'error') setUpdateMsg(t('update.error', { message: p.message }))
    })
    return unsub
  }, [t])

  const checkUpdate = async (): Promise<void> => {
    setUpdateMsg(t('update.checking'))
    const res = await window.api.update.check()
    if (res.state === 'dev') setUpdateMsg(t('update.dev'))
    else if (res.state === 'error') setUpdateMsg(t('update.error', { message: res.message }))
  }

  const setField = (key: string, value: string): void => {
    setSettings((s) => ({ ...s, [key]: value }))
    window.api.settings.set(key, value)
  }

  const changeTheme = async (value: ThemeSource): Promise<void> => {
    setTheme(value)
    const dark = await window.api.theme.set(value)
    onThemeChanged(dark)
  }

  const provider = settings.ai_provider || 'openrouter'

  const loadModels = async (key: string): Promise<void> => {
    setModelsLoading(true)
    setModelsMsg('')
    try {
      const models = await window.api.ai.openrouterModels(key)
      setFreeModels(models)
      setModelsMsg(t('settings.modelsLoaded', { count: models.length }))
    } catch (e) {
      setModelsMsg(t('settings.modelsError', { message: e instanceof Error ? e.message : String(e) }))
    } finally {
      setModelsLoading(false)
    }
  }

  // Automatycznie pobierz darmowe modele po wpisaniu/wklejeniu klucza (z debounce)
  const orKey = settings.openrouter_api_key || ''
  useEffect(() => {
    if (provider !== 'openrouter' || !orKey.trim()) return
    const id = window.setTimeout(() => loadModels(orKey), 700)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orKey, provider])

  const createBackup = async (): Promise<void> => {
    try {
      const res = await window.api.backup.create()
      if (res.canceled) return
      showToast({ message: t('backup.created', { path: res.filePath }), duration: 6000 })
    } catch (e) {
      showToast({ message: String(e instanceof Error ? e.message : e), type: 'error' })
    }
  }

  const chooseBackupDir = async (): Promise<void> => {
    const res = await window.api.backup.chooseDir()
    if (res.canceled) return
    setSettings((s) => ({ ...s, backup_dir: res.dir }))
    showToast({ message: t('backup.folderSet', { path: res.dir }) })
  }

  const resetBackupDir = async (): Promise<void> => {
    await window.api.backup.resetDir()
    setSettings((s) => ({ ...s, backup_dir: '' }))
  }

  const restoreBackup = async (): Promise<void> => {
    if (!confirm(t('backup.restoreConfirm'))) return
    try {
      const res = await window.api.backup.restore()
      if (res.canceled) return
      // przeładuj, aby odświeżyć całą listę utworów z nowej bazy
      window.location.reload()
    } catch (e) {
      showToast({ message: String(e instanceof Error ? e.message : e), type: 'error' })
    }
  }

  const testAi = async (): Promise<void> => {
    setTesting(true)
    const res = await window.api.ai.test()
    setTesting(false)
    if (res.ok) showToast({ message: t('settings.testOk') })
    else showToast({ message: t('settings.testFail', { message: res.message }), type: 'error', duration: 6000 })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">⚙️ {t('settings.title')}</div>
        <div className="modal-body">
          <div className="field">
            <label>{t('settings.language')}</label>
            <div className="seg">
              <button
                className={i18n.language === 'pl' ? 'active' : ''}
                onClick={() => onLanguage('pl')}
              >
                🇵🇱 Polski
              </button>
              <button
                className={i18n.language === 'en' ? 'active' : ''}
                onClick={() => onLanguage('en')}
              >
                🇬🇧 English
              </button>
            </div>
          </div>

          <div className="field">
            <label>{t('settings.theme')}</label>
            <div className="seg">
              {(['system', 'light', 'dark'] as ThemeSource[]).map((tm) => (
                <button
                  key={tm}
                  className={theme === tm ? 'active' : ''}
                  onClick={() => changeTheme(tm)}
                >
                  {t(`settings.theme${tm.charAt(0).toUpperCase() + tm.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>{t('settings.aiProvider')}</label>
            <div className="seg">
              <button
                className={provider === 'openrouter' ? 'active' : ''}
                onClick={() => setField('ai_provider', 'openrouter')}
              >
                OpenRouter
              </button>
              <button
                className={provider === 'gemini' ? 'active' : ''}
                onClick={() => setField('ai_provider', 'gemini')}
              >
                Google Gemini
              </button>
            </div>
          </div>

          {provider === 'openrouter' ? (
            <>
              <div className="field">
                <label>{t('settings.openrouterKey')}</label>
                <input
                  type="password"
                  value={settings.openrouter_api_key || ''}
                  onChange={(e) => setField('openrouter_api_key', e.target.value)}
                  placeholder="sk-or-…"
                />
              </div>
              <div className="field">
                <label>{t('settings.openrouterModel')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    style={{ flex: 1 }}
                    value={settings.openrouter_model || ''}
                    onChange={(e) => setField('openrouter_model', e.target.value)}
                    disabled={freeModels.length === 0}
                  >
                    {freeModels.length === 0 ? (
                      <option value="">{t('settings.modelsNone')}</option>
                    ) : (
                      <>
                        {!freeModels.some((m) => m.id === settings.openrouter_model) &&
                          settings.openrouter_model && (
                            <option value={settings.openrouter_model}>
                              {settings.openrouter_model}
                            </option>
                          )}
                        {freeModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — {fmtTokens(m.context)} ctx
                            {m.maxOutput ? ` / ${fmtTokens(m.maxOutput)} out` : ''}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <button
                    className="btn"
                    onClick={() => loadModels(settings.openrouter_api_key || '')}
                    disabled={modelsLoading}
                    title={t('settings.fetchModels')}
                  >
                    {modelsLoading ? '…' : '🔄'}
                  </button>
                </div>
                {modelsMsg && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    {modelsMsg}
                  </div>
                )}
                <input
                  style={{ marginTop: 6 }}
                  value={settings.openrouter_model || ''}
                  onChange={(e) => setField('openrouter_model', e.target.value)}
                  placeholder={t('settings.modelManual')}
                />
                <div className="hint" style={{ marginTop: 6 }}>
                  ℹ️ {t('settings.modelLimitsHint')}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>{t('settings.geminiKey')}</label>
                <input
                  type="password"
                  value={settings.gemini_api_key || ''}
                  onChange={(e) => setField('gemini_api_key', e.target.value)}
                  placeholder="AIza…"
                />
              </div>
              <div className="field">
                <label>{t('settings.geminiModel')}</label>
                <input
                  value={settings.gemini_model || ''}
                  onChange={(e) => setField('gemini_model', e.target.value)}
                  placeholder="gemini-2.0-flash"
                />
              </div>
            </>
          )}

          <div className="hint">🔒 {t('settings.keyHint')}</div>
          <button className="btn" onClick={testAi} disabled={testing}>
            {testing ? t('settings.testing') : '🔌 ' + t('settings.testAi')}
          </button>

          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label>💾 {t('backup.title')}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={createBackup}>
                ⬆ {t('backup.create')}
              </button>
              <button className="btn" onClick={restoreBackup}>
                ⬇ {t('backup.restore')}
              </button>
              <button className="btn" onClick={() => window.api.backup.openFolder()}>
                📂 {t('backup.openFolder')}
              </button>
            </div>
            <div className="seg" style={{ marginTop: 10 }}>
              <button
                className={(settings.auto_backup || 'on') !== 'off' ? 'active' : ''}
                onClick={() => setField('auto_backup', 'on')}
              >
                {t('backup.autoOn')}
              </button>
              <button
                className={settings.auto_backup === 'off' ? 'active' : ''}
                onClick={() => setField('auto_backup', 'off')}
              >
                {t('backup.autoOff')}
              </button>
            </div>
            <div style={{ marginTop: 10 }}>
              <div className="hint" style={{ marginBottom: 4 }}>
                {t('backup.folderLabel')}:
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  readOnly
                  value={settings.backup_dir || t('backup.folderDefault')}
                  style={{ flex: 1, fontSize: 12 }}
                  title={settings.backup_dir || ''}
                />
                <button className="btn" onClick={chooseBackupDir}>
                  📁 {t('backup.chooseDir')}
                </button>
                {settings.backup_dir && (
                  <button className="btn" onClick={resetBackupDir} title={t('backup.resetDir')}>
                    ↺
                  </button>
                )}
              </div>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              {t('backup.hint')}
            </div>
          </div>

          <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label>⬆ {t('update.title')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn" onClick={checkUpdate}>
                🔄 {t('update.check')}
              </button>
              <span className="hint">v{version}</span>
            </div>
            {updateMsg && (
              <div className="hint" style={{ marginTop: 8 }}>
                {updateMsg}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
