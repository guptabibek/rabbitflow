# Contributing to RabbitFlow

Start with [development setup](docs/getting-started.md), [architecture](docs/architecture.md) and [roadmap](ROADMAP.md). RabbitFlow is licensed under [MIT](LICENSE), selected with owner approval. Contributions are made under MIT; submit only work you have the right to contribute and retain third-party notices.

For a bug, search existing issues and include reproducible steps, expected/actual behavior, commit, Node/Docker version and sanitized logs. Report vulnerabilities privately through [SECURITY.md](SECURITY.md), not an issue. For a feature, explain the user workflow and constraints before implementing a broad change.

Work on a focused feature branch. Follow the existing TypeScript/React patterns, domain boundaries and project authorization checks. Do not change migrations already used by deployments; add reviewed forward migrations and a recovery plan. Keep credentials and production data out of fixtures and screenshots.

Before a PR, run lint, TypeScript, domain tests, build and relevant database/E2E checks from the development guide. Identify skipped or blocked checks in the PR. A database test must target a disposable database. Add meaningful regression coverage when behavior changes; avoid unrelated formatting/dependency churn.

Useful first tasks: reproduce the clean-install guide, replace stale E2E setup instructions, add coverage for missing configuration, or capture an accessible synthetic-data product tour after startup works. Confirm an issue's scope with a maintainer before a large implementation.

PRs should explain the user problem, resulting behavior, validation evidence and deployment impact. Maintainers review scope and security before merging; no response-time SLA is promised. Credit contributors in release notes with consent. Participation follows the [code of conduct](CODE_OF_CONDUCT.md).
