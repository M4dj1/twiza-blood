'use client'

import { Droplets } from 'lucide-react'
import { BLOOD_TYPES, COMPATIBLE_DONORS } from '@/lib/blood'
import type { BloodType } from '@/lib/types'
import { cn } from '@/lib/utils'

interface BloodTypeSelectorProps {
  value: BloodType | null
  onChange: (type: BloodType) => void
}

export function BloodTypeSelector({ value, onChange }: BloodTypeSelectorProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-bold text-zinc-300">
        الفصيلة المطلوبة <span className="text-rose-500">*</span>
      </label>
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="الفصيلة المطلوبة">
        {BLOOD_TYPES.map(type => {
          const selected = value === type
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              dir="ltr"
              onClick={() => onChange(type)}
              className={cn(
                'h-11 rounded-lg border text-base font-extrabold tabular-nums transition-all duration-150 active:scale-95',
                selected
                  ? 'border-rose-500 bg-rose-600 text-white shadow-[0_6px_20px_-8px_rgba(225,29,72,0.7)]'
                  : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100',
              )}
            >
              {type}
            </button>
          )
        })}
      </div>
      {value && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-600">
          <Droplets className="h-3 w-3 text-zinc-500" />
          المتبرعون المتوافقون:
          <span dir="ltr" className="font-bold text-zinc-400">{COMPATIBLE_DONORS[value].join(' · ')}</span>
        </p>
      )}
    </div>
  )
}