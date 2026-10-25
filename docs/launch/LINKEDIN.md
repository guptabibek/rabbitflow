# LinkedIn and social drafts

Owner review required. Do not publish until the referenced release/install path is verified. Adapt first-person claims to actual authorship. Use one authentic image and a meaningful technical point per post; do not invent adoption numbers.

## Developer announcement

“I’m preparing RabbitFlow, an MIT-licensed self-hosted Agile project-management app, for its first release. It connects a team's backlog, boards, iterations and configurable work-item workflows. I’m looking for careful installation feedback before broader use. Code and current limitations: https://github.com/guptabibek/rabbitflow.”

## Architecture

“RabbitFlow uses one Next.js application for React UI and API handlers, with domain services and Prisma/PostgreSQL underneath. One deployment lesson: schema push does not install PostgreSQL full-text-search triggers. Our evaluation guide now calls for SQL migrations. Architecture and source: https://github.com/guptabibek/rabbitflow.”

## Feature showcase

“A useful planning tour should follow one real work item: backlog → iteration → board → review. RabbitFlow has code for that connected workflow. The next step is verifying it end to end with synthetic data, then publishing an honest walkthrough.” Attach a real capture only after verification.

## Video announcement: not prepared for publication

There is no recorded walkthrough yet. Use YOUTUBE.md to capture the actual UI, then review the final video, transcript and working URL before writing an announcement. A screenshot is not a live demo.

## Contribution invitation

“Want to help make a self-hosted planning tool easier to evaluate? RabbitFlow needs reproducible install feedback, focused documentation fixes and meaningful workflow tests. Start with CONTRIBUTING.md and choose a scoped task with a maintainer.”

## Release announcement: blocked

No release/tag has been verified or authorized. After release gates pass, write an announcement using the actual version, published URL, verified changes and migration notes. There is no publishable release announcement in this package; no placeholder version or invented release is supplied.
