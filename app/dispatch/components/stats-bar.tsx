'use client'

import { Droplet, HeartPulse, Siren, Users, type LucideIcon } from 'lucide-react'
import type { OpsStats } from '@/lib/types'
import { cn, formatNumber } from '@/lib/utils'

interface StatItem { key: keyof OpsStats; label: string; icon: LucideIcon; accent?: boolean }

const ITEMS: StatItem[] = [
  { key: 'active_emergencies', label: 'نداءات نشطة', icon: Siren, accent: true },
  { key: 'open_units_needed', label: 'أكياس مطلوبة', icon: Droplet },
  { key: 'pledges_last_24h', label: 'تعهدات خلال 24 ساعة', icon: HeartPulse },
  { key: 'active_donors', label: 'متبرعون نشطون', icon: Users },
]

interface StatsBarProps { stats: OpsStats | null; loading: boolean }

export function StatsBar({ stats, loading }: StatsBarProps) {
  // one instrument panel with hairline dividers (gap-px trick) — direction-agnostic in RTL
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-800/70 sm:grid-cols-4">
      {ITEMS.map(({ key, label, icon: Icon, accent }) => (
        <div key={key} className="bg-zinc-950/90 p-4">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', accent ? 'text-rose-500' : 'text-zinc-500')} />
            <span className="text-[11px] font-bold text-zinc-500">{label}</span>
            {accent && stats != null && stats[key] > 0 && (
              <span className="relative ms-auto flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
              </span>
            )}
          </div>
          {stats == null || loading ? (
            <div className="mt-2 h-7 w-16 animate-pulse rounded bg-zinc-800/80" />
          ) : (
            <p className={cn('mt-1.5 text-2xl font-extrabold tabular-nums', accent && stats[key] > 0 ? 'text-rose-400' : 'text-zinc-100')}>
              {formatNumber(stats[key])}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}