/**
 * The shared class name for a plain `<select>` in the onboarding wizard
 * (M1). `question-card.tsx`'s timezone dropdown and `voice-editor.tsx`'s
 * seven enum dropdowns are the only two places onboarding renders a native
 * `<select>` rather than `@/components/ui/*` -- Base UI has no select
 * primitive here yet -- so this is declared once rather than twice.
 *
 * Matches `h-8`/`py-1` from `@/components/ui/input.tsx` exactly: before
 * this was extracted, `voice-editor.tsx` had drifted to `h-9`/`py-1.5`,
 * making its selects 4px taller than every other control in the product.
 */
export const SELECT_CLASS_NAME =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm'
