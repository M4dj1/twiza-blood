export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

// ar-DZ renders Western (0-9) digits — matches Algerian convention
const numberFormatter = new Intl.NumberFormat('ar-DZ')
const clockFormatter = new Intl.DateTimeFormat('ar-DZ', { hour: '2-digit', minute: '2-digit', hour12: false })
const fullDateFormatter = new Intl.DateTimeFormat('ar-DZ', { day: 'numeric', month: 'long' })

export function formatNumber(value: number): string {
  return numberFormatter.format(value)
}

export function formatClockTime(ms: number): string {
  return clockFormatter.format(new Date(ms))
}

/** Proper Arabic pluralisation: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular */
function arabicCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one
  if (n === 2) return two
  if (n >= 3 && n <= 10) return `${n} ${few}`
  return `${n} ${many}`
}

/** "الآن" · "منذ 5 دقائق" · "منذ ساعتين" · "منذ 3 أيام" … */
export function formatRelativeAr(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSeconds = Math.floor((nowMs - then) / 1000)
  if (diffSeconds < 45) return 'الآن'
  const minutes = Math.floor(diffSeconds / 60)
  if (minutes < 60) return `منذ ${arabicCount(minutes, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${arabicCount(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `منذ ${arabicCount(days, 'يوم', 'يومين', 'أيام', 'يومًا')}`
  return fullDateFormatter.format(new Date(then))
}