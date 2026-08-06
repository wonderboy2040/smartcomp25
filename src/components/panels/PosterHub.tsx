'use client'

/**
 * PosterHub — combines both poster tools in one panel with tabs:
 *   1. AI Text → Image  (PosterGenerator) — full AI poster via free Pollinations
 *   2. Poster Maker     (PosterMaker) — 11 premium templates + ✨ AI product
 *      image (FREE) + crisp browser-rendered text (prices, specs, phone are
 *      ALWAYS perfect — no garbled AI text). This is the ChatGPT-style
 *      promotional poster flow.
 */

import { useState, lazy, Suspense } from 'react'
import { Sparkles, Palette, Loader2 } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const PosterGeneratorPanel = lazy(() => import('@/components/panels/PosterGenerator').then((m) => ({ default: m.PosterGeneratorPanel })))
const PosterMakerPanel = lazy(() => import('@/components/panels/PosterMaker').then((m) => ({ default: m.PosterMakerPanel })))

export function PosterHubPanel() {
  const [tab, setTab] = useState('ai')

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-slate-100">
          <TabsTrigger value="ai" className="text-xs sm:text-sm flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" />
            AI Text → Image
          </TabsTrigger>
          <TabsTrigger value="maker" className="text-xs sm:text-sm flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-purple-600" />
            Poster Maker
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ai" className="mt-3">
          <Suspense fallback={<TabLoader label="Loading AI Poster Generator…" />}>
            <PosterGeneratorPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="maker" className="mt-3">
          <Suspense fallback={<TabLoader label="Loading Poster Maker…" />}>
            <PosterMakerPanel />
          </Suspense>
        </TabsContent>
      </Tabs>

      <p className="text-[10px] text-slate-400 text-center">
        <strong className="text-slate-500">100% FREE</strong> — Pollinations.ai FLUX engine, no API key needed.
        Tip: Poster Maker = AI product photo + perfect text (prices/specs/phone kabhi garbled nahi honge).
      </p>
    </div>
  )
}

function TabLoader({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Loader2 className="w-8 h-8 text-violet-500 animate-spin mb-3" />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  )
}
