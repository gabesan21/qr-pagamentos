# Public reset-password evidence review

- Run: `20260728015922`
- Manifest SHA-256: `d9ead9591d4d4c39f0478de4eb7d081f11b2272a4062b7890289c07804a3b6f0`
- States: valid token form (pt-BR/en × 375/768/1440), invalid token alert (pt-BR/en), submit error (pt-BR/en), successful rotation redirect to /login?password=changed (pt-BR/en).
- The page consumes the delivered challenge, rotates the password through POST /reset-password/submit, and redirects to the login completion notice.
- Automated accessibility/runtime/target/overflow findings: none.
- Visual findings requiring correction: none.
