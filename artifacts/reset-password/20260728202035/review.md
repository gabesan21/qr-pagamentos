# Public reset-password evidence review

- Run: `20260728202035`
- Manifest SHA-256: `1fe8cd9d10252dbaa7b5883489954fa25545130ca65b0d72f584aa31466973fb`
- States: valid token form (pt-BR/en × 375/768/1440), invalid token alert (pt-BR/en), submit error (pt-BR/en), successful rotation redirect to /login?password=changed (pt-BR/en).
- The page consumes the delivered challenge, rotates the password through POST /reset-password/submit, and redirects to the login completion notice.
- Automated accessibility/runtime/target/overflow findings: none.
- Visual findings requiring correction: none.
