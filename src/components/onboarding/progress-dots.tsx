/**
 * The interview's progress indicator — dots, not a percentage bar. Eleven
 * questions rendered as "63%" reads as a form; eleven small marks read as a
 * conversation that is most of the way through (docs/DESIGN-SYSTEM.md,
 * task-7 brief). Purely presentational: no state, no interactivity, so this
 * stays a plain server-renderable component.
 */
export function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Question ${current + 1} of ${total}`}
      className="flex items-center gap-1.5"
    >
      {Array.from({ length: total }, (_, index) => {
        const isCurrent = index === current
        const isPast = index < current
        return (
          <span
            key={index}
            aria-hidden="true"
            className={
              isCurrent
                ? 'h-2 w-5 rounded-full bg-brand'
                : isPast
                  ? 'h-2 w-2 rounded-full bg-brand/50'
                  : 'h-2 w-2 rounded-full bg-[var(--color-border)]'
            }
          />
        )
      })}
    </div>
  )
}
