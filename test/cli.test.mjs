import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
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

function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function gitPath(repo, args) {
  const path = git(repo, args);
  return isAbsolute(path) ? path : resolve(repo, path);
}

function checkpointFiles(repo) {
  const dir = join(repo, ".agent-crystals", "checkpoints");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(dir, name));
}

function runHook(repo, stateDir, event, input = {}) {
  return run(
    ["hook", "--repo", repo, "--harness", "claude-code", "--event", event, "--state-dir", stateDir, "--strict-precompact"],
    { input: JSON.stringify({ cwd: repo, hook_event_name: event, session_id: "fixture-session", ...input }) },
  );
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
  assert.deepEqual(config, { version: 1, project: "product-alpha", artifactProfile: "local-private" });

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

test("init and doctor resolve the shared exclude file from a linked Git worktree", () => {
  const root = mkdtempSync(join(tmpdir(), "agent-crystallize-worktree-"));
  const main = join(root, "main");
  const linked = join(root, "linked");

  assert.equal(spawnSync("git", ["init", "-q", main], { encoding: "utf8" }).status, 0);
  git(main, ["config", "user.email", "fixture@example.com"]);
  git(main, ["config", "user.name", "Fixture"]);
  writeFileSync(join(main, "seed.txt"), "seed\n");
  git(main, ["add", "seed.txt"]);
  git(main, ["commit", "-qm", "seed"]);
  git(main, ["worktree", "add", "-qb", "linked-fixture", linked]);

  const initialized = json(
    run(["init", "--repo", linked, "--project", "linked-project", "--no-checkpoint", "--no-agents-md"]),
  );
  const excludePath = gitPath(linked, ["rev-parse", "--git-path", "info/exclude"]);
  const excludeAction = initialized.actions.find((action) => action.path === excludePath);
  assert.ok(excludeAction, `expected init action for ${excludePath}`);
  assert.match(readFileSync(excludePath, "utf8"), /agent-crystallize:artifact-profile:start/);
  assert.equal(existsSync(join(linked, ".git", "info", "exclude")), false);

  const doctor = json(run(["doctor", "--repo", linked]));
  const excludeCheck = doctor.checks.find((check) => check.name === "repo:git-info-exclude");
  assert.equal(excludeCheck?.path, excludePath);
  assert.equal(excludeCheck?.status, "ok");
});

test("reviewed-shared keeps mechanical artifacts local and session crystals commit-able", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-reviewed-shared-"));
  assert.equal(spawnSync("git", ["init", "-q", repo], { encoding: "utf8" }).status, 0);
  const excludePath = gitPath(repo, ["rev-parse", "--git-path", "info/exclude"]);
  writeFileSync(
    excludePath,
    `${readFileSync(excludePath, "utf8")}\n# agent-crystallize:local-private:start\n.agent-crystals/\n# agent-crystallize:local-private:end\n`,
  );

  const initialized = json(
    run([
      "init",
      "--repo",
      repo,
      "--project",
      "shared-product",
      "--artifact-profile",
      "reviewed-shared",
      "--no-checkpoint",
      "--no-agents-md",
    ]),
  );
  assert.equal(initialized.artifactProfile, "reviewed-shared");
  assert.deepEqual(JSON.parse(readFileSync(join(repo, ".agent-crystals", "config.json"), "utf8")), {
    version: 1,
    project: "shared-product",
    artifactProfile: "reviewed-shared",
  });

  const exclude = readFileSync(excludePath, "utf8");
  assert.match(exclude, /# profile: reviewed-shared/);
  assert.doesNotMatch(exclude, /agent-crystallize:local-private:start/);
  assert.match(exclude, /^\.agent-crystals\/checkpoints\/$/m);
  assert.match(exclude, /^\.agent-crystals\/manifest\.json$/m);
  assert.match(exclude, /^\.agent-crystals\/config\.json$/m);
  assert.doesNotMatch(exclude, /^\.agent-crystals\/$/m);

  const checkpoint = json(run(["checkpoint", "--repo", repo, "--body", "Mechanical checkpoint fixture."]));
  const session = json(run(["now", "--repo", repo, "--body", "Reviewed session crystal fixture."]));
  const checkIgnored = (path) => spawnSync("git", ["-C", repo, "check-ignore", "-q", path], { encoding: "utf8" }).status;
  assert.equal(checkIgnored(checkpoint.path), 0);
  assert.equal(checkIgnored(join(repo, ".agent-crystals", "manifest.json")), 0);
  assert.equal(checkIgnored(join(repo, ".agent-crystals", "config.json")), 0);
  assert.equal(checkIgnored(session.path), 1);

  const doctor = json(run(["doctor", "--repo", repo]));
  const excludeCheck = doctor.checks.find((check) => check.name === "repo:git-info-exclude");
  assert.equal(excludeCheck?.status, "ok");
  assert.equal(excludeCheck?.detail, "artifactProfile=reviewed-shared");

  writeFileSync(
    join(repo, ".agent-crystals", "config.json"),
    `${JSON.stringify({ version: 1, project: "shared-product", artifactProfile: "local-private" }, null, 2)}\n`,
  );
  const mismatchedDoctor = json(run(["doctor", "--repo", repo]));
  assert.equal(
    mismatchedDoctor.checks.find((check) => check.name === "repo:git-info-exclude")?.status,
    "profile_mismatch",
  );

  json(
    run([
      "init",
      "--repo",
      repo,
      "--project",
      "shared-product",
      "--artifact-profile",
      "local-private",
      "--no-checkpoint",
      "--no-agents-md",
    ]),
  );
  const localPrivateExclude = readFileSync(excludePath, "utf8");
  assert.match(localPrivateExclude, /# profile: local-private/);
  assert.match(localPrivateExclude, /^\.agent-crystals\/$/m);
  assert.equal(localPrivateExclude.match(/agent-crystallize:artifact-profile:start/g)?.length, 1);
  assert.equal(checkIgnored(session.path), 0);
});

test("init rejects unknown artifact profiles", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-invalid-profile-"));
  const result = run([
    "init",
    "--repo",
    repo,
    "--artifact-profile",
    "share-everything",
    "--no-checkpoint",
    "--no-agents-md",
  ]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Artifact profile must be local-private or reviewed-shared/);
});

test("the published sanitized crystal remains strict-validation clean", () => {
  const result = json(run(["validate", "--repo", process.cwd(), "--files", "examples/sanitized-session-crystal.md", "--fail-on-warnings"]));
  assert.equal(result.errorCount, 0);
  assert.equal(result.warningCount, 0);
});

test("Claude PostCompact is side-effect-only and reinjects once through supported events", () => {
  const fallbackRepo = mkdtempSync(join(tmpdir(), "agent-crystallize-claude-fallback-"));
  const fallbackState = mkdtempSync(join(tmpdir(), "agent-crystallize-claude-fallback-state-"));
  json(run(["init", "--repo", fallbackRepo, "--project", "claude-fallback", "--no-checkpoint", "--no-agents-md"]));

  assert.equal(runHook(fallbackRepo, fallbackState, "PreCompact", { trigger: "manual" }).status, 0);
  const postCompact = runHook(fallbackRepo, fallbackState, "PostCompact", { trigger: "manual" });
  assert.equal(postCompact.status, 0, postCompact.stderr || postCompact.stdout);
  assert.equal(postCompact.stdout, "");

  const firstPrompt = runHook(fallbackRepo, fallbackState, "UserPromptSubmit", { prompt: "continue" });
  const firstPromptOutput = json(firstPrompt);
  assert.equal(firstPromptOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(firstPromptOutput.hookSpecificOutput.additionalContext, /post-compact bootstrap fallback/i);
  assert.equal(runHook(fallbackRepo, fallbackState, "UserPromptSubmit", { prompt: "continue again" }).stdout, "");

  const sessionRepo = mkdtempSync(join(tmpdir(), "agent-crystallize-claude-session-"));
  const sessionState = mkdtempSync(join(tmpdir(), "agent-crystallize-claude-session-state-"));
  json(run(["init", "--repo", sessionRepo, "--project", "claude-session", "--no-checkpoint", "--no-agents-md"]));
  assert.equal(runHook(sessionRepo, sessionState, "PreCompact", { trigger: "auto" }).status, 0);
  assert.equal(runHook(sessionRepo, sessionState, "PostCompact", { trigger: "auto" }).stdout, "");

  const sessionStart = json(runHook(sessionRepo, sessionState, "SessionStart", { source: "compact" }));
  assert.equal(sessionStart.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(sessionStart.hookSpecificOutput.additionalContext, /agent-crystallize bootstrap/i);
  assert.equal(runHook(sessionRepo, sessionState, "UserPromptSubmit", { prompt: "continue after compact" }).stdout, "");
});
