# Public reset-password evidence review

- Run: `20260804045136`
- Manifest SHA-256: `0a3693609c7d01ffd8f306d4f0510190e8acdd2c1449f669a45a8672bda3fed8`
- States: valid token form (pt-BR/en × 375/768/1440), invalid token alert (pt-BR/en), submit error (pt-BR/en), successful rotation redirect to /login?password=changed (pt-BR/en).
- The page consumes the delivered challenge, rotates the password through POST /reset-password/submit, and redirects to the login completion notice.
- Automated accessibility/runtime/target/overflow findings: none.
- Visual findings requiring correction: none.
