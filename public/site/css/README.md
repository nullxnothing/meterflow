# Public CSS Map

`../shared.css` is the public design-system entrypoint. Keep it as a manifest only. Shared tokens live in `/assets/styles/design-tokens.css` and are imported by `00-foundation.css`.

- `00-foundation.css`: reset, tokens, base body styles, scrollbars, focus rings.
- `01-background.css`: the only public-page atmosphere layer, using the shared shadow mask/noise assets.
- `01-typography-legal.css`: shared type utilities and legal-page typography.
- `02-public-nav.css`: the only owner of public nav, mobile menu, and shared button styles.
- `03-public-components.css`: legacy shared public components, fallback footers, and subpage primitives.
- `04-effects.css`: shared ambient effects, motion affordances, and overflow guards.
- `05-primitives.css`: reusable panels, badges, fields, tables, states, skeletons, and 404 layout.
- `06-cohesion.css`: final shell compatibility rules.
- `public-pages.css`: secondary-page content polish only. It must not style nav, buttons, or footer.

Page CSS files such as `home.css`, `token.css`, `roadmap.css`, `status.css`, and `apply.css` should own page content only. Nav, buttons, form basics, cards, status states, and footer primitives belong in `shared.css`.
