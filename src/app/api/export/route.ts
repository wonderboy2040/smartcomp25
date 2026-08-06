import { NextRequest, NextResponse } from 'next/server'
import { exportAllData, exportSheetData, isConfigured } from '@/lib/sheets-client'
import { exportLimiter, getClientIp } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rateCheck = exportLimiter(ip)
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many export requests. Try again later.' },
        { 
          status: 429,
          headers: {
            'Retry-After': Math.ceil((rateCheck.resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Remaining': '0',
          }
        }
      )
    }

    if (!isConfigured()) {
      return NextResponse.json({ error: 'Not configured - APPS_SCRIPT_URL missing' }, { status: 400 })
    }

    const url = new URL(req.url)
    const sheet = url.searchParams.get('sheet')
    const format = url.searchParams.get('format') || 'json'

    if (sheet) {
      // Export single sheet
      const data = await exportSheetData(sheet)
      
      if (format === 'csv') {
        // Convert to CSV
        if (!data.data.length) {
          return new NextResponse('', {
            headers: {
              'Content-Type': 'text/csv',
              'Content-Disposition': `attachment; filename="${sheet}-${new Date().toISOString().split('T')[0]}.csv"`,
            }
          })
        }
        const headers = Object.keys(data.data[0])
        const csvRows = [
          headers.join(','),
          ...data.data.map(row => 
            headers.map(h => {
              const val = row[h]
              if (val === null || val === undefined) return ''
              const str = String(val).replace(/"/g, '""')
              return str.includes(',') || str.includes('"') || str.includes('\n') ? `"${str}"` : str
            }).join(',')
          )
        ]
        const csv = csvRows.join('\n')
        
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv;charset=utf-8',
            'Content-Disposition': `attachment; filename="${sheet}-${new Date().toISOString().split('T')[0]}.csv"`,
            'X-RateLimit-Remaining': rateCheck.remaining.toString(),
          }
        })
      }

      return NextResponse.json(data, {
        headers: {
          'Content-Disposition': `attachment; filename="${sheet}-${new Date().toISOString().split('T')[0]}.json"`,
          'X-RateLimit-Remaining': rateCheck.remaining.toString(),
        }
      })
    }

    // Export all data
    const allData = await exportAllData()
    
    if (format === 'csv') {
      // For all data CSV, we return a zip would be ideal, but for now JSON
      return NextResponse.json(
        { error: 'CSV format only supported for single sheet. Use ?sheet=Items&format=csv or omit format for JSON' },
        { status: 400 }
      )
    }

    return NextResponse.json(allData, {
      headers: {
        'Content-Disposition': `attachment; filename="smartcomp-backup-${new Date().toISOString().split('T')[0]}.json"`,
        'X-RateLimit-Remaining': rateCheck.remaining.toString(),
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Export failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rateCheck = exportLimiter(ip)
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    const body = await req.json()
    const { sheets } = body

    if (!Array.isArray(sheets) || sheets.length === 0) {
      return NextResponse.json({ error: 'sheets array required' }, { status: 400 })
    }

    const results: Record<string, any> = {}
    for (const sheet of sheets) {
      try {
        const data = await exportSheetData(sheet)
        results[sheet] = data
      } catch (err: any) {
        results[sheet] = { error: err?.message }
      }
    }

    return NextResponse.json({
      version: '3.0',
      exportedAt: new Date().toISOString(),
      sheets: results,
    }, {
      headers: {
        'X-RateLimit-Remaining': rateCheck.remaining.toString(),
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
