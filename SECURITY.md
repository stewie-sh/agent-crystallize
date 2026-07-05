# Security

`agent-crystallize` writes local Markdown artifacts that may contain sensitive
work context if you put sensitive details into `--body` or stdin.

## Reporting Vulnerabilities

Please report suspected vulnerabilities privately through GitHub security
advisories when available, or by contacting the maintainers through the Stewie
project channels.

Do not open a public issue with exploit details or private data.

## Data Handling

Current default behavior:

- no network calls;
- no hosted sync;
- no telemetry;
- no credential storage;
- local files only.

Generated artifacts are written under `.agent-crystals/` by default. Review them
before committing or sharing.

Hook automation can create artifacts without an explicit manual checkpoint
command. Hook-created artifacts may include local repo paths, git state, session
ids, compact summaries, and work context from the active session. Keep generated
`.agent-crystals/` ignored unless the files have been reviewed and sanitized.

## Sensitive Material

Do not include secrets, access tokens, private customer data, proprietary
transcripts, or confidential company details in public examples or issues.
