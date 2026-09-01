'use client'

import { Droplet, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEP_BUTTON_CLASS =
  'grid h-11 w-11 place-items-center rounded-lg border border-zinc-800 bg-zinc-950/70 text-zinc-300 transition-all hover:border-zinc-600 hover:text-zinc-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30'

interface UnitsStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
}

export function UnitsStepper({ value, onChange, min = 1, max = 10 }: UnitsStepperProps) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor="dispatch-units" className="block text-sm font-bold text-zinc-300">عدد الأكياس المطلوبة</label>
        <span className="text-[11px] tabular-nums text-zinc-600">{min}–{max}</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" aria-label="إنقاص" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} className={STEP_BUTTON_CLASS}>
          <Minus className="h-4 w-4" />
        </button>
        <output
          id="dispatch-units"
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/70"
        >
          <span className="text-2xl font-extrabold tabular-nums leading-none">{value}</span>
          <span className="text-[11px] text-zinc-500">{value === 1 ? 'كيس' : 'أكياس'}</span>
        </output>
        <button type="button" aria-label="زيادة" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} className={STEP_BUTTON_CLASS}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {/* droplet scale — a live read of the current value */}
      <div className="mt-3 flex gap-1" role="img" aria-label={`${value} من ${max} أكياس`}>
        {Array.from({ length: max }, (_, i) => (
          <Droplet
            key={i}
            className={cn('h-3.5 w-3.5 transition-colors duration-200', i < value ? 'text-rose-500' : 'text-zinc-800')}
          />
        ))}
      </div>
    </div>
  )
}