# Dashboard CSS Map

`../dashboard.css` is the ordered manifest for the dashboard. Keep imports in cascade order. Dashboard tokens are inherited from `/site/shared.css`, which imports `/assets/styles/design-tokens.css`.

- `chat.css`, `features.css`, `trading.css`, `live-trades.css`: large feature views that were already separate.
- `media-lab-overlays.css`: video card overlay controls.
- `shell.css`: app frame, sidebar, page headers, cards, base responsive rules.
- `treasury.css`: treasury, receipts, route panels, and related modals.
- `system-feedback.css`: compliance blocks, scrollbars, toasts, loading states, mobile nav.
- `access-gates.css`: holder/trial/free-access gates and wallet connect CTAs.
- `forms.css`: control-plane form inputs and wide primary form actions.
- `integrations.css`: future API cards, provider/status cells, and sidebar isolation overrides.
- `empty-state.css`: generic empty-state layout.
- `command-palette.css`: command palette and sidebar quick jump.
- `wallet-onboarding.css`: refined wallet modal and first-run onboarding hero.
- `polish.css`: cross-cutting visual polish loaded after structural modules.
- `holder-tools.css`: holder tools and agent checkout surfaces.
