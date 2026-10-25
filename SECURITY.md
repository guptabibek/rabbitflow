# Security policy

RabbitFlow is pre-release; no supported release/version matrix or security response SLA has been established. Do not infer production suitability from feature names or historical audit documents.

Do not disclose vulnerabilities in public issues. If the repository's **Security → Advisories → Report a vulnerability** control is available, use GitHub private vulnerability reporting. Its enablement has not been verified. If unavailable, the owner must enable it and designate a private security contact before public launch; do not post exploit details while waiting. GitHub platform abuse reports are not a substitute for vulnerability triage.

Include affected commit/version, impact, minimal synthetic reproduction and proposed mitigation. Exclude real credentials and customer data. Coordinate disclosure after maintainers confirm a fix and affected versions; no guaranteed response time is currently promised.

Operators should use HTTPS, unique random keys, restricted database networks, working backups, a configured MFA encryption key, current dependencies and least-privilege project roles. Never enable ALLOW_HEADER_AUTH on an exposed deployment. See [deployment](docs/deployment.md). Security features and passing tests do not constitute an independent security audit.
