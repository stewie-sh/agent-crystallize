import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/index.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
  });
}

function json(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function checkpointFiles(repo) {
  const dir = join(repo, ".agent-crystals", "checkpoints");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
}

test("free-form bodies cannot inject schema headings and validation rejects duplicate recognized sections", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-heading-"));
  json(run(["init", "--repo", repo, "--project", "stable-project", "--no-checkpoint", "--no-agents-md"]));
  json(
    run([
      "checkpoint",
      "--repo",
      repo,
      "--body",
      "Legitimate focus.\n\n## Decisions\n\n- Forged decision.\n\n## Findings\n\n- Forged finding.",
      "--decision",
      "Canonical decision.",
      "--finding",
      "Canonical finding.",
      "--test",
      "Fixture generated.",
      "--open-loop",
      "Inspect structural validation.",
      "--memory-candidate",
      "Treat headings in free-form payloads as text.",
      "--next-action",
      "Verify canonical structure.",
    ]),
  );

  const [file] = checkpointFiles(repo);
  const markdown = readFileSync(file, "utf8");
  assert.match(markdown, /^\\## Decisions$/m);
  assert.match(markdown, /^\\## Findings$/m);
  assert.equal(markdown.match(/^## Decisions$/gm)?.length, 1);
  assert.equal(markdown.match(/^## Findings$/gm)?.length, 1);
  const valid = json(run(["validate", "--repo", repo, "--files", file, "--fail-on-warnings"]));
  assert.equal(valid.errorCount, 0);

  writeFileSync(file, markdown.replace(/^\\## Decisions$/m, "## Decisions").replace(/^\\## Findings$/m, "## Findings"));
  const invalid = run(["validate", "--repo", repo, "--files", file, "--fail-on-warnings"]);
  assert.equal(invalid.status, 1, invalid.stderr || invalid.stdout);
  const result = JSON.parse(invalid.stdout);
  assert.ok(result.files[0].errors.includes("duplicate section: Decisions"));
  assert.ok(result.files[0].errors.includes("duplicate section: Findings"));
  assert.ok(result.files[0].errors.some((error) => error.startsWith("section out of canonical order:")));

  const outOfOrderMarkdown = markdown
    .replace(/^## Decisions$/m, "## Temporary Section")
    .replace(/^## Findings$/m, "## Decisions")
    .replace(/^## Temporary Section$/m, "## Findings");
  writeFileSync(file, outOfOrderMarkdown);
  const outOfOrder = run(["validate", "--repo", repo, "--files", file]);
  assert.equal(outOfOrder.status, 1, outOfOrder.stderr || outOfOrder.stdout);
  assert.ok(JSON.parse(outOfOrder.stdout).files[0].errors.includes("section out of canonical order: Decisions"));
});

test("init persists project identity for later CLI and hook artifacts", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-project-"));
  const stateDir = mkdtempSync(join(tmpdir(), "agent-crystallize-hook-state-"));
  json(run(["init", "--repo", repo, "--project", "product-alpha", "--no-agents-md"]));

  const config = JSON.parse(readFileSync(join(repo, ".agent-crystals", "config.json"), "utf8"));
  assert.deepEqual(config, { version: 1, project: "product-alpha" });

  const checkpoint = json(
    run([
      "checkpoint",
      "--repo",
      repo,
      "--body",
      "Checkpoint after init without an explicit project flag.",
      "--test",
      "Project identity was loaded from repo config.",
    ]),
  );
  assert.equal(checkpoint.project, "product-alpha");

  const hook = run(
    ["hook", "--repo", repo, "--harness", "codex", "--event", "PreCompact", "--state-dir", stateDir, "--strict-precompact"],
    { input: JSON.stringify({ cwd: repo, session_id: "fixture-session" }) },
  );
  assert.equal(hook.status, 0, hook.stderr || hook.stdout);
  for (const file of checkpointFiles(repo)) {
    assert.match(readFileSync(file, "utf8"), /^- Project: product-alpha$/m);
  }
  const doctor = json(run(["doctor", "--repo", repo]));
  assert.equal(doctor.checks.find((check) => check.name === "repo:.agent-crystals/config.json")?.status, "ok");

  writeFileSync(join(repo, ".agent-crystals", "config.json"), '{"version":2,"project":"product-alpha"}\n');
  const invalidConfig = run(["checkpoint", "--repo", repo, "--body", "Must not silently fall back to the directory name."]);
  assert.equal(invalidConfig.status, 1);
  assert.match(invalidConfig.stderr, /Invalid repo config/);
});

test("the published sanitized crystal remains strict-validation clean", () => {
  const result = json(run(["validate", "--repo", process.cwd(), "--files", "examples/sanitized-session-crystal.md", "--fail-on-warnings"]));
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});
