# UI design system — Orbio "paper & ink" homage

Decision: **tasteful homage**, not a pixel-faithful clone (so the project feels native
to the ecosystem without blending into ~35 other submissions).

Verified tokens from Orbio's live site CSS (`01_assets/orbio-home-css-evidence.css`):

- Canvas: `bg-paper` ≈ **#f0f0ec** (warm cream)
- Ink: `text-ink` ≈ **#141413** (near-black); muted tiers `ink-2`, `ink-3`
- Cards/layers: `bg-paper-2`, `bg-paper-3` (cream shades); overlays like `paper/80`
- Hairlines: `border-line`, `border-line-strong`
- Display type: bold, tight tracking (`tracking-[-0.035em]`), fluid size
  (`clamp(2.5rem,5.6vw,4.4rem)`), `text-balance`
- UI text: 13–15px, `tracking-[-0.01em]`
- Primary action: **ink pill** (`bg-ink text-paper`) + outline secondary
- Motifs: grain overlay, restrained glow/"orb", generous whitespace
- Layout width ~`max-w-6xl`, generous `px-5 sm:px-8`, editorial spacing

## Our token set (Tailwind v4, CSS variables)
```css
:root {
  --paper: #f0f0ec;        /* page bg */
  --paper-2: #e7e7e1;      /* card bg */
  --paper-3: #dddcd4;      /* nested/sunken */
  --ink: #141413;          /* text / primary */
  --ink-2: #55544e;        /* secondary text */
  --ink-3: #8a8982;        /* muted text */
  --line: #d8d7cf;         /* hairline borders */
  --line-strong: #c4c3ba;
  --accent: #b7791f;       /* restrained warm accent (optional; can stay ink-only) */
  --radius: 1rem;          /* ~rounded-2xl cards */
}
```
Fonts: match Orbio's editorial vibe — a tight grotesk for display (e.g., Inter tight /
Space Grotesk) + system sans for UI. (Confirm exact Orbio fonts during scaffold.)

## Screens
1. **Landing** (Orbio voice): hero with product name + one-liner, three-step how-it-
   works, "one wallet many agents" diagram, CTA (ink pill).
2. **Guard dashboard**:
   - Wallet card — ORBIO balance, floor badge, accrual/hr
   - Agents table — per-agent budget, spend today, status, kill-switch
   - Keys panel — active/rotating/revoked, one-click rotate
   - Activity ledger (spend events) with model, agent, cost, time
   - Live demo view (budget-trip → auto-rotate)
3. Consistent nav, hairline dividers, tiny uppercase eyebrow labels, bold display on
   numbers.

## Do / Don't
- DO match paper/ink palette, editorial type, pill buttons, whitespace.
- DON'T clone Orbio's exact layouts/copy; DON'T use dark-mode as default.
