# Security policy

RabbitFlow is pre-release; no supported release/version matrix or security response SLA has been established. Do not infer production suitability from feature names or historical audit documents.

Do not disclose vulnerabilities in public issues. Email [guptabibek166@gmail.com](mailto:guptabibek166@gmail.com) with a concise private report. This contact was explicitly approved for publication by the owner. Do not include live credentials or customer data.

GitHub private vulnerability reporting is currently disabled. The integration cannot enable it (repository-admin permission is required). Once the owner enables **Settings → Security → Code security → Private vulnerability reporting**, reporters may also use **Security → Advisories → Report a vulnerability**. Until then, the email above is the supported private route. No response-time SLA is promised.

Include affected commit/version, impact, minimal synthetic reproduction and proposed mitigation. Exclude real credentials and customer data. Coordinate disclosure after maintainers confirm a fix and affected versions; no guaranteed response time is currently promised.

Operators should use HTTPS, unique random keys, restricted database networks, working backups, a configured MFA encryption key, current dependencies and least-privilege project roles. Never enable ALLOW_HEADER_AUTH on an exposed deployment. See [deployment](docs/deployment.md). Security features and passing tests do not constitute an independent security audit.
