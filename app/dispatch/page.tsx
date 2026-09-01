import type { Metadata } from 'next'
import { Tajawal } from 'next/font/google'
import { ToastProvider } from '@/components/ui/toast'
import DispatchDashboard from './dispatch-dashboard'
import './ops.css'

const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700', '800'], display: 'swap' })

export const metadata: Metadata = {
  title: 'مركز العمليات | تويزة بلد',
  description: 'لوحة إرسال نداءات التبرع بالدم العاجلة ومراقبتها لحظيًا — تويزة بلد',
}

export default function DispatchPage() {
  return (
    <main dir="rtl" className={`ops-root min-h-screen bg-zinc-950 text-zinc-100 antialiased ${tajawal.className}`}>
      <ToastProvider>
        <DispatchDashboard />
      </ToastProvider>
    </main>
  )
}