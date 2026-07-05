# Contributing

Thanks for your interest in `agent-crystallize`.

This project is early. The public surface should stay small, local-first, and
safe to inspect.

## Development

```bash
npm install
npm run build
node dist/index.js --help
```

Run a local smoke test:

```bash
node dist/index.js checkpoint \
  --body "Local smoke test. Build passes. Review generated artifact."
```

Generated `.agent-crystals/` files are local work artifacts and should not be
committed unless they are intentionally sanitized examples.

## Contribution Guidelines

- Keep the default CLI local-file-only.
- Do not add hosted sync, billing, account, or product workflow assumptions to
  the core CLI.
- Do not claim to preserve hidden chain-of-thought.
- Preserve evidence discipline: raw transcripts, diffs, logs, and tool output
  are evidence, not truth.
- Keep public docs generic and safe. Do not include private planning notes,
  customer data, private transcripts, credentials, or local machine artifacts.

## Pull Requests

Small PRs are preferred. Include:

- what changed;
- why it matters;
- how it was tested;
- any generated example output, if relevant and sanitized.

Before opening a PR, run:

```bash
npm run build
npm pack --dry-run
```
