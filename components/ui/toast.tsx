'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem { id: number; variant: ToastVariant; title: string; description?: string }
type ToastInput = Omit<ToastItem, 'id'>

interface ToastContextValue { toast: (input: ToastInput) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const VARIANT_META: Record<ToastVariant, { icon: LucideIcon; iconClass: string; border: string }> = {
  success: { icon: CheckCircle2, iconClass: 'text-emerald-400', border: 'border-emerald-500/30' },
  error: { icon: XCircle, iconClass: 'text-rose-400', border: 'border-rose-500/30' },
  info: { icon: Info, iconClass: 'text-zinc-400', border: 'border-zinc-700' },
}

const TOAST_DURATION: Record<ToastVariant, number> = { success: 5000, info: 6000, error: 7000 }
const MAX_VISIBLE = 4

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(t => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++
    setToasts(current => [...current, { ...input, id }].slice(-MAX_VISIBLE))
    timers.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION[input.variant]))
  }, [dismiss])

  useEffect(() => {
    const map = timers.current
    return () => {
      map.forEach(clearTimeout)
      map.clear()
    }
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map(t => {
          const meta = VARIANT_META[t.variant]
          const Icon = meta.icon
          return (
            <div
              key={t.id}
              className={cn(
                'toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-zinc-900/95 p-3.5 shadow-2xl shadow-black/60 backdrop-blur',
                meta.border,
              )}
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', meta.iconClass)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-zinc-100">{t.title}</p>
                {t.description && <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="إغلاق التنبيه"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}