# Design system

**Direction: calm editorial.** Warm off-white ground, near-black text, one restrained accent, real typographic hierarchy, generous whitespace, minimal chrome. The core act in this product is reading and approving words, so the interface behaves like a writing tool, not a control panel.

Everything below is what is actually in `src/app/globals.css` and `src/components/ui/` today. Read that file before changing anything here; if the two disagree, the CSS is right and this document needs fixing.

---

## How the token layer is wired

`src/app/globals.css` has four parts, in this order:

1. **Imports** — `tailwindcss`, `tw-animate-css`, and `shadcn/tailwind.css` (shadcn's `data-state` custom-variant plumbing for Base UI).
2. **Raw tokens** — the `--lb-*` custom properties on `:root`, with a dark set on `:root[data-theme="dark"]`.
3. **`@theme inline`** — maps the raw tokens onto the `--color-*`, `--font-*` and `--radius-*` names Tailwind generates utilities from.
4. **The shadcn reconciliation block** — points shadcn's `--background`, `--primary`, etc. at the `--lb-*` values so there is one palette, not two.

The indirection in step 2/3 is load-bearing: a `--color-x: var(--color-x)` self-reference inside `@theme inline` does not resolve, so the raw values need their own `--lb-*` names. Do not "simplify" it by collapsing the two layers.

Dark mode is driven by `@custom-variant dark (&:is([data-theme="dark"] *))` — the `[data-theme="dark"]` attribute, **not** Tailwind's default `.dark` class. One switch for the whole visual language. Nothing sets that attribute yet: the dark palette is defined and correct, but there is no theme toggle in the app, and `next-themes` is installed only because the generated `sonner.tsx` imports `useTheme` (with no provider mounted, it resolves to `"system"`).

### Colour tokens

| Raw token | Light | Dark | Tailwind name | Example utilities |
|---|---|---|---|---|
| `--lb-bg` | `#faf8f4` | `#171613` | `--color-bg` | `bg-bg` |
| `--lb-surface` | `#ffffff` | `#201e1a` | `--color-surface` | `bg-surface` |
| `--lb-text` | `#1a1917` | `#f2efe8` | `--color-text` | `text-text` |
| `--lb-muted` | `#6b6760` | `#a09a90` | `--color-text-muted` | `text-text-muted` |
| `--lb-border` | `#e7e2d8` | `#322e28` | `--color-border` | `border-border` |
| `--lb-accent` | `#1f4b43` | `#6fae9d` | `--color-brand` | `bg-brand`, `text-brand` |
| `--lb-accent-fg` | `#ffffff` | `#14211d` | `--color-accent-fg` | `text-accent-fg` (the foreground that pairs with `bg-brand`) |
| `--lb-danger` | `#9b3626` | `#d4705c` | `--color-danger` | `text-danger` |

There is **exactly one accent**, the deep green `--lb-accent`. `--lb-danger` is a state colour for destructive actions and errors, not a second accent — do not use it decoratively.

**`brand` and `text-muted`, not `accent` and `muted`.** Those two names are shadcn's, and in the primitives they mean "subtle hover or surface colour", not "the brand green" and "the muted text colour". Pointing them at the `--lb-*` values mis-coloured the whole kit: `focus:bg-accent` on a dropdown item painted dark green on near-black, `hover:bg-muted` on the outline button painted `#6b6760` on the page ground, and the tabs list rendered `#6b6760` text on a `#6b6760` background. `--color-accent` and `--color-muted` now map to shadcn's own `--accent` / `--muted`, which the reconciliation block points at `--lb-surface`. Use `bg-brand` / `text-text-muted` for LinkBud's colours and leave `bg-accent` / `bg-muted` to the primitives.

### Radius tokens

| Raw token | Value | Tailwind name | Utility |
|---|---|---|---|
| `--lb-radius-sm` | `4px` | `--radius-sm` | `rounded-sm` |
| `--lb-radius-md` | `6px` | `--radius-md` | `rounded-md` |
| `--lb-radius-lg` | `10px` | `--radius-lg` | `rounded-lg` |

`--radius-xl` … `--radius-4xl` are derived from `--lb-radius-lg` (×1.4, ×1.8, ×2.2, ×2.6 → 14, 18, 22, 26px), so the scale is monotonic: **4, 6, 10, 14, 18, 22, 26**. They used to derive from shadcn's `--radius`, which is `--lb-radius-md` (6px), making `rounded-xl` 8.4px — *smaller* than `rounded-lg` — while `card.tsx` used `rounded-xl` and `dropdown-menu.tsx` used `rounded-lg`. If you change `--lb-radius-lg`, the whole upper scale moves with it.

shadcn's own `--radius` is still reconciled to `--lb-radius-md`; `sonner.tsx` reads it directly.

### Fonts

Loaded in `src/app/layout.tsx` via `next/font/google` as CSS variables on `<html>`:

| Family | Variable | Tailwind name | Use |
|---|---|---|---|
| Inter | `--font-inter` | `--font-sans` → `font-sans` | Body, UI, everything by default (`html` gets `font-sans` in `@layer base`) |
| Fraunces | `--font-fraunces` | `--font-display` → `font-display` | Headings and the wordmark only |

Both have real fallback stacks (`ui-sans-serif, system-ui, sans-serif` and `ui-serif, Georgia, serif`). Do not add a third family.

### The shadcn reconciliation block — read this before editing `globals.css`

`shadcn init` wrote its own neutral `oklch()` palette (`--background`, `--foreground`, `--primary`, `--card`, `--border`, `--ring`, the `--chart-*` and `--sidebar-*` sets) as **plain, unlayered** rules. CSS cascade layers always lose to unlayered styles regardless of source order, so the block at the bottom of the file that re-points those names at `--lb-*` **must also stay unlayered**. Moving it into `@layer base` would mean any regenerated shadcn default silently wins. There is a comment in the file saying this; leave it there.

Those generated `oklch()` literals have been **deleted** from `:root`. Every one of them was redeclared by the reconciliation block at the bottom of the same file, at identical specificity and later in source order — so they never applied, and an agent told to change the palette would have edited them and seen nothing happen. The `--chart-*` and `--sidebar-*` sets and their `@theme` mappings are gone entirely; nothing referenced them. `globals.css` now has exactly one place where a colour is written down: the `--lb-*` block.

**Where this reconciliation works, and where it does not.** `bg-primary` resolves to `--lb-accent`, `bg-card` and `bg-popover` to `--lb-surface`, `bg-background` to `--lb-bg`, `text-foreground` to `--lb-text`, `border-border` to `--lb-border` — those five names carry the same meaning in both systems, so the primitives take the LinkBud palette unmodified.

`accent` and `muted` do **not** reconcile, because the two systems disagree about what the words mean. In shadcn they are subtle surface colours (`focus:bg-accent`, `hover:bg-muted`); in LinkBud they were the brand green and the muted text colour. They are reconciled to `--lb-surface` instead, and LinkBud's two values live under `brand` and `text-muted`. Do not point `--color-accent` or `--color-muted` back at `--lb-accent` / `--lb-muted` — that is the bug this replaced.

---

## Type scale

There is no custom type scale in `globals.css` — Tailwind v4's default scale is used, and the convention is to stay inside this subset:

| Utility | Size / line-height | Used for |
|---|---|---|
| `font-display text-5xl` | 3rem / 1 | Landing hero only (paired with `leading-tight`) |
| `font-display text-3xl` | 1.875rem / 1.2 | Page title (one per page) |
| `font-display text-xl` | 1.25rem / 1.4 | Section and band headings |
| `font-display text-lg` | 1.125rem / 1.56 | The wordmark in the nav |
| `text-lg` | 1.125rem / 1.56 | Lede paragraph under a hero |
| `text-base` | 1rem / 1.5 | Body copy |
| `text-sm` | 0.875rem / 1.43 | Nav, secondary and muted text, form labels |

`.prose-post` is the one bespoke class: `max-width: 62ch`, `line-height: 1.65`, `white-space: pre-wrap`. It is for rendering post text — the LinkedIn preview and the editor — where line breaks are meaningful and measure matters. Long-form reading is the core act in this product; do not render post text at full container width.

## Spacing rhythm

Tailwind's default 0.25rem step. The conventions already established in the shell:

- **Page container:** `mx-auto max-w-5xl px-6 py-10` (in `(app)/layout.tsx`). Narrow reading pages use `max-w-2xl`.
- **Nav bar:** `h-14`, items spaced `gap-6`/`gap-8`.
- **Between major sections / bands:** `mb-12`.
- **Heading → hint text:** `mt-1`. **Hint → content:** `mt-4`. **Page title → first band:** `mt-10`.
- **Inside a card or empty state:** `p-8` for a large empty state, `p-6` for content.

Generous whitespace is the design, not padding waste. When in doubt, add a step rather than removing one.

---

## Component inventory

Installed via the shadcn CLI at the **Nova preset**, which is backed by **Base UI** primitives (`@base-ui/react`), not Radix. Lucide is the icon library.

`src/components/ui/`: `badge`, `button`, `card`, `dialog`, `dropdown-menu`, `input`, `label`, `separator`, `sonner`, `tabs`, `textarea`.

`src/components/`: `app-nav.tsx` (authenticated navigation; not a primitive).

Nothing else is installed. Add a primitive with `npx shadcn@latest add <name>` rather than hand-rolling one — but adding a *dependency* is on the "stop and ask the human" list in `CLAUDE.md`.

### Base UI gotchas — these have already cost time

- **`Button` has no `asChild` prop.** Radix's `asChild` pattern does not exist here; Base UI composes with a `render` prop. This is a typecheck failure, not a runtime surprise:

  ```tsx
  // wrong — TS2322: Property 'asChild' does not exist
  <Button asChild><Link href="/login">Get started</Link></Button>

  // right — children stay on the outer component
  <Button render={<Link href="/login" />}>Get started</Button>
  ```

  Any spec, plan or blog snippet using classic shadcn/Radix `asChild` needs this substitution. `src/components/ui/dialog.tsx` shows the same idiom (`<DialogPrimitive.Close render={<Button variant="outline" />}>`).

- **`cn` comes from the `cn` package, not `clsx` + `tailwind-merge`.** The generated primitives `import { cn } from "cn"`; `src/lib/utils.ts` re-exports it so `@/lib/utils` also works. Follow whichever the file next to you uses; do not introduce a third helper.

- **`Toaster` is not mounted anywhere yet.** Whoever needs toasts mounts it once in a layout.

### Button variants and sizes actually available

Variants: `default` (accent fill), `outline`, `secondary`, `ghost`, `destructive`, `link`.
Sizes: `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`.

Do not add a variant for a one-off. If a screen needs a button that none of these covers, that is a design question for the human, not a new entry in `buttonVariants`.

---

## Banned patterns

These are the default signatures of AI-generated interfaces. They make a paid product read as a weekend project, and this product's entire pitch is that it is a professional writing tool. Each ban has a reason; a rule without a reason gets rationalised away at 1am.

| Banned | Why |
|---|---|
| Purple/indigo gradients — and gradients generally | The single most recognisable "an AI made this" tell. The ground is a flat warm off-white; that flatness is the look. |
| Glassmorphism, backdrop blur panels | Decorative depth with no informational job, and it destroys text contrast on the exact surface where people read. |
| Neon on dark | Contradicts calm editorial outright, and our dark palette is a muted warm charcoal, not a display surface. |
| Emoji as UI iconography | Renders differently on every platform, carries no semantics for screen readers, and reads as amateur in a tool for professionals. Use Lucide. |
| More than one accent colour | One accent means the accent always means "this is the action". Two accents mean neither means anything. `--lb-danger` is a state, not an accent. **One scoped exception**, see below. |
| Decorative shadows | Shadow is for real elevation — a dialog, a dropdown over content. A shadow under a static card is noise. Use `--lb-border` for separation. |
| Hard-coded hex or `oklch()` values in components | The point of the token layer is that the visual language changes in one file. A literal colour in a component is a permanent exception. |
| A second font family | Two families (Inter, Fraunces) already carry the hierarchy. A third is decoration. **One scoped exception**, see below. |
| Animating anything that is not a state change | Entrance animations on static content delay reading. `tw-animate-css` is installed for dialog/dropdown transitions, not for scroll reveals. |
| Icon-only buttons for destructive or irreversible actions | Publishing to a real customer's real feed gets a labelled button, every time. |

## How to reference tokens in components

## The one exemption: `.linkedin-preview`

Spec §6.1 was amended on 2026-09-17 for Milestone 5. The writer's post preview
reproduces LinkedIn's own palette, spacing and system font stack, because its
job is to show the writer what a reader actually sees — where the post folds
behind "…see more", how the line breaks land, whether the hook survives
truncation. Drawn in LinkBud's palette it would be prettier and would lie about
all three.

This is the only place in the product where a colour outside the `--lb-*` set is
allowed, and the rules that keep it an exception rather than a precedent:

- LinkedIn's values are `--li-*` custom properties declared in **one** block in
  `globals.css`, scoped to `.linkedin-preview`. Components reference
  `var(--li-*)`; no component contains a literal colour, so the hard-coded-hex
  ban is untouched.
- **Nothing outside that block may reference an `--li-*` value.** LinkedIn blue
  is not available to LinkBud's chrome. `--lb-accent` is still the only accent
  the product has.
- **No LinkedIn logo or wordmark.** The preview reproduces a layout, not a
  brand.

If you are reaching for a second palette anywhere else, this section is not your
precedent — it is the argument for why you need your own amendment.

Prefer Tailwind utilities generated from the theme: `bg-bg`, `bg-surface`, `text-text-muted`, `border-border`, `bg-brand text-accent-fg`, `font-display`, `rounded-lg`.

Some existing files use the explicit `text-[var(--color-text-muted)]` form — that is a real Tailwind arbitrary value and it resolves to the same token, so it is correct, just more verbose. Either is acceptable; a raw `#hex` is not.
