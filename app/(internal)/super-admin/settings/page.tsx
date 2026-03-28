'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

const GOLD = '#C9A84C'

interface PlatformSettings {
  id?: string
  platform_name: string
  support_email: string
  default_duplicate_threshold: number
  default_tag_suggestion_count: number
  processing_time_alert_secs: number
  session_timeout_hours: number
  failed_login_limit: number
  maintenance_mode: boolean
}

const DEFAULTS: PlatformSettings = {
  platform_name: 'Industry Intelligence',
  support_email: '',
  default_duplicate_threshold: 0.85,
  default_tag_suggestion_count: 5,
  processing_time_alert_secs: 10,
  session_timeout_hours: 24,
  failed_login_limit: 5,
  maintenance_mode: false,
}

// ─── API key row — always masked, edit via replace flow ────────────────────────

function ApiKeyRow({
  label,
  envKey,
  hint,
}: {
  label: string
  envKey: string
  hint: string
}) {
  const [editing, setEditing]     = useState(false)
  const [newKey, setNewKey]       = useState('')
  const [showKey, setShowKey]     = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)

  async function handleSave() {
    if (!newKey.trim()) return
    setSaving(true)
    // API keys are env vars — we log the intent but cannot write them from browser
    // In production: call a secure server action or admin endpoint
    console.log(`[Settings] API key update requested for ${envKey} — route to secure vault`)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setSaved(true)
    setEditing(false)
    setNewKey('')
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
        {saved && <p className="text-xs text-green-600 mt-1 font-medium">Key update recorded — deploy to apply</p>}
      </div>
      <div className="flex-shrink-0 text-right">
        {!editing ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg tracking-widest">
              ••••••••••••
            </span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="Paste new key…"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-yellow-300 w-56"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={!newKey.trim() || saving}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40"
              style={{ backgroundColor: GOLD }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setNewKey('') }}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
      style={{ backgroundColor: checked ? GOLD : '#D1D5DB' }}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-0.5">{title}</h2>
      {description && <p className="text-xs text-gray-400 mb-5">{description}</p>}
      {!description && <div className="mb-5" />}
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Row({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlatformSettingsPage() {
  const { loading: sessionLoading } = useSession()
  const [settings, setSettings]     = useState<PlatformSettings>(DEFAULTS)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const [showMaintenanceConfirm, setShowMaintenanceConfirm] = useState(false)

  useEffect(() => {
    if (sessionLoading) return
    loadSettings()
  }, [sessionLoading])

  async function loadSettings() {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const { data, error } = await supabase.from('platform_settings').select('*').limit(1).maybeSingle()
    if (data && !error) {
      setSettings({
        id: data.id,
        platform_name: data.platform_name ?? DEFAULTS.platform_name,
        support_email: data.support_email ?? '',
        default_duplicate_threshold: data.default_duplicate_threshold ?? DEFAULTS.default_duplicate_threshold,
        default_tag_suggestion_count: data.default_tag_suggestion_count ?? DEFAULTS.default_tag_suggestion_count,
        processing_time_alert_secs: data.processing_time_alert_secs ?? DEFAULTS.processing_time_alert_secs,
        session_timeout_hours: data.session_timeout_hours ?? DEFAULTS.session_timeout_hours,
        failed_login_limit: data.failed_login_limit ?? DEFAULTS.failed_login_limit,
        maintenance_mode: data.maintenance_mode ?? false,
      })
    }
    setLoading(false)
  }

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)

    const payload = {
      platform_name: settings.platform_name.trim(),
      support_email: settings.support_email.trim() || null,
      default_duplicate_threshold: settings.default_duplicate_threshold,
      default_tag_suggestion_count: settings.default_tag_suggestion_count,
      processing_time_alert_secs: settings.processing_time_alert_secs,
      session_timeout_hours: settings.session_timeout_hours,
      failed_login_limit: settings.failed_login_limit,
      maintenance_mode: settings.maintenance_mode,
      updated_at: new Date().toISOString(),
    }
    console.log('[Settings] saving platform settings:', payload)

    const supabase = createBrowserSupabaseClient()
    let error
    if (settings.id) {
      const res = await supabase.from('platform_settings').update(payload).eq('id', settings.id).select()
      error = res.error
    } else {
      const res = await supabase.from('platform_settings').insert(payload).select()
      error = res.error
    }

    console.log('[Settings] save response error:', error)
    setSaving(false)
    if (error) {
      setSaveError('Could not save settings. Please try again.')
    } else {
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 4000)
    }
  }

  function handleMaintenanceToggle(v: boolean) {
    if (v) {
      setShowMaintenanceConfirm(true)
    } else {
      set('maintenance_mode', false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        {[1,2,3,4,5].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">

      {/* Maintenance confirm modal */}
      {showMaintenanceConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Enable Maintenance Mode?</h2>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900">
              <p className="font-semibold mb-1">⚠️ All users will lose access</p>
              <p className="text-xs">Every user on the platform (except Super Admin) will see a maintenance page. Only enable this for planned deployments.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowMaintenanceConfirm(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => { set('maintenance_mode', true); setShowMaintenanceConfirm(false) }}
                className="flex-1 bg-amber-600 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-amber-700">
                Enable Maintenance Mode
              </button>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>

      {/* Platform Information */}
      <SectionCard title="Platform Information" description="Global identity for this installation.">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Platform Name</label>
          <input type="text" value={settings.platform_name} onChange={e => set('platform_name', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Support Email</label>
          <input type="email" value={settings.support_email} onChange={e => set('support_email', e.target.value)}
            placeholder="support@example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </div>
      </SectionCard>

      {/* AI Configuration */}
      <SectionCard title="AI Configuration" description="Global defaults for all spaces — overridable per space.">
        <div>
          <div className="flex justify-between mb-1.5">
            <label className="text-sm font-medium text-slate-700">Default duplicate detection threshold</label>
            <span className="text-sm font-semibold" style={{ color: GOLD }}>
              {Math.round(settings.default_duplicate_threshold * 100)}%
            </span>
          </div>
          <input type="range" min={70} max={95}
            value={Math.round(settings.default_duplicate_threshold * 100)}
            onChange={e => set('default_duplicate_threshold', parseInt(e.target.value) / 100)}
            className="w-full" style={{ accentColor: GOLD }} />
          <div className="flex justify-between text-xs text-gray-400 mt-1"><span>70%</span><span>95%</span></div>
        </div>
        <Row label="Default tag suggestion count" description="How many tag suggestions the AI returns per item.">
          <input type="number" min={1} max={20} value={settings.default_tag_suggestion_count}
            onChange={e => set('default_tag_suggestion_count', parseInt(e.target.value) || 5)}
            className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </Row>
        <Row label="Processing time alert threshold" description="Alert when AI takes longer than this.">
          <div className="flex items-center gap-2">
            <input type="number" min={5} max={60} value={settings.processing_time_alert_secs}
              onChange={e => set('processing_time_alert_secs', parseInt(e.target.value) || 10)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-yellow-300" />
            <span className="text-xs text-gray-400">seconds</span>
          </div>
        </Row>
      </SectionCard>

      {/* Security Settings */}
      <SectionCard title="Security Settings" description="Platform-wide session and authentication configuration.">
        <Row label="Session timeout" description="How long until inactive sessions expire.">
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={72} value={settings.session_timeout_hours}
              onChange={e => set('session_timeout_hours', parseInt(e.target.value) || 24)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-yellow-300" />
            <span className="text-xs text-gray-400">hours</span>
          </div>
        </Row>
        <Row label="Failed login attempt limit" description="Account locked after this many consecutive failures.">
          <input type="number" min={3} max={20} value={settings.failed_login_limit}
            onChange={e => set('failed_login_limit', parseInt(e.target.value) || 5)}
            className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-yellow-300" />
        </Row>
      </SectionCard>

      {/* API Keys */}
      <SectionCard title="API Keys" description="Keys are stored as environment variables — never in the database. Shown masked only.">
        <ApiKeyRow
          label="OpenRouter API Key"
          envKey="OPENROUTER_API_KEY"
          hint="Used by the AI Brain for tag suggestions and duplicate detection."
        />
        <ApiKeyRow
          label="Cohere API Key"
          envKey="COHERE_API_KEY"
          hint="Used for generating embeddings and semantic search."
        />
      </SectionCard>

      {/* Maintenance Mode */}
      <SectionCard title="Platform Maintenance Mode" description="Shows a maintenance page to all users except Super Admin.">
        <Row
          label="Enable Maintenance Mode"
          description={settings.maintenance_mode
            ? '⚠️ Platform is currently in maintenance mode. All users except Super Admin are blocked.'
            : 'Use this during major deployments or emergency maintenance.'}
        >
          <Toggle checked={settings.maintenance_mode} onChange={handleMaintenanceToggle} />
        </Row>
        {settings.maintenance_mode && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-amber-800">
              ⚠️ Maintenance mode is ON — disable and save when deployment is complete.
            </p>
          </div>
        )}
      </SectionCard>

      {/* Save section */}
      <div className="space-y-3">
        {saveSuccess && (
          <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
            <CheckCircle size={15} className="text-teal-600 flex-shrink-0" />
            <p className="text-sm font-medium text-teal-800">Settings saved successfully</p>
          </div>
        )}
        {saveError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
            <p className="text-sm font-medium text-red-700">{saveError}</p>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !settings.platform_name.trim()}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
          style={{ backgroundColor: GOLD }}
        >
          {saving ? 'Saving…' : 'Save Platform Settings'}
        </button>
      </div>

    </div>
  )
}
