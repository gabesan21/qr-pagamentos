# Login page visual review

- Run: `20260908212004`
- Manifest SHA-256: `7125bb2d7ae9e6356d071845f1162e298a1411f34c4cc1da498020aa87c02531`
- Grid: light/dark × 320/375/768/1440 on `/login`, pt-BR (persisted-locale default).
- Automated checks (focus order/visibility, contrast, axe serious/critical, overflow, brand mark size): none failing.
- Visual findings requiring correction: one severity-3 found and fixed before this run — `CardFooter`'s default `flex` row squeezed the "Esqueci minha senha" note into a sliver on the right at every viewport (missing `.auth-card__footer` CSS rule); added `flex-direction: column` so the submit button and the forgot-password note stack full-width. Confirmed clean at all eight captures in this run.
- Remaining findings: none (severity <2).
