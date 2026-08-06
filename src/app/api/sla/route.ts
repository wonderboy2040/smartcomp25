import { NextRequest, NextResponse } from 'next/server'
import { listRows, getRow, isConfigured } from '@/lib/sheets-client'
import { safeJsonParse } from '@/lib/utils'

/**
 * GET /api/sla
 * Service Job SLA Tracker.
 *
 * Computes SLA metrics for each active service job:
 *   - stage (Received → Diagnosis → Repair → QC → Ready → Delivered)
 *   - timeInStage (minutes/hours since last status change)
 *   - targetTime per stage (configurable, defaults below)
 *   - isOverdue: timeInStage > targetTime
 *   - slaHealth: 'green' | 'amber' | 'red'
 *
 * Query:
 *   ?jobId=xxx — single job SLA detail (for public status page)
 */
export async function GET(req: NextRequest) {
  try {
    if (!isConfigured()) {
      return NextResponse.json({ error: 'APPS_SCRIPT_URL not configured' }, { status: 503 })
    }

    const url = new URL(req.url)
    const jobId = url.searchParams.get('jobId')

    // SLA target times per stage (in hours)
    const SLA_TARGETS: Record<string, number> = {
      'Pending': 4,      // 4h to start diagnosis
      'In Progress': 24, // 24h to complete repair
      'Ready': 48,       // 48h to deliver after ready
      'Completed': 24,
      'Delivered': 0,
      'Cancelled': 0,
    }

    if (jobId) {
      // Single-job detail
      const job = await getRow<any>('Jobs', jobId)
      if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

      const statusHistory = safeJsonParse<any[]>(job.statusHistoryJson, [])

      const currentStatus = String(job.status || 'Pending')
      const lastStatusChange = statusHistory.length > 0
        ? new Date(statusHistory[statusHistory.length - 1].timestamp || job.createdAt || Date.now())
        : new Date(job.createdAt || Date.now())

      const now = Date.now()
      const timeInStageMs = now - lastStatusChange.getTime()
      const timeInStageHours = timeInStageMs / (1000 * 60 * 60)
      const targetHours = SLA_TARGETS[currentStatus] ?? 24
      const isOverdue = targetHours > 0 && timeInStageHours > targetHours
      const slaHealth = isOverdue
        ? (timeInStageHours > targetHours * 2 ? 'red' : 'amber')
        : 'green'

      return NextResponse.json({
        job: {
          id: job.id,
          jobId: job.jobId,
          customerName: job.customerName,
          customerMobile: job.customerMobile,
          deviceType: job.deviceType,
          brandModel: job.brandModel,
          problemDesc: job.problemDesc,
          status: currentStatus,
          createdAt: job.createdAt,
          completedDate: job.completedDate,
          deliveredAt: job.deliveredAt,
          finalAmount: Number(job.finalAmount) || 0,
          paidAmount: Number(job.paidAmount) || 0,
          advanceAmount: Number(job.advanceAmount) || 0,
          warrantyDays: Number(job.warrantyDays) || 0,
          warrantyExpiry: job.warrantyExpiry,
          diagnosisNotes: job.diagnosisNotes,
          trackToken: job.trackToken,
        },
        sla: {
          currentStage: currentStatus,
          timeInStageHours: Number(timeInStageHours.toFixed(1)),
          targetHours,
          isOverdue,
          slaHealth,
          lastStatusChange: lastStatusChange.toISOString(),
        },
        statusHistory: statusHistory.map((h: any) => ({
          status: h.status,
          timestamp: h.timestamp,
          note: h.note || '',
        })),
        // Customer-facing stages with progress %
        stages: buildCustomerStages(currentStatus),
      })
    }

    // All-jobs SLA dashboard
    const jobs = await listRows<any>('Jobs')
    const now = Date.now()

    const activeJobs = jobs.filter((j) => !['Delivered', 'Cancelled'].includes(j.status))
    const slaList = activeJobs.map((job) => {
      const statusHistory = safeJsonParse<any[]>(job.statusHistoryJson, [])
      const currentStatus = String(job.status || 'Pending')
      const lastStatusChange = statusHistory.length > 0
        ? new Date(statusHistory[statusHistory.length - 1].timestamp || job.createdAt || Date.now())
        : new Date(job.createdAt || Date.now())

      const timeInStageMs = now - lastStatusChange.getTime()
      const timeInStageHours = timeInStageMs / (1000 * 60 * 60)
      const targetHours = SLA_TARGETS[currentStatus] ?? 24
      const isOverdue = targetHours > 0 && timeInStageHours > targetHours
      const slaHealth = isOverdue
        ? (timeInStageHours > targetHours * 2 ? 'red' : 'amber')
        : 'green'

      const totalAgeHours = (now - new Date(job.createdAt || job.date || now).getTime()) / (1000 * 60 * 60)

      return {
        id: job.id,
        jobId: job.jobId,
        customerName: job.customerName,
        customerMobile: job.customerMobile,
        deviceType: job.deviceType,
        brandModel: job.brandModel,
        priority: job.priority || 'Low',
        status: currentStatus,
        timeInStageHours: Number(timeInStageHours.toFixed(1)),
        targetHours,
        isOverdue,
        slaHealth,
        totalAgeHours: Number(totalAgeHours.toFixed(1)),
        lastStatusChange: lastStatusChange.toISOString(),
      }
    })

    // Sort: red first, then amber, then green; within each, oldest first
    const order = { red: 0, amber: 1, green: 2 }
    slaList.sort((a, b) => {
      if (order[a.slaHealth] !== order[b.slaHealth]) return order[a.slaHealth] - order[b.slaHealth]
      return b.timeInStageHours - a.timeInStageHours
    })

    const summary = {
      total: slaList.length,
      red: slaList.filter((s) => s.slaHealth === 'red').length,
      amber: slaList.filter((s) => s.slaHealth === 'amber').length,
      green: slaList.filter((s) => s.slaHealth === 'green').length,
      overdue: slaList.filter((s) => s.isOverdue).length,
    }

    return NextResponse.json({ jobs: slaList, summary })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

function buildCustomerStages(currentStatus: string): Array<{ stage: string; label: string; done: boolean; current: boolean }> {
  const stages = [
    { key: 'Pending', label: 'Device Received' },
    { key: 'In Progress', label: 'Diagnosis & Repair' },
    { key: 'Ready', label: 'Quality Check' },
    { key: 'Completed', label: 'Ready for Pickup' },
    { key: 'Delivered', label: 'Delivered' },
  ]
  const currentIdx = stages.findIndex((s) => s.key === currentStatus)
  return stages.map((s, i) => ({
    stage: s.key,
    label: s.label,
    done: currentIdx > i,
    current: currentIdx === i,
  }))
}
