import 'server-only'
import { getPrisma } from '../client'

/**
 * Business Profile data access (spec §4.1).
 *
 * Prisma bypasses row-level security, so nothing in the database stops a query
 * here from returning another customer's row. **Every exported function takes
 * userId as its first argument and scopes on it.** That convention is the
 * authorization model — a function that does not is a data leak, not a
 * shortcut.
 *
 * A row exists here only once the interview has completed and validated.
 * Partial answers live in profiles.interview_draft, which is why offer, icp and
 * transformation can be non-nullable and every consumer downstream gets
 * `string` rather than `string | null`.
 */

export type BusinessProfile = {
  userId: string
  /** What they sell. */
  offer: string
  /** Free text, not a number: "£3-5k", "high four figures". */
  priceBand: string | null
  /** Ideal customer profile. */
  icp: string
  /** The change in the client's business, not the deliverable. */
  transformation: string
  proof: string | null
  pointOfView: string | null
  /** Topics they refuse to post about. Never empty-checked — having none is valid. */
  taboos: string[]
  ctaTarget: string | null
  createdAt: Date
  updatedAt: Date
}

type BusinessProfileRow = {
  user_id: string
  offer: string
  price_band: string | null
  icp: string
  transformation: string
  proof: string | null
  point_of_view: string | null
  taboos: string[]
  cta_target: string | null
  created_at: Date
  updated_at: Date
}

function toBusinessProfile(row: BusinessProfileRow): BusinessProfile {
  return {
    userId: row.user_id,
    offer: row.offer,
    priceBand: row.price_band,
    icp: row.icp,
    transformation: row.transformation,
    proof: row.proof,
    pointOfView: row.point_of_view,
    taboos: row.taboos,
    ctaTarget: row.cta_target,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** The three fields the database requires, plus the optional rest. */
export type BusinessProfileInput = {
  offer: string
  icp: string
  transformation: string
  priceBand?: string | null
  proof?: string | null
  pointOfView?: string | null
  taboos?: string[]
  ctaTarget?: string | null
}

export async function getBusinessProfile(
  userId: string,
): Promise<BusinessProfile | null> {
  const row = await getPrisma().business_profiles.findUnique({
    where: { user_id: userId },
  })
  return row ? toBusinessProfile(row) : null
}

/**
 * Create or replace the user's business profile.
 *
 * Upsert rather than create, because the same form serves onboarding and the
 * later settings editor — and because a user who reruns onboarding should not
 * hit a unique-constraint error.
 */
export async function upsertBusinessProfile(
  userId: string,
  input: BusinessProfileInput,
): Promise<BusinessProfile> {
  const fields = {
    offer: input.offer,
    icp: input.icp,
    transformation: input.transformation,
    price_band: input.priceBand ?? null,
    proof: input.proof ?? null,
    point_of_view: input.pointOfView ?? null,
    taboos: input.taboos ?? [],
    cta_target: input.ctaTarget ?? null,
  }

  const row = await getPrisma().business_profiles.upsert({
    where: { user_id: userId },
    create: { user_id: userId, ...fields },
    update: fields,
  })
  return toBusinessProfile(row)
}
