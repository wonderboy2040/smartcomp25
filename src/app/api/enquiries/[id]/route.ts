import { NextRequest, NextResponse } from 'next/server'
import { getRow, updateRow, deleteRow } from '@/lib/sheets-client'
import { parseRateResponseAdvanced } from '@/lib/whatsapp'
import { safeJsonParse } from '@/lib/utils'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const e = await getRow('Enquiries', id)
    if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(e)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { response, action } = body

    if (action === 'respond') {
      const enquiry = await getRow<any>('Enquiries', id)
      if (!enquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const items = safeJsonParse<any[]>(enquiry.itemsJson, [])
      // Use advanced parser — handles @ patterns, ₹, INR, OOS, MOQ, confidence scoring
      const parsedRates = parseRateResponseAdvanced(String(response || ''), items)

      const updated = await updateRow('Enquiries', id, {
        response: String(response || ''),
        status: 'responded',
        respondedAt: new Date().toISOString(),
        ratesJson: JSON.stringify(parsedRates),
      })

      return NextResponse.json({ success: true, enquiry: updated, parsedRates })
    }

    if (action === 'applyRates') {
      const enquiry = await getRow<any>('Enquiries', id)
      if (!enquiry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

      const rates = safeJsonParse<any[]>(enquiry.ratesJson, [])
      const items = safeJsonParse<any[]>(enquiry.itemsJson, [])
      let appliedCount = 0

      for (const rate of rates) {
        // Skip out-of-stock entries — don't overwrite cost price with 0
        const isOOS = rate.rate === 0 || (rate.notes && String(rate.notes).includes('OUT OF STOCK'))
        if (isOOS) continue

        const matchedItem = items.find(
          (i: any) => {
            const iName = String(i?.name || '').toLowerCase()
            const rName = String(rate?.itemName || '').toLowerCase()
            return iName === rName || iName.includes(rName) || rName.includes(iName)
          }
        )
        if (matchedItem?.id) {
          // Use totalCost if available (accounts for GST), else fall back to rate
          const effectiveCost = rate.totalCost ?? rate.rate
          if (!effectiveCost || effectiveCost <= 0) continue
          const updateData: any = { costPrice: effectiveCost }
          if (rate.gstApplicable !== null && rate.gstApplicable !== undefined) {
            updateData.gstApplicable = rate.gstApplicable
          }
          if (rate.gstRate !== undefined) {
            updateData.gstRate = rate.gstRate
          }
          await updateRow('Items', String(matchedItem.id), updateData)
          appliedCount++
        }
      }

      await updateRow('Enquiries', id, { status: 'rate_updated', appliedToItems: true })

      return NextResponse.json({ success: true, appliedCount })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await deleteRow('Enquiries', id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
