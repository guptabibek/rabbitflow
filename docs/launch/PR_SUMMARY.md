# Prepared pull request summary

Title: Prepare RabbitFlow's MIT-licensed launch, contributor workflow and isolated marketing site

RabbitFlow's public repository lacked a license, current installation guidance and contributor/launch infrastructure. This branch adds owner-approved MIT licensing, reorganizes the README and operational documentation, introduces issue/PR templates and CI, and provides an isolated static marketing site without changing authenticated application routes or database compatibility.

Campaign copy, directory eligibility, synthetic screenshot capture and a 90-day community plan are included under docs/launch. No release, deployment, social post, directory submission, DNS change or repository visibility change was made. The marketing site defaults to noindex until built for a known approved origin.

Validation: see VALIDATION.md for actual local outcomes. Full application readiness remains blocked by Prisma engine downloads denied by cloud network policy. CI definition is prepared, not remotely proven. No public app screenshots or live demo are claimed. Owner action remains necessary for private reporting contacts, runtime/recovery release gates and publication.
