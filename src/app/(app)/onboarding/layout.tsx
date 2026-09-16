/**
 * Wraps the three onboarding step pages this milestone builds — interview,
 * samples, voice (Tasks 7-9). It adds no guard of its own, and needs none:
 * the onboarding-completeness guard lives in
 * `src/app/(app)/(onboarded)/layout.tsx`, a *sibling* route group this
 * directory sits outside of (Ruling R8) — so a request under `/onboarding`
 * never renders through that guard at all. There is no path comparison
 * standing between an onboarding page and a redirect loop, because
 * structurally there is nothing here that could redirect. This layout
 * exists only to give the three step pages a shared, narrower reading
 * column than the dashboard's, per docs/DESIGN-SYSTEM.md ("narrow reading
 * pages use max-w-2xl").
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="mx-auto max-w-2xl">{children}</div>
}
