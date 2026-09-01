export type BloodType = 'O-' | 'O+' | 'A-' | 'A+' | 'B-' | 'B+' | 'AB-' | 'AB+'

export interface Wilaya { id: number; name: string; name_ar: string }
export interface Zone { id: number; wilaya_id: number; name: string; name_ar: string }
export interface GeoResponse { wilayas: Wilaya[]; zones: Zone[] }

export interface DonorPoolPreviewResponse {
  zone: { direct: number; compatible: number } | null
  wilaya: { direct: number; compatible: number }
}

export type EmergencyStatus = 'open' | 'fulfilled' | 'closed'
export type ConnectionState = 'connecting' | 'realtime' | 'polling'

export interface PledgeDonor {
  id: string
  blood_type: string | null
  wilaya_id: number | null
  zone_id: number | null
}

export interface PledgeDTO {
  id: string
  ticket_id: string
  status: string
  created_at: string
  donor: PledgeDonor | null
}

export interface EmergencyDTO {
  id: string
  hospital_name: string
  wilaya_id: number
  zone_id: number | null
  blood_type: string
  units_needed: number
  pledges_count: number
  status: string
  created_at: string
  pledges: PledgeDTO[]
}

export interface OpsStats {
  active_emergencies: number
  open_units_needed: number
  pledges_last_24h: number
  active_donors: number
}

export interface EmergencyFeedResponse {
  emergencies: EmergencyDTO[]
  stats: OpsStats
  server_time: string
}

export interface DispatchPayload {
  hospital_name: string
  wilaya_id: number
  zone_id: number | null
  blood_type: BloodType
  units_needed: number
}

export interface DispatchResponse {
  ok: boolean
  notified_count: number
  matched_count: number
  scope: string
  emergency_id: string
  compatible_groups?: string[]
}

export interface ApiError { error: string }

export interface HospitalSuggestion { name_ar: string; name: string; wilaya_id: number }

/** UI helper for resolving wilaya/zone names from ids */
export interface GeoLookup {
  wilayaName(id: number | null): string | null
  zoneName(id: number | null): string | null
}