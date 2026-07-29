# Public reset-password evidence review

- Run: `20260729023618`
- Manifest SHA-256: `ac38e3aa23ad059ed604ae5f4a07893470264497017be246416043048cc6bc7c`
- States: valid token form (pt-BR/en × 375/768/1440), invalid token alert (pt-BR/en), submit error (pt-BR/en), successful rotation redirect to /login?password=changed (pt-BR/en).
- The page consumes the delivered challenge, rotates the password through POST /reset-password/submit, and redirects to the login completion notice.
- Automated accessibility/runtime/target/overflow findings: none.
- Visual findings requiring correction: none.
