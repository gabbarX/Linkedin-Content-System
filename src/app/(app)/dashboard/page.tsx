function Band({
  title,
  hint,
  children,
}: {
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <h2 className="font-display text-xl">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-8 text-sm text-[var(--color-muted)]">
      {children}
    </div>
  )
}

export default function DashboardPage() {
  return (
    <>
      <h1 className="font-display text-3xl">Today</h1>

      <div className="mt-10">
        <Band title="Needs you now" hint="Posts waiting for your approval.">
          <Empty>Nothing to approve yet. Finish onboarding to get your first week.</Empty>
        </Band>

        <Band
          title="What's happening in your world"
          hint="Fresh in your niche today, each one tap from a draft."
        >
          <Empty>Your radar starts once your strategy exists.</Empty>
        </Band>

        <Band title="What's working" hint="Clicks, conversations, and what LinkBud has learned.">
          <Empty>No published posts yet.</Empty>
        </Band>
      </div>
    </>
  )
}
