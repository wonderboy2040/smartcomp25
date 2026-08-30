import { NextRequest, NextResponse } from 'next/server'
import { listRows } from '@/lib/sheets-client'
import { apiLimiter, getClientIp } from '@/lib/rate-limit'

/**
 * GET /api/birthdays?days=30
 * Lists customers whose birthday falls in the next N days (default 30).
 */
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const check = apiLimiter(ip)
    if (!check.allowed) return NextResponse.json({ error: 'Rate limited' }, { status: 429 })

    const url = new URL(req.url)
    const daysAhead = parseInt(url.searchParams.get('days') || '30')

    const customers = await listRows<any>('Customers').catch(() => [])
    const now = new Date()
    const todayMonth = now.getMonth() + 1
    const todayDate = now.getDate()

    const upcoming: any[] = []
    for (const c of customers) {
      const bday = String(c.birthday || c.dob || '').trim()
      if (!bday) continue

      let bdayMonth = 0
      let bdayDate = 0
      const partsSlash = bday.split('/')
      const partsDash = bday.split('-')
      const parts = partsSlash.length >= 2 ? partsSlash : partsDash
      if (parts.length >= 3) {
        bdayMonth = parseInt(parts[1])
        bdayDate = parseInt(parts[2])
      } else if (parts.length === 2) {
        bdayMonth = parseInt(parts[0])
        bdayDate = parseInt(parts[1])
        if (bdayMonth > 12) {
          bdayMonth = parseInt(parts[1])
          bdayDate = parseInt(parts[0])
        }
      }
      if (!bdayMonth || !bdayDate) continue

      // Compute next birthday occurrence
      const year = now.getFullYear()
      let nextBday = new Date(year, bdayMonth - 1, bdayDate)
      // v13.1 fix: previously `nextBday < now` compared a midnight Date to
      // a `now` that's later in the same day — meaning a birthday that
      // falls on TODAY would be pushed to next year (daysUntil=365 instead
      // of 0). Normalize `now` to midnight so same-day birthdays appear
      // with daysUntil=0.
      const todayMidnight = new Date(year, now.getMonth(), now.getDate())
      if (nextBday < todayMidnight) {
        nextBday = new Date(year + 1, bdayMonth - 1, bdayDate)
      }
      const daysUntil = Math.round((nextBday.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000))
      if (daysUntil <= daysAhead) {
        upcoming.push({
          id: String(c.id || ''),
          name: String(c.name || ''),
          phone: String(c.phone || ''),
          email: String(c.email || ''),
          birthday: bday,
          birthdayMonth: bdayMonth,
          birthdayDate: bdayDate,
          nextBirthday: nextBday.toISOString().slice(0, 10),
          daysUntil,
          age: bday.length >= 8 ? (year - parseInt(bday.slice(0, 4))) : null,
        })
      }
    }

    upcoming.sort((a, b) => a.daysUntil - b.daysUntil)

    return NextResponse.json(upcoming, {
      headers: { 'X-RateLimit-Remaining': check.remaining.toString() },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
