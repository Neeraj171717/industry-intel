'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import {
  Upload, Download, FileText, CheckCircle, XCircle,
  AlertCircle, Loader2, ArrowLeft, ImageIcon,
} from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import { ContributorNav } from '@/components/layout/ContributorNav'

// ─── Types ───────────────────────────────────────────────────────────────────

const VALID_SOURCE_TYPES = ['blog', 'youtube', 'official', 'ai_tool'] as const

interface CsvRow {
  source_url: string
  source_name: string
  source_type: string
  raw_text: string
  notes_for_editor: string
  featured_image: string
}

interface ValidatedRow {
  row: number
  data: CsvRow
  valid: boolean
  errors: string[]
  imageWarning: string | null
}

type Step = 'upload' | 'preview' | 'importing' | 'done'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isValidUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://')
}

function validateRow(row: CsvRow, index: number): ValidatedRow {
  const errors: string[] = []
  let imageWarning: string | null = null

  if (!row.source_url?.trim()) {
    errors.push('source_url is required')
  } else if (!isValidUrl(row.source_url.trim())) {
    errors.push('source_url must start with http:// or https://')
  }

  if (!row.source_type?.trim()) {
    errors.push('source_type is required')
  } else if (!(VALID_SOURCE_TYPES as readonly string[]).includes(row.source_type.trim().toLowerCase())) {
    errors.push('source_type must be blog, youtube, official, or ai_tool')
  }

  if (!row.raw_text?.trim()) {
    errors.push('raw_text is required')
  }

  if (row.featured_image?.trim() && !isValidUrl(row.featured_image.trim())) {
    imageWarning = 'Invalid image URL — will be skipped'
  }

  return {
    row: index + 1,
    data: row,
    valid: errors.length === 0,
    errors,
    imageWarning,
  }
}

function getValidImageUrl(row: CsvRow): string | null {
  const img = row.featured_image?.trim()
  if (img && isValidUrl(img)) return img
  return null
}

