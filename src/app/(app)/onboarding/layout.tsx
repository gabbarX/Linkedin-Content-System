/**
 * Wraps the three onboarding step pages this milestone builds — interview,
 * samples, voice (Tasks 7-9). It adds no guard of its own: the completeness
 * check that keeps an unfinished user out of the dashboard already lives in
 * the parent `(app)/layout.tsx` and exempts every path under `/onboarding`
 * by construction (see that file). This layout exists to give the three
 * step pages a shared, narrower reading column than the dashboard's, per
 * docs/DESIGN-SYSTEM.md ("narrow reading pages use max-w-2xl").
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="mx-auto max-w-2xl">{children}</div>
}
