# 30/60/90-day execution plan

Day 1 starts after owner acceptance of this launch branch. Timing depends on maintainer capacity; validation gates take priority over a promotion date.

| Window | Work | Evidence and decision |
| --- | --- | --- |
| Days 1–30 | Resolve network/runtime blockers; verify clean native/Docker install, restore and core journeys; enable disclosure; merge docs/CI/MIT; capture authentic media; prepare first pre-release | Newcomer install report, CI run, recovery evidence and actual release checklist; owner decides whether to publish and begin one technical announcement |
| Days 31–60 | Fix recurring setup bugs; publish tested Docker/workflow articles; review first external PRs; run a small opt-in pilot; improve docs from questions | Installation failure categories, issue turnaround distribution, external PRs merged, pilot workflow outcomes; pause promotion if blockers recur |
| Days 61–90 | Refine operations/accessibility; prioritize requested integrations only after scope review; share pilot findings; assess relevant directories; improve contributor retention | Repeat contributors, resolved pilot defects, search queries and documentation gaps; directory eligibility recalculated from actual release date |

## Measurement without intrusive tracking

- GitHub aggregate visitors/referrers/stars: owner records available repository insights weekly, acknowledges retention windows and treats stars as interest rather than adoption.
- Release downloads: count actual release assets when they exist; source clones and Docker pulls are different signals.
- Successful installs: ask an optional “Did this work? OS/version/blocker?” question; no automatic instance identifiers or phone-home code.
- Community: count substantive discussions, reproducible bugs, external PRs and repeat contributors; do not count bot/dependency activity as community growth.
- Website: use owner-approved search-console impressions/clicks and optional privacy-respecting aggregate documentation usage; no tracking is added here.
- Quality: track first-run failures, time to reproduce, permission defects and restore-drill outcomes before expanding reach.

Establish baselines in the first two weeks instead of promising arbitrary star counts. Each monthly review should choose one bottleneck (installation, workflow clarity or contributor onboarding), assign an owner and check whether the next iteration improved observed outcomes.