function downloadTemplate() {
  const header = 'source_url,source_name,source_type,raw_text,notes_for_editor,featured_image'
  const example = 'https://www.searchengineland.com/google-march-2025-core-update,Search Engine Land,blog,"Google has officially confirmed the March 2025 core update is now rolling out. This update targets content quality signals and is expected to take approximately two weeks to fully deploy across all regions.",This is a major core update with significant implications for AI-generated content sites.,https://www.searchengineland.com/wp-content/uploads/2025/03/google-core-update.jpg'
  const csv = `${header}\n${example}\n`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'bulk-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const DELAY_MS = 500

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BulkImportPage() {
  const router = useRouter()
  const { user: currentUser, loading: sessionLoading } = useSession()

  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [dragging, setDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const validRows = rows.filter((r) => r.valid)
  const invalidRows = rows.filter((r) => !r.valid)

  // ─── CSV parsing ──────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setFileError(null)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setFileError('Please upload a CSV file only')
      return
    }

    setFileName(file.name)

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        if (!results.data || results.data.length === 0) {
          setFileError('The CSV file appears to be empty')
          return
        }
        const validated = results.data.map((row, i) => validateRow(row, i))
        setRows(validated)
        setStep('preview')
      },
      error() {
        setFileError('Failed to parse the CSV file. Please check the format.')
      },
    })
  }, [])

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ─── Import — sequential with 500ms delay ────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!currentUser || validRows.length === 0) return

    setStep('importing')
    setImportTotal(validRows.length)
    setImportProgress(0)
    setImportedCount(0)
    setFailedCount(0)

    const supabase = createBrowserSupabaseClient()
    let succeeded = 0
    let failed = 0

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i].data

      setImportProgress(i + 1)

      const { error } = await supabase.from('raw_items').insert({
        space_id: currentUser.space_id,
        submitted_by: currentUser.id,
        source_url: r.source_url.trim(),
        source_name: r.source_name?.trim() || null,
        source_type: r.source_type.trim().toLowerCase(),
        raw_text: r.raw_text.trim(),
        notes: r.notes_for_editor?.trim() || null,
        featured_image: getValidImageUrl(r),
        status: 'pending',
        ai_processed: false,
      })

      if (error) {
        failed++
      } else {
        succeeded++
      }

      setImportedCount(succeeded)
      setFailedCount(failed)

      // Stagger inserts so Supabase webhooks fire individually
      if (i < validRows.length - 1) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }
    }

    setStep('done')
  }, [currentUser, validRows])

  // ─── Render ───────────────────────────────────────────────────────────────

  if (sessionLoading) {
    return (
      <>
        <ContributorNav />
        <div className="max-w-3xl mx-auto px-6 py-10 flex justify-center">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      </>
    )
  }

  return (
    <>
      <ContributorNav />
      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* ── STEP 1: UPLOAD ──────────────────────────────────────────── */}
        {step === 'upload' && (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-slate-900">Bulk Import Content</h1>
              <p className="text-sm text-gray-500 mt-1">
                Download the CSV template, fill in your content, and upload the file
              </p>
            </div>

            {/* Download template */}
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 text-sm font-medium text-teal-600 hover:text-teal-700 mb-6"
            >
              <Download size={16} />
              Download CSV Template
            </button>

            {/* Upload area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
                dragging
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Upload size={32} className="mx-auto mb-3 text-gray-400" />
              <p className="text-sm font-medium text-slate-700 mb-1">
                Drag and drop your CSV file here
              </p>
              <p className="text-xs text-gray-400">or click to browse — .csv files only</p>
              {fileName && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-teal-600">
                  <FileText size={14} />
                  {fileName}
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={onFileSelect}
                className="hidden"
              />
            </div>

            {/* File error */}
            {fileError && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{fileError}</p>
              </div>
            )}
          </>
        )}

        {/* ── STEP 2: PREVIEW ─────────────────────────────────────────── */}
        {step === 'preview' && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => { setStep('upload'); setRows([]); setFileName(null) }}
                className="p-1.5 text-gray-400 hover:text-slate-700 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Preview &amp; Validate</h1>
                <p className="text-sm text-gray-500 mt-0.5">{fileName}</p>
              </div>
            </div>

            {/* Summary */}
            <div className="flex items-center gap-4 mb-5">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                <CheckCircle size={14} />
                {validRows.length} items ready to import
              </span>
              {invalidRows.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                  <XCircle size={14} />
                  {invalidRows.length} items have errors — will be skipped
                </span>
              )}
            </div>

            {/* Validation table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-12">#</th>
                      <th className="text-center px-3 py-2.5 font-semibold text-slate-600 w-16">Image</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Source URL</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600 w-24">Type</th>
                      <th className="text-left px-4 py-2.5 font-semibold text-slate-600">Content Preview</th>
                      <th className="text-center px-4 py-2.5 font-semibold text-slate-600 w-20">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const imgUrl = getValidImageUrl(r.data)
                      return (
                        <tr
                          key={r.row}
                          className={`border-b border-gray-100 ${!r.valid ? 'bg-red-50/50' : ''}`}
                        >
                          <td className="px-4 py-2.5 text-gray-500">{r.row}</td>
                          <td className="px-3 py-2.5 text-center">
                            {imgUrl ? (
                              <img
                                src={imgUrl}
                                alt=""
                                className="w-10 h-10 rounded object-cover mx-auto"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden') }}
                              />
                            ) : null}
                            <div className={`w-10 h-10 rounded bg-gray-100 flex items-center justify-center mx-auto ${imgUrl ? 'hidden' : ''}`}>
                              <ImageIcon size={14} className="text-gray-300" />
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 max-w-[180px] truncate" title={r.data.source_url}>
                            {r.data.source_url || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">
                            {r.data.source_type || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-gray-500 max-w-[220px] truncate" title={r.data.raw_text}>
                            {r.data.raw_text?.slice(0, 100) || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            {r.valid ? (
                              <span title={r.imageWarning ? `Valid (${r.imageWarning})` : 'Valid'}>
                                <CheckCircle size={16} className="inline text-green-500" />
                              </span>
                            ) : (
                              <span title={r.errors.join('; ')}>
                                <XCircle size={16} className="inline text-red-500" />
                              </span>
                            )}
                            {r.imageWarning && r.valid && (
                              <p className="text-[10px] text-amber-600 mt-0.5">{r.imageWarning}</p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All invalid message */}
            {validRows.length === 0 && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">All rows have errors. Fix errors in your CSV and re-upload.</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleImport}
                disabled={validRows.length === 0}
                className="bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Upload size={14} />
                Import {validRows.length} Valid Items
              </button>
              <button
                onClick={() => router.push('/contributor/dashboard')}
                className="border border-slate-300 text-slate-700 text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── STEP 3: IMPORTING ───────────────────────────────────────── */}
        {step === 'importing' && (
          <div className="max-w-md mx-auto text-center py-16">
            <Loader2 size={32} className="animate-spin text-teal-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              Importing item {importProgress} of {importTotal}...
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {importedCount} succeeded{failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </p>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-teal-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${importTotal > 0 ? (importProgress / importTotal) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── STEP 4: DONE ────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className="max-w-md mx-auto text-center py-10">
            <div className="bg-green-50 border border-green-200 rounded-2xl p-10">
              <div className="flex justify-center mb-4">
                <CheckCircle size={48} className="text-green-500" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">
                {importedCount} items imported successfully
              </h2>
              {failedCount > 0 && (
                <p className="text-sm text-red-600 mb-2">
                  {failedCount} items failed to import
                </p>
              )}
              <p className="text-sm text-gray-500 mb-8">
                The AI Brain will process each item automatically. Check your submission history to track progress.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => router.push('/contributor/history')}
                  className="bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-lg hover:bg-slate-800 transition-colors"
                >
                  View Submission History
                </button>
                <button
                  onClick={() => {
                    setStep('upload')
                    setRows([])
                    setFileName(null)
                    setImportProgress(0)
                    setImportTotal(0)
                    setImportedCount(0)
                    setFailedCount(0)
                  }}
                  className="border border-slate-300 text-slate-700 text-sm font-medium px-6 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Import More
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
