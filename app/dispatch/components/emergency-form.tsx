'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, ChevronDown, Loader2, RadioTower, Siren } from 'lucide-react'
import { HOSPITAL_REGISTRY } from '@/lib/hospitals'
import type { BloodType, DispatchPayload, DonorPoolPreviewResponse, Wilaya, Zone } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BloodTypeSelector } from './blood-type-selector'
import { DonorPoolPreview } from './donor-pool-preview'
import { HospitalCombobox } from './hospital-combobox'
import { UnitsStepper } from './units-stepper'

const INPUT_CLASS =
  'h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950/70 px-3.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-rose-600/70 focus:outline-none focus:ring-2 focus:ring-rose-600/20 disabled:cursor-not-allowed disabled:opacity-40'

const LABEL_CLASS = 'mb-2 block text-sm font-bold text-zinc-300'

interface EmergencyFormProps {
  wilayas: Wilaya[]
  zones: Zone[]
  submitting: boolean
  onDispatch: (payload: DispatchPayload) => Promise<boolean>
}

export default function EmergencyForm({ wilayas, zones, submitting, onDispatch }: EmergencyFormProps) {
  const [hospitalName, setHospitalName] = useState('')
  const [wilayaId, setWilayaId] = useState<number | null>(null)
  const [zoneId, setZoneId] = useState<number | null>(null)
  const [bloodType, setBloodType] = useState<BloodType | null>(null)
  const [units, setUnits] = useState(1)

  const [preview, setPreview] = useState<DonorPoolPreviewResponse | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [wilayaAutoSet, setWilayaAutoSet] = useState(false)

  const zoneOptions = useMemo(() => zones.filter(zone => zone.wilaya_id === wilayaId), [zones, wilayaId])
  const selectedWilaya = wilayas.find(w => w.id === wilayaId) ?? null
  const selectedZone = zoneOptions.find(z => z.id === zoneId) ?? null

  /** Exact registry match (typed or picked) — drives hospital↔wilaya consistency enforcement. */
  const knownHospital = useMemo(() => {
    const trimmed = hospitalName.trim()
    if (trimmed.length < 3) return null
    return (
      HOSPITAL_REGISTRY.find(
        h => h.name_ar === trimmed || h.name.toLowerCase() === trimmed.toLowerCase(),
      ) ?? null
    )
  }, [hospitalName])

  const conflictWilaya =
    knownHospital != null && wilayaId != null && knownHospital.wilaya_id !== wilayaId
  const knownWilayaName =
    knownHospital != null
      ? wilayas.find(w => w.id === knownHospital.wilaya_id)?.name_ar ?? null
      : null

  const missingParts: string[] = []
  if (hospitalName.trim().length < 2) missingParts.push('اسم المستشفى')
  if (wilayaId == null) missingParts.push('الولاية')
  if (bloodType == null) missingParts.push('فصيلة الدم')
  const ready = missingParts.length === 0 && !conflictWilaya
  const pristine = hospitalName.length === 0 && wilayaId == null && bloodType == null

  /* Debounced live donor-pool preview (aborts stale requests) */
  useEffect(() => {
    if (wilayaId == null || bloodType == null) {
      setPreview(null)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void (async () => {
        setPreviewLoading(true)
        try {
          const params = new URLSearchParams({ wilaya_id: String(wilayaId), blood_type: bloodType })
          if (zoneId != null) params.set('zone_id', String(zoneId))
          const res = await fetch(`/api/donors/preview?${params.toString()}`, { signal: controller.signal, cache: 'no-store' })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          setPreview((await res.json()) as DonorPoolPreviewResponse)
        } catch (err) {
          if (!(err instanceof DOMException && err.name === 'AbortError')) setPreview(null)
        } finally {
          if (!controller.signal.aborted) setPreviewLoading(false)
        }
      })()
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [wilayaId, zoneId, bloodType])

  /* Hospital picked from the list → its wilaya wins (hospital is more specific than wilaya) */
  const handleHospitalChange = (name: string, suggestedWilayaId: number | null) => {
    setHospitalName(name)
    if (name.trim() === '') setWilayaAutoSet(false)
    if (suggestedWilayaId != null && suggestedWilayaId !== wilayaId) {
      setWilayaId(suggestedWilayaId)
      setZoneId(null)
      setWilayaAutoSet(true)
    }
  }

  const handleWilayaChange = (raw: string) => {
    setWilayaAutoSet(false) // manual override clears the auto-set note
    setWilayaId(raw === '' ? null : Number(raw))
    setZoneId(null) // zone belongs to the previous wilaya — reset
  }

  const applyKnownWilaya = () => {
    if (knownHospital == null) return
    setWilayaId(knownHospital.wilaya_id)
    setZoneId(null)
    setWilayaAutoSet(false)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting || !ready || wilayaId == null || bloodType == null) return
    const success = await onDispatch({
      hospital_name: hospitalName.trim(),
      wilaya_id: wilayaId,
      zone_id: zoneId,
      blood_type: bloodType,
      units_needed: units,
    })
    if (success) {
      // full clean slate for the next emergency
      setHospitalName('')
      setWilayaId(null)
      setZoneId(null)
      setBloodType(null)
      setUnits(1)
      setWilayaAutoSet(false)
      // preview clears automatically via its effect once wilaya/blood reset
    }
  }

  const helperText = conflictWilaya
    ? 'تعارض في الموقع: هذا المستشفى المعروف لا يقع في الولاية المختارة — صحّحه قبل الإطلاق.'
    : ready
      ? 'عند الإطلاق يصل نداء تيليغرام شخصي إلى كل متبرع مطابق أو متوافق — مع توسيع تلقائي إلى كامل الولاية إذا كانت المجموعة المحلية صغيرة.'
      : pristine
        ? 'الحقول الإلزامية: المستشفى، الولاية، الفصيلة.'
        : `مطلوب بعد: ${missingParts.join(' · ')}`

  return (
    <form onSubmit={handleSubmit} noValidate className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-900/40 lg:sticky lg:top-6">
      {/* panel header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/70 px-5 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg border border-rose-600/25 bg-rose-600/15 text-rose-500">
          <Siren className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-extrabold text-zinc-100">إنشاء نداء استغاثة</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">حدّد الهدف ثم أطلق البث نحو المتبرعين المطابقين</p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div>
          <HospitalCombobox value={hospitalName} onChange={handleHospitalChange} wilayaId={wilayaId} />

          {conflictWilaya && knownHospital && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-300/90">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                «{knownHospital.name_ar}» يقع في <b className="text-amber-200">{knownWilayaName ?? 'ولاية أخرى'}</b>، وليس في الولاية المختارة.
              </span>
              <button
                type="button"
                onClick={applyKnownWilaya}
                className="font-bold text-amber-300 underline underline-offset-4 transition-colors hover:text-amber-200"
              >
                صحّح الولاية تلقائيًا
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* wilaya */}
          <div>
            <label htmlFor="dispatch-wilaya" className={LABEL_CLASS}>
              الولاية <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <select
                id="dispatch-wilaya"
                value={wilayaId ?? ''}
                onChange={e => handleWilayaChange(e.target.value)}
                className={cn(INPUT_CLASS, 'cursor-pointer appearance-none')}
              >
                <option value="" disabled className="bg-zinc-900">اختر الولاية…</option>
                {wilayas.map(w => (
                  <option key={w.id} value={w.id} className="bg-zinc-900">{w.id} — {w.name_ar}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            </div>
            {wilayaAutoSet && !conflictWilaya && (
              <p className="mt-1.5 text-[11px] text-emerald-400/80">✓ ضُبطت تلقائيًا وفق المستشفى المختار — يمكنك تغييرها يدويًا</p>
            )}
          </div>

          {/* zone — disabled when the wilaya has no sub-zones */}
          <div>
            <label htmlFor="dispatch-zone" className={LABEL_CLASS}>
              المنطقة <span className="font-normal text-zinc-500">(اختياري)</span>
            </label>
            <div className="relative">
              <select
                id="dispatch-zone"
                value={zoneId ?? ''}
                onChange={e => setZoneId(e.target.value === '' ? null : Number(e.target.value))}
                disabled={wilayaId == null || zoneOptions.length === 0}
                className={cn(INPUT_CLASS, 'cursor-pointer appearance-none')}
              >
                {zoneOptions.length === 0 ? (
                  <option value="" className="bg-zinc-900">
                    {wilayaId == null ? 'اختر الولاية أولًا' : 'لا مناطق فرعية — كامل الولاية'}
                  </option>
                ) : (
                  <>
                    <option value="" className="bg-zinc-900">كامل الولاية (بدون منطقة)</option>
                    {zoneOptions.map(z => (
                      <option key={z.id} value={z.id} className="bg-zinc-900">{z.name_ar}</option>
                    ))}
                  </>
                )}
              </select>
              <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            </div>
            {wilayaId != null && zoneOptions.length > 0 && (
              <p className="mt-1.5 text-[11px] text-zinc-600">تحديد منطقة يضيّق البث على متبرعيها فقط</p>
            )}
          </div>
        </div>

        <BloodTypeSelector value={bloodType} onChange={setBloodType} />
        <UnitsStepper value={units} onChange={setUnits} />

        <DonorPoolPreview
          bloodType={bloodType}
          wilayaId={wilayaId}
          zoneId={zoneId}
          units={units}
          preview={preview}
          loading={previewLoading}
          zoneName={selectedZone?.name_ar ?? selectedZone?.name ?? null}
          wilayaName={selectedWilaya?.name_ar ?? selectedWilaya?.name ?? null}
        />
      </div>

      {/* submit */}
      <div className="border-t border-zinc-800/70 px-5 py-4">
        <button
          type="submit"
          disabled={!ready || submitting}
          className={cn(
            'flex h-12 w-full items-center justify-center gap-2.5 rounded-xl text-sm font-extrabold transition-all duration-200',
            ready && !submitting
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/40 hover:bg-rose-500 active:scale-[0.99]'
              : 'cursor-not-allowed bg-zinc-800/80 text-zinc-500',
          )}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RadioTower className="h-5 w-5" />}
          {submitting ? 'جارٍ إطلاق النداء…' : 'إطلاق نداء الاستغاثة العاجل'}
        </button>
        <p className={cn('mt-2.5 text-center text-[11px] leading-relaxed', ready || pristine ? 'text-zinc-600' : 'text-amber-500/80')}>
          {helperText}
        </p>
      </div>
    </form>
  )
}