'use client'

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

const clockFormatter = new Intl.DateTimeFormat('ar-DZ', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

export function LiveClock() {
  // set only after mount → no hydration mismatch between server & client clocks
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-3.5 py-2">
      <Clock className="h-3.5 w-3.5 text-zinc-500" />
      <span className="tabular-nums text-xs font-bold text-zinc-300">
        {now == null ? '--:--:--' : clockFormatter.format(now)}
      </span>
      <span className="text-[10px] text-zinc-600">التوقيت المحلي</span>
    </div>
  )
}