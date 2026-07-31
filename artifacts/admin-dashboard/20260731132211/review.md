# Administrator dashboard visual review

- Run: `20260731132211`
- Manifest SHA-256: `397cd23e75ac8611ebe5f765befa24e7292e9375d425cbb13abdd5999fa00671`
- Grid: six themes × two locales × 375/768/1440 on the populated dashboard, plus nine localized state captures covering the empty dashboard, both period switches, the deleted-owner badge, and 320-pixel reflow.
- Provider-confirmed and locally finalized sales render as separate ruled groups and are never summed or merged across currency pairs; unlabeled pairs render the explicit unlabeled treatment.
- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner stays on the top-owners leaderboard with the localized non-color badge and every aggregate is unchanged.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- Visual findings requiring correction: none.
