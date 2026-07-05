# agent-crystallize v0.1.0

`agent-crystallize` is a local-first CLI for saving checkpoints and crystals
from long-running AI coding agent sessions.

> Compaction keeps the model running. Crystallization keeps the work recoverable.

Long coding-agent sessions span hours, many files, many tools, and multiple
compactions. Compaction keeps the chat going, but it flattens the work:
decisions lose their evidence, failed paths disappear, and open loops become
generic TODOs. `agent-crystallize` writes durable local Markdown that preserves
the work context a future agent needs to continue safely — current focus,
decisions, evidence pointers, open loops, changed files, test state, and a
resume prompt.

## Install

```bash
npm install -g @stewie-sh/agent-crystallize

# during work — a lightweight save-point
agent-crystallize checkpoint --body "Finished parser refactor. Tests pass. Need replay check next."

# before compaction / handoff — roll up into a session crystal
agent-crystallize now --from-checkpoints latest --body "Ready to hand off."
```

It has no account, no telemetry, no hosted database, and no runtime network
dependency in the default path. It works with any harness that can run a shell
command — Codex, Claude Code, Cursor, or your own loop.

## Learn more

- [Quickstart](./quickstart.md)
- [Crystal format](./crystal-format.md)
- [Manifesto](./manifesto.md) — the Agent Context Crystallization practice
- [Release v0.1.0](https://github.com/stewie-sh/agent-crystallize/releases/tag/v0.1.0)
- [npm package](https://www.npmjs.com/package/@stewie-sh/agent-crystallize)
