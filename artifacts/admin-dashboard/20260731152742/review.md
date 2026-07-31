# Administrator dashboard visual review

- Run: `20260731152742`
- Manifest SHA-256: `7dd29e32f0b14b9e4d99d3ed75a2c49128c5c978922b67c13b93c98baf613b7b`
- Grid: six themes × two locales × 375/768/1440 on the populated dashboard, plus nine localized state captures covering the empty dashboard, both period switches, the deleted-owner badge, and 320-pixel reflow.
- Provider-confirmed and locally finalized sales render as separate ruled groups and are never summed or merged across currency pairs; unlabeled pairs render the explicit unlabeled treatment.
- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner stays on the top-owners leaderboard with the localized non-color badge and every aggregate is unchanged.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- Visual findings requiring correction: none.
