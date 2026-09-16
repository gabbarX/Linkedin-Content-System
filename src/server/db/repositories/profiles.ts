import 'server-only'
import { prisma } from '../client'

/**
 * Profile data access.
 *
 * Prisma bypasses row-level security, so nothing in the database stops a query
 * here from returning another customer's row. **Every exported function takes
 * userId as its first argument and scopes on it.** That convention is the
 * authorization model — if you add a function that does not, you have created a
 * data leak, not a shortcut.
 *
 * The database still enforces value constraints that Prisma's types do not
 * model (Prisma has no check-constraint support): cadence_per_week must be
 * 3-5 and onboarding_step must be one of the six steps below. The types here
 * narrow those at compile time so a bad value is a type error rather than a
 * runtime database error.
 */

export const ONBOARDING_STEPS = [
  'interview',
  'samples',
  'voice',
  'strategy',
  'paywall',
  'done',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Spec: 3, 4 or 5 posts per week. Daily posting is deliberately not offered. */
export type CadencePerWeek = 3 | 4 | 5

export type Profile = {
  id: string
  email: string
  fullName: string | null
  timezone: string
  cadencePerWeek: CadencePerWeek
  preferredPostTime: Date
  onboardingStep: OnboardingStep
  createdAt: Date
  updatedAt: Date
}

type ProfileRow = {
  id: string
  email: string
  full_name: string | null
  timezone: string
  cadence_per_week: number
  preferred_post_time: Date
  onboarding_step: string
  created_at: Date
  updated_at: Date
}

/**
 * The database columns are snake_case and its types are wider than ours
 * (cadence is a smallint, onboarding_step is text with a check constraint).
 * This is the single place that translates, so callers never see either.
 */
function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    timezone: row.timezone,
    cadencePerWeek: row.cadence_per_week as CadencePerWeek,
    preferredPostTime: row.preferred_post_time,
    onboardingStep: row.onboarding_step as OnboardingStep,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The signed-in user's profile, or null if the signup trigger has not run. */
export async function getProfile(userId: string): Promise<Profile | null> {
  const row = await prisma.profiles.findUnique({ where: { id: userId } })
  return row ? toProfile(row) : null
}

export type ProfileUpdate = {
  fullName?: string | null
  timezone?: string
  cadencePerWeek?: CadencePerWeek
  preferredPostTime?: Date
  onboardingStep?: OnboardingStep
}

/**
 * Update the signed-in user's profile.
 *
 * Scoped by id, so it cannot touch another user's row even if called with a
 * patch that names one.
 */
export async function updateProfile(
  userId: string,
  patch: ProfileUpdate,
): Promise<Profile> {
  const row = await prisma.profiles.update({
    where: { id: userId },
    data: {
      ...(patch.fullName !== undefined && { full_name: patch.fullName }),
      ...(patch.timezone !== undefined && { timezone: patch.timezone }),
      ...(patch.cadencePerWeek !== undefined && {
        cadence_per_week: patch.cadencePerWeek,
      }),
      ...(patch.preferredPostTime !== undefined && {
        preferred_post_time: patch.preferredPostTime,
      }),
      ...(patch.onboardingStep !== undefined && {
        onboarding_step: patch.onboardingStep,
      }),
    },
  })
  return toProfile(row)
}

/** Where the user is in onboarding, without fetching the whole row. */
export async function getOnboardingStep(
  userId: string,
): Promise<OnboardingStep | null> {
  const row = await prisma.profiles.findUnique({
    where: { id: userId },
    select: { onboarding_step: true },
  })
  return row ? (row.onboarding_step as OnboardingStep) : null
}
