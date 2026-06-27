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

## Sensitive Material

Do not include secrets, access tokens, private customer data, proprietary
transcripts, or confidential company details in public examples or issues.
