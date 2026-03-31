'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

interface SpaceSettings {
  require_second_review_for_critical: boolean
  auto_reject_under_chars: number
  expected_turnaround_hours: number
  duplicate_threshold: number
  related_coverage_threshold: number
  processing_time_alert_seconds: number
  notify_pending_approvals_above: number
  notify_inbox_above: number
  weekly_digest: boolean
}

const DEFAULTS: SpaceSettings = {
  require_second_review_for_critical: false,
  auto_reject_under_chars: 0,
  expected_turnaround_hours: 24,
  duplicate_threshold: 0.85,
  related_coverage_threshold: 0.50,
  processing_time_alert_seconds: 10,
  notify_pending_approvals_above: 5,
  notify_inbox_above: 20,
  weekly_digest: true,
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-teal-500' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
    </button>
  )
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <h2 className="text-base font-semibold text-slate-800 mb-0.5">{title}</h2>
      {description && <p className="text-xs text-gray-400 mb-5">{description}</p>}
      {!description && <div className="mb-5" />}
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
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

export default function SettingsPage() {
  const { user: currentUser, loading: sessionLoading } = useSession()
  const [spaceName, setSpaceName] = useState('')
  const [spaceDescription, setSpaceDescription] = useState('')
  const [settings, setSettings] = useState<SpaceSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [spaceSaving, setSpaceSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [spaceSaveSuccess, setSpaceSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [spaceSaveError, setSpaceSaveError] = useState<string | null>(null)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [deactivateRequested, setDeactivateRequested] = useState(false)

  useEffect(() => {
    if (sessionLoading || !currentUser) return
    load()
  }, [sessionLoading, currentUser])

  async function load() {
    setLoading(true)
    const supabase = createBrowserSupabaseClient()
    const spaceId = currentUser!.space_id!
    try {
      const [{ data: space }, { data: settingsData }] = await Promise.all([
        supabase.from('industry_spaces').select('name, description').eq('id', spaceId).single(),
        supabase.from('space_settings').select('*').eq('space_id', spaceId).maybeSingle(),
      ])
      if (space) {
        setSpaceName(space.name ?? '')
        setSpaceDescription(space.description ?? '')
      }
      if (settingsData) {
        setSettings({
          require_second_review_for_critical: settingsData.require_second_review_for_critical ?? DEFAULTS.require_second_review_for_critical,
          auto_reject_under_chars: settingsData.auto_reject_under_chars ?? DEFAULTS.auto_reject_under_chars,
          expected_turnaround_hours: settingsData.expected_turnaround_hours ?? DEFAULTS.expected_turnaround_hours,
          duplicate_threshold: settingsData.duplicate_threshold ?? DEFAULTS.duplicate_threshold,
          related_coverage_threshold: settingsData.related_coverage_threshold ?? DEFAULTS.related_coverage_threshold,
          processing_time_alert_seconds: settingsData.processing_time_alert_seconds ?? DEFAULTS.processing_time_alert_seconds,
          notify_pending_approvals_above: settingsData.notify_pending_approvals_above ?? DEFAULTS.notify_pending_approvals_above,
          notify_inbox_above: settingsData.notify_inbox_above ?? DEFAULTS.notify_inbox_above,
          weekly_digest: settingsData.weekly_digest ?? DEFAULTS.weekly_digest,
        })
      }
    } catch (e) {
      console.error('[Settings] load error:', e)
    } finally {
      setLoading(false)
    }
  }

  async function saveSpaceInfo() {
    if (!spaceName.trim()) return
    setSpaceSaving(true)
    setSpaceSaveSuccess(false)
    setSpaceSaveError(null)

    const payload = {
      name: spaceName.trim(),
      description: spaceDescription.trim() || null,
    }
    const { data, error: e } = await createBrowserSupabaseClient()
      .from('industry_spaces')
      .update(payload)
      .eq('id', currentUser!.space_id!)
      .select('id, name, description')

    setSpaceSaving(false)

    if (e) {
      console.error('[Settings] saveSpaceInfo error:', e)
      setSpaceSaveError('Could not save settings. Please try again.')
      return
    }

    if (!data || data.length === 0) {
      console.warn('[Settings] saveSpaceInfo: UPDATE matched 0 rows — likely an RLS policy is blocking the write. Check Supabase policies for industry_spaces.')
      setSpaceSaveError('Could not save settings. Please try again.')
      return
    }

    setSpaceSaveSuccess(true)
    setTimeout(() => setSpaceSaveSuccess(false), 4000)
  }

  function set<K extends keyof SpaceSettings>(key: K, value: SpaceSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function saveSettings() {
    setSaving(true)
    setSaveSuccess(false)
    setSaveError(null)

    const payload = {
      space_id: currentUser!.space_id!,
      ...settings,
      updated_at: new Date().toISOString(),
    }
    const { data, error: e } = await createBrowserSupabaseClient()
      .from('space_settings')
      .upsert(payload, { onConflict: 'space_id' })
      .select()

    setSaving(false)

    if (e) {
      console.error('[Settings] saveSettings error:', e)
      setSaveError('Could not save settings. Please try again.')
      return
    }

    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 4000)
  }

  if (sessionLoading || (loading && currentUser)) {
    return (
      <div className="p-8 max-w-2xl space-y-6">
        {[1,2,3,4].map(i => <div key={i} className="h-40 bg-gray-100 rounded-2xl animate-pulse" />)}
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

      <div className="space-y-6">

        {/* Space Information */}
        <SectionCard title="Space Information" description="Update your space name and description.">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Space Name</label>
            <input type="text" value={spaceName} onChange={e => setSpaceName(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={spaceDescription} onChange={e => setSpaceDescription(e.target.value)} rows={3}
              placeholder="Brief description of this industry space…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </div>
          {spaceSaveSuccess && (
            <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
              <CheckCircle size={15} className="text-teal-600 flex-shrink-0" />
              <p className="text-sm font-medium text-teal-800">Settings saved successfully</p>
            </div>
          )}
          {spaceSaveError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0" />
              <p className="text-sm font-medium text-red-700">{spaceSaveError}</p>
            </div>
          )}
          <button onClick={saveSpaceInfo} disabled={spaceSaving || !spaceName.trim()}
            className="bg-teal-600 text-white text-sm font-semibold px-5 py-2 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {spaceSaving ? 'Saving…' : 'Save Space Info'}
          </button>
        </SectionCard>

        {/* Workflow Settings */}
        <SectionCard title="Workflow Settings" description="Control how content moves through your editorial pipeline.">
          <SettingRow label="Require second editor review for Critical items">
            <Toggle checked={settings.require_second_review_for_critical} onChange={v => set('require_second_review_for_critical', v)} />
          </SettingRow>
          <SettingRow label="Auto-reject submissions under N characters" description="Set to 0 to disable.">
            <input type="number" min={0} value={settings.auto_reject_under_chars}
              onChange={e => set('auto_reject_under_chars', parseInt(e.target.value) || 0)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </SettingRow>
          <SettingRow label="Expected submission turnaround" description="Hours from submission to editorial decision.">
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={settings.expected_turnaround_hours}
                onChange={e => set('expected_turnaround_hours', parseInt(e.target.value) || 24)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300" />
              <span className="text-xs text-gray-400">hours</span>
            </div>
          </SettingRow>
        </SectionCard>

        {/* AI Brain Thresholds */}
        <SectionCard title="AI Brain Thresholds" description="Tune how sensitive the AI Brain is for your content.">
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-700">Duplicate detection threshold</label>
              <span className="text-sm font-semibold text-teal-700">{Math.round(settings.duplicate_threshold * 100)}%</span>
            </div>
            <input type="range" min={70} max={95} value={Math.round(settings.duplicate_threshold * 100)}
              onChange={e => set('duplicate_threshold', parseInt(e.target.value) / 100)}
              className="w-full accent-teal-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>70%</span><span>95%</span></div>
          </div>
          <div>
            <div className="flex justify-between mb-1.5">
              <label className="text-sm font-medium text-slate-700">Related coverage threshold</label>
              <span className="text-sm font-semibold text-teal-700">{Math.round(settings.related_coverage_threshold * 100)}%</span>
            </div>
            <input type="range" min={30} max={70} value={Math.round(settings.related_coverage_threshold * 100)}
              onChange={e => set('related_coverage_threshold', parseInt(e.target.value) / 100)}
              className="w-full accent-teal-600" />
            <div className="flex justify-between text-xs text-gray-400 mt-1"><span>30%</span><span>70%</span></div>
          </div>
          <SettingRow label="Processing time alert" description="Alert when AI processing exceeds this time.">
            <div className="flex items-center gap-2">
              <input type="number" min={5} max={60} value={settings.processing_time_alert_seconds}
                onChange={e => set('processing_time_alert_seconds', parseInt(e.target.value) || 10)}
                className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300" />
              <span className="text-xs text-gray-400">seconds</span>
            </div>
          </SettingRow>
        </SectionCard>

        {/* Notification Preferences */}
        <SectionCard title="Notification Preferences" description="Set when you want to be notified by email.">
          <SettingRow label="Email when pending approvals exceed" description="Number of pending users that triggers an alert.">
            <input type="number" min={1} value={settings.notify_pending_approvals_above}
              onChange={e => set('notify_pending_approvals_above', parseInt(e.target.value) || 5)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </SettingRow>
          <SettingRow label="Email when editor inbox exceeds" description="Items waiting for review.">
            <input type="number" min={1} value={settings.notify_inbox_above}
              onChange={e => set('notify_inbox_above', parseInt(e.target.value) || 20)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-300" />
          </SettingRow>
          <SettingRow label="Weekly analytics digest" description="Receive a summary of space performance each week.">
            <Toggle checked={settings.weekly_digest} onChange={v => set('weekly_digest', v)} />
          </SettingRow>
        </SectionCard>

        {/* Save button + banners */}
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
          <button onClick={saveSettings} disabled={saving}
            className="bg-teal-600 text-white text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>

        {/* Danger Zone */}
        <div className="border-2 border-red-200 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-red-700 mb-1">Danger Zone</h2>
          <p className="text-xs text-gray-500 mb-4">Destructive or irreversible actions. Handle with care.</p>
          {!deactivateRequested ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                You cannot deactivate your own space. Requesting deactivation will notify the Super Admin for their approval.
              </p>
              {!showDeactivateConfirm ? (
                <button onClick={() => setShowDeactivateConfirm(true)}
                  className="border-2 border-red-300 text-red-600 text-sm font-semibold px-5 py-2 rounded-xl hover:bg-red-50 transition-colors">
                  Request Space Deactivation
                </button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-800 font-medium mb-3">Are you sure? This will send a deactivation request to the Super Admin.</p>
                  <div className="flex gap-3">
                    <button onClick={() => setShowDeactivateConfirm(false)}
                      className="border border-gray-300 text-gray-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-50">
                      Cancel
                    </button>
                    <button onClick={() => { setShowDeactivateConfirm(false); setDeactivateRequested(true) }}
                      className="bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-700">
                      Send Request
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <CheckCircle size={14} />
              Deactivation request sent to Super Admin.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
