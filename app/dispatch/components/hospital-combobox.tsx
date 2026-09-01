'use client'

import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Search } from 'lucide-react'
import { HOSPITAL_REGISTRY } from '@/lib/hospitals'
import type { HospitalSuggestion } from '@/lib/types'
import { cn } from '@/lib/utils'

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 pe-10 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-rose-600/70 focus:outline-none focus:ring-2 focus:ring-rose-600/20'

const MAX_SUGGESTIONS = 6

interface HospitalComboboxProps {
  value: string
  /**
   * value = the name to display.
   * suggestedWilayaId = the registry wilaya when picked from the suggestion list,
   * null when the user is free-typing (no enforcement in that case).
   */
  onChange: (value: string, suggestedWilayaId: number | null) => void
  wilayaId: number | null
}

export function HospitalCombobox({ value, onChange, wilayaId }: HospitalComboboxProps) {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // rank hospitals of the selected wilaya first; free text always wins on submit
  const suggestions = useMemo<HospitalSuggestion[]>(() => {
    const query = value.trim().toLowerCase()
    const matches = HOSPITAL_REGISTRY.filter(
      h => query === '' || h.name.toLowerCase().includes(query) || h.name_ar.includes(value.trim()),
    )
    if (wilayaId != null) {
      const local = matches.filter(h => h.wilaya_id === wilayaId)
      const others = matches.filter(h => h.wilaya_id !== wilayaId)
      if (query === '') return (local.length > 0 ? local : others).slice(0, MAX_SUGGESTIONS)
      return [...local, ...others].slice(0, MAX_SUGGESTIONS)
    }
    return matches.slice(0, MAX_SUGGESTIONS)
  }, [value, wilayaId])

  const select = (suggestion: HospitalSuggestion) => {
    onChange(suggestion.name_ar, suggestion.wilaya_id)
    setOpen(false)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && suggestions[activeIndex] != null) {
        e.preventDefault()
        select(suggestions[activeIndex])
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={e => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <label htmlFor="dispatch-hospital" className="mb-2 block text-sm font-bold text-zinc-300">
        اسم المستشفى <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <input
          id="dispatch-hospital"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          placeholder="مثال: مستشفى مصطفى باشا"
          onFocus={() => setOpen(true)}
          onChange={e => {
            onChange(e.target.value, null)
            setOpen(true)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          className={INPUT_CLASS}
        />
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/60"
        >
          {suggestions.map((s, i) => (
            <li key={`${s.wilaya_id}-${s.name}`} role="option" aria-selected={i === activeIndex}>
              {/* preventDefault on mousedown keeps input focus → no blur race */}
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(s)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-start transition-colors',
                  i === activeIndex ? 'bg-zinc-800/80' : 'hover:bg-zinc-800/50',
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-bold text-zinc-200">{s.name_ar}</span>
                  <span dir="ltr" className="truncate text-[10px] text-zinc-500">{s.name}</span>
                </span>
                {wilayaId != null && s.wilaya_id === wilayaId && (
                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    نفس الولاية
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}