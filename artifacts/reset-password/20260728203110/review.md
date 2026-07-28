# Public reset-password evidence review

- Run: `20260728203110`
- Manifest SHA-256: `cb88f160664f91fb8fce7285b77d8b9405a15eec46db85c82208c569fd911be9`
- States: valid token form (pt-BR/en × 375/768/1440), invalid token alert (pt-BR/en), submit error (pt-BR/en), successful rotation redirect to /login?password=changed (pt-BR/en).
- The page consumes the delivered challenge, rotates the password through POST /reset-password/submit, and redirects to the login completion notice.
- Automated accessibility/runtime/target/overflow findings: none.
- Visual findings requiring correction: none.
