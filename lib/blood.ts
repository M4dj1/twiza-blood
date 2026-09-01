import type { BloodType } from './types'

export const BLOOD_TYPES: readonly BloodType[] = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'] as const

/**
 * RBC compatibility: target patient type -> donor types that can give to them.
 * NOTE: identical to COMPATIBLE_DONORS_MAP in /api/dispatch —
 * optionally refactor that route to `import { COMPATIBLE_DONORS } from '@/lib/blood'`
 * so this matrix lives in exactly one place.
 */
export const COMPATIBLE_DONORS: Readonly<Record<BloodType, readonly BloodType[]>> = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
}

export function isBloodType(value: unknown): value is BloodType {
  return typeof value === 'string' && (BLOOD_TYPES as readonly string[]).includes(value)
}