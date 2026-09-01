import type { HospitalSuggestion } from './types'

/**
 * Static suggestion registry of major Algerian CHUs — NOT mock data:
 * it's a UX typing aid, every submission is free text against the real API.
 * Swap for a `hospitals` table + /api/hospitals once you outgrow this list.
 */
export const HOSPITAL_REGISTRY: readonly HospitalSuggestion[] = [
  { name_ar: 'مستشفى مصطفى باشا', name: 'CHU Mustapha Pacha', wilaya_id: 16 },
  { name_ar: 'مستشفى باب الوادي', name: 'CHU Bab El Oued', wilaya_id: 16 },
  { name_ar: 'مستشفى بني مسوس', name: 'CHU Beni Messous', wilaya_id: 16 },
  { name_ar: 'مستشفى كوبا', name: 'CHU Kouba', wilaya_id: 16 },
  { name_ar: 'المركز الاستشفائي الجامعي وهران', name: 'CHU Oran', wilaya_id: 31 },
  { name_ar: 'وحدة الاستعجالات كاناستال', name: 'EHU Canastel', wilaya_id: 31 },
  { name_ar: 'المركز الاستشفائي الجامعي باتنة', name: 'CHU Batna', wilaya_id: 5 },
  { name_ar: 'المركز الاستشفائي الجامعي قسنطينة', name: 'CHU Constantine', wilaya_id: 25 },
  { name_ar: 'المركز الاستشفائي الجامعي عنابة', name: 'CHU Annaba', wilaya_id: 23 },
  { name_ar: 'المركز الاستشفائي الجامعي سطيف', name: 'CHU Sétif', wilaya_id: 19 },
  { name_ar: 'المركز الاستشفائي الجامعي تلمسان', name: 'CHU Tlemcen', wilaya_id: 13 },
  { name_ar: 'المركز الاستشفائي الجامعي البليدة', name: 'CHU Blida', wilaya_id: 9 },
  { name_ar: 'المركز الاستشفائي الجامعي بجاية', name: 'CHU Béjaïa', wilaya_id: 6 },
  { name_ar: 'المركز الاستشفائي الجامعي تيزي وزو', name: 'CHU Tizi Ouzou', wilaya_id: 15 },
  { name_ar: 'المركز الاستشفائي الجامعي بسكرة', name: 'CHU Biskra', wilaya_id: 7 },
  { name_ar: 'المركز الاستشفائي الجامعي ورقلة', name: 'CHU Ouargla', wilaya_id: 30 },
]