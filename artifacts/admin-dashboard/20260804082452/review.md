# Administrator dashboard visual review

- Run: `20260804082452`
- Manifest SHA-256: `7c02613498a1e96a7083517a23e2c64d01f2d9d97faf9727a7f877063e1789c3`
- Grid: six themes × two locales × 375/768/1440 on the populated dashboard, plus nine localized state captures covering the empty dashboard, both period switches, the deleted-owner badge, and 320-pixel reflow.
- Provider-confirmed and locally finalized sales render as separate ruled groups and are never summed or merged across currency pairs; unlabeled pairs render the explicit unlabeled treatment.
- Soft-delete runs through the delivered POST /admin/users/[id]/delete route; the deleted owner stays on the top-owners leaderboard with the localized non-color badge and every aggregate is unchanged.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- Visual findings requiring correction: none.
