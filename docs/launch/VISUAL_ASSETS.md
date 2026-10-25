# Visual assets and capture plan

Existing assets retained: public/brand/rabbitflow-logo.png, rabbitflow-mark.png and rabbitflow-social-card.png (1200×630). The teal/ink identity remains recognizable. New type banners: rabbitflow-banner-light.svg and rabbitflow-banner-dark.svg, each 1280×640. They are brand compositions, not product screenshots. Static-site build copies the original raster logo/mark without re-encoding. CSS presents the mark on a light plate for both color schemes.

## Required authentic captures — pending

Do not generate fictional dashboards. On a disposable seeded instance, create a project “Orbit / Sample delivery” with synthetic people such as Alex Example and Casey Example, issues for a sample release, an iteration, labels and relationships. Never use existing customer accounts or data.

Capture 1440×1000 desktop and 390×844 mobile at browser scale 1×; use consistent theme, hide browser/password-manager UI, and review each image for email, token, hostname and customer-data exposure. Do not include login passwords or developer tools. Export lossless source and optimized web derivatives only after checking readability.

| Capture | Actual UI target | What it demonstrates |
| --- | --- | --- |
| Main README image | Seeded project sprint board | Real work-item states and hierarchy |
| Feature 1 | Backlog | Prioritization and grouping |
| Feature 2 | Sprint analytics | Data-backed charts; do not invent metrics |
| Feature 3 | Project role administration | Actual role options, no real user identities |
| Mobile | Project/work-item view | Responsive behavior and keyboard/touch controls |

Place approved captures in docs/images/ and add them to README/site only when files exist. Until then the workflow diagram is explicitly labeled and the README marks screenshots pending. No missing-image placeholders are shipped.

## 90-second storyboard

0–10s: title and the team's planning problem. 10–30s: open the synthetic backlog and explain one hierarchy. 30–50s: plan an iteration and move one item through its allowed states. 50–65s: inspect sprint analytics and explain exactly what the current data shows. 65–80s: show project role boundaries and self-hosting prerequisites. 80–90s: point to GitHub/install guide and state pre-release limitations.

Record from the actual UI, show loading honestly, caption every segment and provide a transcript. Verify contrast and text readability in both themes. A static-site screenshot may demonstrate the marketing design, but must never be labeled an app screenshot.

## Captured marketing-site designs

These are actual browser captures of the isolated website, **not application screenshots**: [desktop light](../images/marketing-1440-light.png), [desktop dark](../images/marketing-1440-dark.png), [mobile light](../images/marketing-390-light.png), [mobile dark](../images/marketing-390-dark.png). Chromium checks covered layout, image loading, FAQ interaction and Axe accessibility.
