# Administrator settings hub visual review

- Run: `20260731142134`
- Manifest SHA-256: `d3eeefe796b9baab4552b4968c49a383745e671c2e8c579a78f6af8fb47cc3ce`
- Grid: six themes × two locales × 375/768/1440 hub captures, plus four localized state captures including 320-pixel reflow, the empty registry, the saved default theme, and the registered exchange currency.
- The default-theme save runs through the delivered POST /admin/settings/default-theme route and persists: a later render shows the saved selection, a merchant created afterward carries the saved theme, and a new administrator keeps NULL.
- The exchange-currency registration runs through the delivered POST /admin/exchange-currencies route and lands back on the hub with the opaque success notice.
- Automated accessibility/runtime/target/overflow/focus findings: none.
- The failure notices are induced only in unit/route tests: the closed selects and validated inputs cannot submit an invalid value honestly, so no runtime failure capture exists.
- Visual findings requiring correction: none.
