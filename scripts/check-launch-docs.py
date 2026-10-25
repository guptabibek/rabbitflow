#!/usr/bin/env python3
"""Check local file links in the maintained launch documentation, without network access."""
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

root = Path(__file__).resolve().parents[1]
files = [root / name for name in (
    'README.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md',
    'SUPPORT.md', 'CHANGELOG.md', 'ROADMAP.md', 'site/README.md',
    'docs/architecture.md', 'docs/configuration.md', 'docs/deployment.md',
    'docs/getting-started.md', 'docs/troubleshooting.md', 'tests/e2e/README.md')]
files += sorted((root / 'docs/launch').glob('*.md'))
failures = []
checked = 0
for file in files:
    text = file.read_text()
    for match in re.finditer(r'!?\[[^\]]*\]\(([^)]+)\)', text):
        target = match.group(1).split(' "', 1)[0].strip('<>')
        url = urlsplit(target)
        if url.scheme or url.netloc or not url.path:
            continue
        path = (root / unquote(url.path.lstrip('/'))) if url.path.startswith('/') else (file.parent / unquote(url.path))
        checked += 1
        if not path.exists():
            failures.append(f'{file.relative_to(root)}: missing {target}')
for failure in failures:
    print(failure, file=sys.stderr)
print(f'Checked {checked} local file links in {len(files)} documents; {len(failures)} missing')
sys.exit(bool(failures))
