'use client'

/**
 * Backup & Restore Panel (v12.8)
 *
 * Features:
 *   - Manual download of full JSON backup (always available, no Google Drive needed)
 *   - Google Drive auto-backup status + setup instructions
 *   - List of recent Drive backups (with download + restore links)
 *   - Restore from uploaded JSON file (merge or overwrite mode)
 *   - "Run backup now" button (triggers the same flow as the daily cron)
 *
 * The daily auto-backup is wired via /api/cron/backup (vercel.json +
 * render.yaml). It fires at 2:30 AM IST every day and uploads the JSON
 * to Google Drive (if GDRIVE_* env vars are set).
 */

import { useState, useCallback, useRef } from 'react'
import { useFetch, apiPost } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/calc'
import { Database, Download, Upload, RefreshCw, Cloud, CheckCircle2, AlertTriangle, FileJson, Clock, HardDrive, Shield } from 'lucide-react'

interface DriveBackup {
  id: string
  name: string
  modifiedTime: string
  sizeBytes: number
  webViewLink: string
}

interface DriveListResponse {
  configured: boolean
  backups: DriveBackup[]
  message?: string
}

export function BackupPanel() {
  const { toast } = useToast()
  const [runningBackup, setRunningBackup] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreMode, setRestoreMode] = useState<'merge' | 'overwrite'>('merge')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch the list of recent Drive backups (cached for 60s).
  const { data: driveList, loading: driveLoading, refetch: refetchDriveList } = useFetch<DriveListResponse>('/api/backup?list=1&limit=20', undefined)
  const driveConfigured = driveList?.configured === true
  const backups = driveList?.backups || []

  // Manual download of full JSON backup (always works, no Drive required).
  const handleDownloadBackup = useCallback(() => {
    // Trigger the browser's native download via a hidden <a> link.
    // The /api/backup GET endpoint returns the JSON as an attachment.
    const a = document.createElement('a')
    a.href = '/api/backup'
    a.download = `smartcomp-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast({ title: 'Backup downloaded ✓', description: 'Full JSON export saved to your downloads folder.', duration: 4000 })
  }, [toast])

  // Run a backup now (same flow as the daily cron).
  const handleRunBackupNow = useCallback(async () => {
    setRunningBackup(true)
    try {
      // Use the cron-secret-protected POST /api/backup endpoint.
      // We pass the secret via the x-cron-secret header (the proxy.ts
      // PUBLIC_PATHS list includes /api/cron/backup so this works without
      // the user being logged in — but they ARE logged in anyway since
      // they're viewing this panel).
      const cronSecret = prompt('Enter CRON_SECRET to run backup now:')
      if (!cronSecret) {
        setRunningBackup(false)
        return
      }
      const resp = await fetch('/api/cron/backup', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
          'Content-Type': 'application/json',
        },
      })
      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`)
      }
      const driveInfo = data.drive || {}
      if (driveInfo.uploaded) {
        toast({
          title: 'Backup uploaded to Drive ✓',
          description: `${data.filename} • ${(driveInfo.sizeMB || 0).toFixed(2)} MB${driveInfo.retention ? ` • ${driveInfo.retention.deleted} old backups cleaned up` : ''}`,
          duration: 6000,
        })
      } else if (driveInfo.configured === false) {
        toast({
          title: 'Backup exported but not uploaded',
          description: driveInfo.message || 'Google Drive env vars not set. See setup instructions below.',
          variant: 'destructive',
          duration: 8000,
        })
      } else {
        toast({
          title: 'Backup exported',
          description: `${data.totalSheets} sheets backed up. Drive upload status unknown.`,
          duration: 5000,
        })
      }
      // Refresh the Drive backups list
      refetchDriveList()
    } catch (e: any) {
      toast({ title: 'Backup failed', description: e.message, variant: 'destructive', duration: 8000 })
    } finally {
      setRunningBackup(false)
    }
  }, [toast, refetchDriveList])

  // Restore from an uploaded JSON file.
  const handleRestoreFile = useCallback(async (file: File) => {
    if (!confirm(`Restore data from "${file.name}"?\n\nMode: ${restoreMode.toUpperCase()}\n${restoreMode === 'overwrite' ? '⚠️ OVERWRITE will replace ALL existing data with the backup. This cannot be undone.' : '✓ MERGE will only insert rows that don\'t already exist. Safe — no data is overwritten.'}\n\nContinue?`)) {
      return
    }
    setRestoring(true)
    try {
      const text = await file.text()
      const backup = JSON.parse(text)
      const resp = await apiPost('/api/restore', { backup, mode: restoreMode })
      toast({
        title: 'Restore completed ✓',
        description: `Inserted: ${resp.totalInserted} • Skipped: ${resp.totalSkipped} • Overwritten: ${resp.totalOverwritten} • ${(resp.elapsedMs / 1000).toFixed(1)}s`,
        duration: 8000,
      })
    } catch (e: any) {
      toast({ title: 'Restore failed', description: e.message, variant: 'destructive', duration: 8000 })
    } finally {
      setRestoring(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [restoreMode, toast])

  // Restore from a Drive backup file (by fileId).
  const handleRestoreFromDrive = useCallback(async (backup: DriveBackup) => {
    if (!confirm(`Restore data from "${backup.name}"?\n\nMode: ${restoreMode.toUpperCase()}\n${restoreMode === 'overwrite' ? '⚠️ OVERWRITE will replace ALL existing data with the backup. This cannot be undone.' : '✓ MERGE will only insert rows that don\'t already exist. Safe — no data is overwritten.'}\n\nContinue?`)) {
      return
    }
    setRestoring(true)
    try {
      // Fetch the backup JSON from Drive via the /api/backup?fileId=XXX endpoint.
      const resp = await fetch(`/api/backup?fileId=${encodeURIComponent(backup.id)}`)
      if (!resp.ok) {
        throw new Error(`Failed to download backup: HTTP ${resp.status}`)
      }
      const backupData = await resp.json()
      const restoreResp = await apiPost('/api/restore', { backup: backupData, mode: restoreMode })
      toast({
        title: 'Restore completed ✓',
        description: `Inserted: ${restoreResp.totalInserted} • Skipped: ${restoreResp.totalSkipped} • Overwritten: ${restoreResp.totalOverwritten} • ${(restoreResp.elapsedMs / 1000).toFixed(1)}s`,
        duration: 8000,
      })
    } catch (e: any) {
      toast({ title: 'Restore failed', description: e.message, variant: 'destructive', duration: 8000 })
    } finally {
      setRestoring(false)
    }
  }, [restoreMode, toast])

  const totalBackups = backups.length
  const totalSizeBytes = backups.reduce((s, b) => s + (b.sizeBytes || 0), 0)
  const lastBackup = backups[0]
  const lastBackupDate = lastBackup ? new Date(lastBackup.modifiedTime) : null

  return (
    <div className="space-y-4 pb-10">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
            <span className="truncate">Backup & Restore</span>
            <span className="text-[10px] px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full">v12.8</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Daily auto-backup to Google Drive + manual restore from JSON
          </p>
        </div>
      </div>

      {/* STATUS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Drive status */}
        <Card className={driveConfigured ? 'border-emerald-200 bg-emerald-50/40' : 'border-amber-200 bg-amber-50/40'}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {driveConfigured ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              )}
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Drive Status</span>
            </div>
            {driveConfigured ? (
              <div>
                <p className="font-bold text-emerald-700">Connected ✓</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Daily auto-backup at 2:30 AM IST</p>
              </div>
            ) : (
              <div>
                <p className="font-bold text-amber-700">Not configured</p>
                <p className="text-[11px] text-slate-600 mt-0.5">See setup instructions below</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Last backup */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Last Backup</span>
            </div>
            {lastBackupDate ? (
              <div>
                <p className="font-bold text-slate-900">{lastBackupDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{lastBackupDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} • {formatBytes(totalSizeBytes)} total</p>
              </div>
            ) : (
              <p className="font-bold text-slate-400">No backups yet</p>
            )}
          </CardContent>
        </Card>

        {/* Backup count */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="w-5 h-5 text-violet-600" />
              <span className="text-xs font-bold uppercase tracking-wide text-slate-700">Drive Backups</span>
            </div>
            <p className="font-bold text-slate-900">{totalBackups} file{totalBackups !== 1 ? 's' : ''}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{formatBytes(totalSizeBytes)} used</p>
          </CardContent>
        </Card>
      </div>

      {/* ACTION BUTTONS */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cloud className="w-4 h-4 text-blue-600" /> Actions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Download JSON */}
            <Button onClick={handleDownloadBackup} className="bg-blue-600 hover:bg-blue-700 text-white h-12">
              <Download className="w-4 h-4 mr-2" /> Download JSON Backup
            </Button>

            {/* Run backup now */}
            <Button
              onClick={handleRunBackupNow}
              disabled={runningBackup}
              className="bg-emerald-600 hover:bg-emerald-700 text-white h-12"
            >
              {runningBackup ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Running backup...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Run Backup Now</>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            💡 "Download JSON" always works (saves a full export to your device).
            "Run Backup Now" uploads to Google Drive (requires GDRIVE_* env vars + CRON_SECRET).
          </p>
        </CardContent>
      </Card>

      {/* DRIVE BACKUPS LIST */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-600" /> Recent Drive Backups
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetchDriveList()} disabled={driveLoading} className="h-8 text-xs">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${driveLoading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {!driveConfigured ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-bold text-amber-800 mb-2">Google Drive not configured</p>
              <p className="text-xs text-amber-700 mb-3">
                To enable daily auto-backup to Google Drive, set these environment variables in your Render/Vercel dashboard:
              </p>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-1 mb-3">
                <li><code className="bg-amber-100 px-1 rounded">GDRIVE_CLIENT_EMAIL</code> — service account email</li>
                <li><code className="bg-amber-100 px-1 rounded">GDRIVE_PRIVATE_KEY</code> — service account private key</li>
                <li><code className="bg-amber-100 px-1 rounded">GDRIVE_FOLDER_ID</code> — ID of the target Drive folder</li>
                <li><code className="bg-amber-100 px-1 rounded">GDRIVE_RETENTION_DAYS</code> — (optional, default 30)</li>
              </ul>
              <p className="text-xs text-amber-700">
                See the <code className="bg-amber-100 px-1 rounded">.env.example</code> file in the repo root for detailed setup instructions.
              </p>
            </div>
          ) : backups.length === 0 ? (
            <div className="text-center py-8">
              <FileJson className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="text-sm text-slate-500">No Drive backups yet. Click "Run Backup Now" above to create the first one.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <FileJson className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{b.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(b.modifiedTime).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} • {formatBytes(b.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <a
                      href={b.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                      title="View in Drive"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestoreFromDrive(b)}
                      disabled={restoring}
                      className="h-8 text-xs"
                    >
                      <Upload className="w-3 h-3 mr-1" /> Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* RESTORE FROM FILE */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4 text-orange-600" /> Restore from JSON File</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Shield className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="flex-1">
              <Label className="text-xs font-bold text-blue-900">Restore mode</Label>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setRestoreMode('merge')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${restoreMode === 'merge' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                >
                  ✓ Merge (safe — only inserts new rows)
                </button>
                <button
                  onClick={() => setRestoreMode('overwrite')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${restoreMode === 'overwrite' ? 'bg-red-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'}`}
                >
                  ⚠️ Overwrite (destructive — replaces all)
                </button>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleRestoreFile(file)
            }}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={restoring}
            className="bg-orange-600 hover:bg-orange-700 text-white h-12 w-full"
          >
            {restoring ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Restoring...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" /> Select JSON Backup File</>
            )}
          </Button>
          <p className="text-[11px] text-slate-500">
            💡 The JSON file should be a backup you downloaded earlier (via "Download JSON" or from your Drive). The file format is auto-detected.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// Lazy import to avoid bundling if unused
import { ExternalLink } from 'lucide-react'
