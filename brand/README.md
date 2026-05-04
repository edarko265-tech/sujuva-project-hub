# Sujuva brand assets

Source-of-truth artefacts for the Sujuva visual identity. Use these when building
docs, slide decks, or any UI that lives outside this app.

| File | Purpose |
|---|---|
| `Sujuva-Brand-Book.pdf` | Full brand book — colour palette, typography rules, logo do's & don'ts. |
| `Sujuva-Logo.png` | Master logo (also copied to [`public/logo.png`](../public/logo.png) for the web app). |

## Where the brand lives in code

- Tailwind palette: see `tailwind.config.ts` (`brand-navy`, `brand-gold`, `brand-cream`, `brand-ink`).
- Component classes: `.btn-primary`, `.btn-gold`, `.card`, `.input`, `.badge-*` in `src/app/globals.css`.
- Logo component: `src/components/Logo.tsx`.

## Adding the brand font

Drop the font files (`.woff2` / `.ttf` / `.otf`) into this folder, then either:

1. Copy a `.woff2` into `public/fonts/` and load it via `next/font/local` in
   `src/app/layout.tsx`, **or**
2. Use a Google Font alternative via `next/font/google` if licence-restricted.
