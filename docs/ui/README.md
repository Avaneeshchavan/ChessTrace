# ChessTrace UI review

Chrome captures of the local client, using the local vision service and public game records already in Neon. The Origin Lens example starts with a board rendered from the Anand–Bareev position and uses the normal upload, correction, search, and replay controls.

- [Landing desktop](landing-desktop.png)
- [Landing mobile](landing-mobile.png)
- [Origin Lens desktop](lens-desktop.png)
- [Origin Lens mobile](lens-mobile.png)
- [Origin Lens mobile board review](lens-review-mobile.png)
- [Sandbox desktop](sandbox-desktop.png)
- [Sandbox mobile](sandbox-mobile.png)

Mobile Lighthouse on the production preview landing page scored 98 for performance and 100 for accessibility, best practices, and SEO. Chrome checks covered desktop and 390px mobile navigation, the registration CTA, keyboard upload, corrected castling rights, a live exact match, replay, and board alignment while resizing with reduced motion enabled.

See the ten ranked findings and the five implemented changes in [CRITIQUE.md](CRITIQUE.md).

Follow-up: [November 2026 product design review](REVIEW-2026-11.md), ranked against these captures and the current components.

[M1 verification](../M1.md) includes updated Origin Lens and Sandbox captures at 1280px and 390px.
