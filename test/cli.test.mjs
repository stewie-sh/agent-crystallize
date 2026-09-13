import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("dist/index.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd,
    input: options.input,
    env: options.env,
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

test("subcommand help is read-only", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-help-"));
  const result = run(["checkpoint", "--repo", repo, "--help"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /agent-crystallize checkpoint/);
  assert.equal(existsSync(join(repo, ".agent-crystals")), false);
});

test("setup installs CLI discovery and non-validated emergency guidance", () => {
  const home = mkdtempSync(join(tmpdir(), "agent-crystallize-setup-home-"));
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-setup-repo-"));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const result = json(run(["setup", "--codex", "--skills"], {
    env,
  }));
  const skillPath = join(home, ".codex", "skills", "agent-context-crystallizer", "SKILL.md");
  const protocolPath = join(home, ".agents", "context-persistence-protocol.md");
  const skill = readFileSync(skillPath, "utf8");

  assert.match(skill, /Resolve The CLI Before Writing/);
  assert.match(skill, /AGENT_CRYSTALLIZE_CLI/);
  assert.match(skill, /non-validated\s+emergency handoff/);
  assert.ok(result.nextActions.some((item) => item.includes("Verify the agent harness can resolve the CLI")));

  json(run(["init", "--repo", repo, "--no-checkpoint", "--no-agents-md"], { env }));
  writeFileSync(protocolPath, readFileSync(protocolPath, "utf8") + "\nOld customization\n");
  writeFileSync(skillPath, skill + "\nOld customization\n");
  const doctor = json(run(["doctor", "--repo", repo, "--codex"], { env }));
  assert.equal(doctor.upgradeAvailable, true);
  assert.ok(doctor.checks.some((check) => check.status === "outdated_or_modified"));

  const upgraded = json(run(["setup", "--codex", "--skills", "--upgrade"], { env }));
  assert.match(readFileSync(protocolPath, "utf8"), /Distribution: agent-crystallize\//);
  assert.match(readFileSync(skillPath, "utf8"), /Resolve The CLI Before Writing/);
  assert.ok(upgraded.actions.some((action) => action.detail?.includes("previous file preserved")));
  assert.ok(readdirSync(dirname(protocolPath)).some((name) => name.includes("pre-agent-crystallize-upgrade")));
  assert.ok(readdirSync(dirname(skillPath)).some((name) => name.includes("pre-agent-crystallize-upgrade")));
});

test("doctor preserves custom canonical pointers and reports missing targets", () => {
  const home = mkdtempSync(join(tmpdir(), "crystal-custom-home-"));
  const repo = mkdtempSync(join(tmpdir(), "crystal-custom-repo-"));
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  json(run(["setup", "--codex", "--skills"], { env }));
  const protocol = join(home, ".agents", "context-persistence-protocol.md");
  const pointer = join(home, ".codex", "skills", "agent-context-crystallizer", "SKILL.md");
  const global = join(home, ".codex", "AGENTS.md");
  writeFileSync(protocol, "Custom organization instructions\n");
  writeFileSync(pointer, "Read ~/.agents/skills/agent-context-crystallizer/SKILL.md\n");
  writeFileSync(global, "Follow ~/.agents/context-persistence-protocol.md\n");
  const before = [protocol, pointer, global].map(path => readFileSync(path, "utf8"));
  let result = json(run(["doctor", "--repo", repo, "--codex"], { env }));
  assert.equal(result.upgradeAvailable, false);
  assert.ok(result.checks.some(check => check.status === "broken_pointer"));
  const canonical = join(home, ".agents", "skills", "agent-context-crystallizer", "SKILL.md");
  mkdirSync(dirname(canonical), { recursive: true });
  writeFileSync(canonical, "Custom canonical procedure\n");
  result = json(run(["doctor", "--repo", repo, "--codex"], { env }));
  assert.equal(result.upgradeAvailable, false);
  assert.equal(result.checks.filter(check => check.status === "custom_pointer").length, 2);
  assert.ok(result.checks.some(check => check.status === "custom_or_unrecognized"));
  assert.deepEqual([protocol, pointer, global].map(path => readFileSync(path, "utf8")), before);
});

function runHook(repo, stateDir, event, input = {}) {
  return run(
    ["hook", "--repo", repo, "--harness", "claude-code", "--event", event, "--state-dir", stateDir, "--strict-precompact"],
    { input: JSON.stringify({ cwd: repo, hook_event_name: event, session_id: "fixture-session", ...input }) },
  );
}

function runHookAsync(repo, stateDir, event, input = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [cli, "hook", "--repo", repo, "--harness", "codex", "--event", event, "--state-dir", stateDir],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify({ cwd: repo, hook_event_name: event, ...input }));
  });
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
  const sessionBody = readFileSync(session.path, "utf8");
  assert.doesNotMatch(sessionBody, new RegExp(repo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(sessionBody, /^- Repo: \.$/m);
  assert.match(sessionBody, /^- Git root: \.$/m);
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

test("init narrows new excludes but requires explicit migration for legacy broad protections", () => {
  const fresh = mkdtempSync(join(tmpdir(), "agent-crystallize-fresh-excludes-"));
  git(fresh, ["init", "-q"]);
  json(run(["init", "--repo", fresh, "--no-checkpoint", "--no-agents-md"]));
  const freshExclude = readFileSync(gitPath(fresh, ["rev-parse", "--git-path", "info/exclude"]), "utf8");
  assert.match(freshExclude, /^\.agent-crystals\/$/m);
  assert.doesNotMatch(freshExclude, /^docs\/private\/$/m);

  const legacy = mkdtempSync(join(tmpdir(), "agent-crystallize-legacy-excludes-"));
  git(legacy, ["init", "-q"]);
  const legacyPath = gitPath(legacy, ["rev-parse", "--git-path", "info/exclude"]);
  writeFileSync(legacyPath, `# agent-crystallize:artifact-profile:start\n# profile: local-private\n.agent-crystals/\ndocs/private/\n*.private.md\n# agent-crystallize:artifact-profile:end\n`);
  const retained = json(run(["init", "--repo", legacy, "--no-checkpoint", "--no-agents-md"]));
  assert.match(readFileSync(legacyPath, "utf8"), /^docs\/private\/$/m);
  assert.match(retained.actions.find((action) => existsSync(action.path) && realpathSync(action.path) === realpathSync(legacyPath))?.detail ?? "", /legacy broad protections retained/);
  const doctor = json(run(["doctor", "--repo", legacy]));
  assert.equal(doctor.checks.find((check) => check.name === "repo:git-info-exclude")?.status, "legacy_protections_retained");

  json(run(["init", "--repo", legacy, "--no-checkpoint", "--no-agents-md", "--migrate-excludes"]));
  const migrated = readFileSync(legacyPath, "utf8");
  assert.doesNotMatch(migrated, /^docs\/private\/$/m);
  assert.doesNotMatch(migrated, /^\*\.private\.md$/m);
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

test("manifest classifies Windows-style checkpoint and session paths", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-windows-paths-"));
  const cases = [
    { command: "checkpoint", dir: ".agent-crystals\\checkpoints", kind: "checkpoint" },
    { command: "now", dir: ".agent-crystals\\sessions", kind: "session" },
  ];

  for (const fixture of cases) {
    json(run([fixture.command, "--repo", repo, "--out-dir", fixture.dir, "--body", `${fixture.kind} fixture.`]));
    const manifest = json(run(["manifest", "--repo", repo, "--crystals-dir", fixture.dir]));
    assert.equal(manifest.activeArtifacts[0]?.kind, fixture.kind);
  }
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

test("checkpoint writes are exclusive and unknown flags fail closed", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-exclusive-"));
  json(run(["init", "--repo", repo, "--no-checkpoint", "--no-agents-md"]));
  const first = json(run(["checkpoint", "--repo", repo, "--title", "Collision fixture", "--body", "first body"]));
  const second = json(run(["checkpoint", "--repo", repo, "--title", "Collision fixture", "--body", "second body"]));
  assert.notEqual(first.path, second.path);
  assert.match(readFileSync(first.path, "utf8"), /first body/);
  assert.match(readFileSync(second.path, "utf8"), /second body/);

  const typo = run(["checkpoint", "--repo", repo, "--boddy", "must not become body"]);
  assert.equal(typo.status, 1);
  assert.match(typo.stderr, /Unexpected checkpoint arguments: --boddy/);
});

test("nested cwd resolves to the Git root and captures staged files", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-root-"));
  const nested = join(repo, "packages", "app");
  mkdirSync(nested, { recursive: true });
  git(repo, ["init", "-q"]);
  git(repo, ["config", "user.email", "fixture@example.com"]);
  git(repo, ["config", "user.name", "Fixture"]);
  writeFileSync(join(repo, "seed.txt"), "seed\n");
  git(repo, ["add", "seed.txt"]);
  git(repo, ["commit", "-qm", "seed"]);
  json(run(["init", "--repo", nested, "--project", "root-fixture", "--no-checkpoint", "--no-agents-md"]));
  writeFileSync(join(repo, "staged.txt"), "staged\n");
  git(repo, ["add", "staged.txt"]);
  const checkpoint = json(run(["checkpoint", "--repo", nested, "--body", "root and staged fixture"]));
  assert.equal(realpathSync(dirname(dirname(checkpoint.path))), realpathSync(join(repo, ".agent-crystals")));
  const markdown = readFileSync(checkpoint.path, "utf8");
  assert.equal(realpathSync(markdown.match(/^- Repo: (.+)$/m)[1]), realpathSync(repo));
  assert.match(markdown, /^staged\.txt$/m);
});

test("hook stdin is consumed, redacted, session-isolated, and concurrency-safe", async () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-hook-hardening-"));
  const stateDir = mkdtempSync(join(tmpdir(), "agent-crystallize-hook-hardening-state-"));
  json(run(["init", "--repo", repo, "--project", "hook-hardening", "--no-checkpoint", "--no-agents-md"]));

  const pre = runHook(repo, stateDir, "PreCompact", {
    session_id: "session-a",
    trigger: "manual GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz",
    custom_instructions: "keep AWS_SECRET_ACCESS_KEY=abcdefghijklmnop",
  });
  assert.equal(pre.status, 0, pre.stderr || pre.stdout);
  const afterPre = checkpointFiles(repo);
  assert.equal(afterPre.length, 1);
  const preBody = readFileSync(afterPre[0], "utf8");
  assert.match(preBody, /Session id: session-a/);
  assert.match(preBody, /GITHUB_TOKEN=\[REDACTED\]/);
  assert.match(preBody, /AWS_SECRET_ACCESS_KEY=\[REDACTED\]/);
  assert.doesNotMatch(preBody, /ghp_abcdefghijklmnopqrstuvwxyz|abcdefghijklmnop/);

  const post = runHook(repo, stateDir, "PostCompact", {
    session_id: "session-a",
    compact_summary: "summary with API_KEY=supersecretvalue",
  });
  assert.equal(post.status, 0, post.stderr || post.stdout);
  const afterPost = checkpointFiles(repo);
  assert.equal(afterPost.length, 2);
  const delta = readFileSync(afterPost.find((path) => path !== afterPre[0]), "utf8");
  assert.match(delta, /Post-compact summary delta/);
  assert.match(delta, /API_KEY=\[REDACTED\]/);
  assert.doesNotMatch(delta, /supersecretvalue/);
  const repeatedPost = runHook(repo, stateDir, "PostCompact", {
    session_id: "session-a",
    compact_summary: "summary with API_KEY=supersecretvalue",
  });
  assert.equal(repeatedPost.status, 0, repeatedPost.stderr || repeatedPost.stdout);
  assert.equal(checkpointFiles(repo).length, 2);

  const sessionB = runHook(repo, stateDir, "SessionStart", { session_id: "session-b" });
  assert.equal(sessionB.status, 0, sessionB.stderr || sessionB.stdout);
  const state = JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8"));
  assert.equal(Object.keys(state.projects).length, 2);

  const concurrent = await Promise.all(
    Array.from({ length: 8 }, (_, index) => runHookAsync(repo, stateDir, "PostToolUse", { session_id: `parallel-${index}` })),
  );
  for (const result of concurrent) assert.equal(result.status, 0, result.stderr || result.stdout);
  const finalState = JSON.parse(readFileSync(join(stateDir, "state.json"), "utf8"));
  assert.equal(Object.keys(finalState.projects).length, 10);

  const malformed = run(
    ["hook", "--repo", repo, "--harness", "codex", "--event", "PostToolUse", "--state-dir", stateDir],
    { input: "{not-json" },
  );
  assert.equal(malformed.status, 1);
  assert.match(malformed.stderr, /Invalid hook JSON on stdin/);
});

test("invalid artifacts cannot supersede or enter bootstrap and checkpoint rollups", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-validity-"));
  const stateDir = mkdtempSync(join(tmpdir(), "agent-crystallize-validity-state-"));
  json(run(["init", "--repo", repo, "--no-checkpoint", "--no-agents-md"]));
  const original = json(run(["checkpoint", "--repo", repo, "--title", "Durable original", "--body", "valid durable focus"]));
  const invalidPath = join(repo, ".agent-crystals", "checkpoints", "99999999T999999Z-invalid.md");
  writeFileSync(invalidPath, `# Malformed superseder\n\n## Relation Hints\n\n- supersedes:${original.relativePath}\n`);

  const firstManifest = json(run(["manifest", "--repo", repo, "--include-superseded"]));
  assert.equal(firstManifest.invalidCount, 1);
  assert.ok(firstManifest.activeArtifacts.some((item) => item.path === original.relativePath));
  assert.ok(firstManifest.invalidArtifacts.some((item) => item.path.endsWith("invalid.md")));

  const bootstrap = runHook(repo, stateDir, "SessionStart", { session_id: "validity-session" });
  assert.equal(bootstrap.status, 0, bootstrap.stderr || bootstrap.stdout);
  const context = json(bootstrap).hookSpecificOutput.additionalContext;
  assert.ok(context.includes(original.relativePath));
  assert.doesNotMatch(context, /invalid\.md/);

  const replacement = json(run([
    "checkpoint", "--repo", repo, "--title", "Durable replacement", "--body", "replacement focus",
    "--relation", `supersedes:${original.relativePath}`,
  ]));
  const rollup = json(run(["now", "--repo", repo, "--from-checkpoints", "latest", "--body", "rollup fixture"]));
  const rollupBody = readFileSync(rollup.path, "utf8");
  assert.match(rollupBody, new RegExp(replacement.relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(rollupBody, new RegExp(original.relativePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(rollupBody, /invalid\.md/);
});

test("recall ranks bounded valid active local artifacts and explains matches", () => {
  const repo = mkdtempSync(join(tmpdir(), "agent-crystallize-recall-"));
  json(run(["init", "--repo", repo, "--no-checkpoint", "--no-agents-md"]));
  const old = json(run([
    "checkpoint", "--repo", repo, "--title", "Login decision", "--body", "Use password login only.", "--topic", "authentication",
  ]));
  const current = json(run([
    "checkpoint", "--repo", repo, "--title", "Login correction", "--body", "Add social login after user validation.",
    "--topic", "authentication", "--relation", `supersedes:${old.relativePath}`, "--session-id", "recall-session",
  ]));
  const recalled = json(run(["recall", "--repo", repo, "social login", "--topic", "authentication", "--limit", "3", "--trace"]));
  assert.equal(recalled.resultCount, 1);
  assert.equal(recalled.results[0].path, current.relativePath);
  assert.ok(recalled.results[0].score > 0);
  assert.ok(recalled.results[0].matched.length > 0);
  assert.equal(recalled.trace.artifactCount, 2);
  assert.equal(recalled.trace.candidateCount, 1);
});

test("lifecycle preserves sources, recovers archived rollups and ignores corrupt annotations", () => {
  const repo = mkdtempSync(join(tmpdir(), "crystal-lifecycle-"));
  const first = json(run(["checkpoint", "--repo", repo, "--title", "Login requirement", "--body", "Login requires consent."]));
  const original = readFileSync(first.path, "utf8");
  const annotate = (action, extra = []) => json(run(["annotate", "--repo", repo, "--artifact", first.relativePath,
    "--action", action, "--reason", "Milestone review", "--source-ref", "fixture:review", ...extra]));
  annotate("archive");
  assert.equal(json(run(["recall", "--repo", repo, "Login"])).resultCount, 0);
  assert.equal(json(run(["recall", "--repo", repo, "Login", "--include-inactive"])).resultCount, 1);
  annotate("restore");
  assert.equal(json(run(["recall", "--repo", repo, "Login"])).resultCount, 1);
  const rollup = json(run(["current-state", "--repo", repo, "--artifact", first.relativePath,
    "--topic", "Login", "--body", "Login still requires explicit consent; verify implementation.",
    "--reason", "Stable milestone", "--source-ref", "fixture:review"]));
  let index = json(run(["manifest", "--repo", repo]));
  assert.equal(index.activeCount, 1);
  assert.equal(index.inactiveArtifacts[0].consolidatedInto[0], rollup.currentState.relativePath);
  assert.equal(index.inactiveArtifacts[0].supersededBy.length, 0);
  assert.equal(readFileSync(first.path, "utf8"), original);
  assert.match(readFileSync(rollup.currentState.path, "utf8"), /derived_from:/);
  json(run(["annotate", "--repo", repo, "--artifact", rollup.currentState.relativePath, "--action", "archive",
    "--reason", "Withdraw projection", "--source-ref", "fixture:withdraw"]));
  assert.equal(json(run(["recall", "--repo", repo, "Login"])).results[0].path, first.relativePath);
  const dir = join(repo, ".agent-crystals", "annotations");
  writeFileSync(join(dir, "invalid.json"), "{}");
  index = json(run(["manifest", "--repo", repo]));
  assert.ok(index.lifecycleIssues.length > 0);
  assert.equal(readFileSync(first.path, "utf8"), original);
  assert.equal(run(["annotate", "--repo", repo, "--artifact", first.relativePath, "--action", "superseded",
    "--target", first.relativePath, "--reason", "bad", "--source-ref", "fixture"]).status, 1);
});

test("changed rollup fingerprint restores sources to default retrieval", () => {
  const repo = mkdtempSync(join(tmpdir(), "crystal-fingerprint-"));
  const source = json(run(["checkpoint", "--repo", repo, "--body", "Unique recovery evidence"]));
  const result = json(run(["current-state", "--repo", repo, "--artifact", source.relativePath,
    "--topic", "Recovery", "--body", "Recovery current state", "--reason", "test", "--source-ref", "fixture"]));
  writeFileSync(result.currentState.path, "malformed rollup");
  const index = json(run(["manifest", "--repo", repo]));
  assert.equal(index.activeCount, 1);
  assert.equal(index.activeArtifacts[0].path, source.relativePath);
  assert.ok(index.lifecycleIssues.length > 0);
});

test("concurrent lifecycle writers preserve events and reject conflicting supersession", async () => {
  const repo = mkdtempSync(join(tmpdir(), "crystal-events-concurrent-"));
  const a = json(run(["checkpoint", "--repo", repo, "--title", "Alpha", "--body", "Alpha evidence"]));
  const b = json(run(["checkpoint", "--repo", repo, "--title", "Beta", "--body", "Beta evidence"]));
  const start = (args) => new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk);
    child.stderr.on('data', chunk => stderr += chunk);
    child.on('error', reject);
    child.on('close', status => resolvePromise({ status, stdout, stderr }));
  });
  const args = (source, action, target) => ['annotate', '--repo', repo, '--artifact', source,
    '--action', action, '--reason', 'concurrency fixture', '--source-ref', 'fixture',
    ...(target ? ['--target', target] : [])];
  const receipts = await Promise.all(Array.from({ length: 8 }, () => start(args(a.relativePath, 'relates-to', b.relativePath))));
  for (const receipt of receipts) json(receipt);
  const events = readdirSync(join(repo, '.agent-crystals', 'annotations')).filter(name => name.endsWith('.json'));
  assert.equal(events.length, 8);
  const times = events.map(name => JSON.parse(readFileSync(join(repo, '.agent-crystals', 'annotations', name), 'utf8')).at);
  assert.equal(new Set(times).size, 8);
  const competing = await Promise.all([
    start(args(a.relativePath, 'superseded', b.relativePath)),
    start(args(b.relativePath, 'superseded', a.relativePath)),
  ]);
  assert.equal(competing.filter(result => result.status === 0).length, 1);
  assert.equal(json(run(['manifest', '--repo', repo])).activeCount, 1);
});

test("failed consolidation keeps a recoverable artifact and source", () => {
  const repo = mkdtempSync(join(tmpdir(), 'crystal-locked-rollup-'));
  const source = json(run(['checkpoint', '--repo', repo, '--body', 'Source must survive']));
  const dir = join(repo, '.agent-crystals', 'annotations');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, '.write.lock'), JSON.stringify({ pid: process.pid }));
  const result = run(['current-state', '--repo', repo, '--artifact', source.relativePath,
    '--topic', 'Recovery', '--body', 'Retained synthesis', '--reason', 'fixture', '--source-ref', 'fixture']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /artifact retained at .*consolidation failed/);
  const index = json(run(['manifest', '--repo', repo]));
  assert.equal(index.activeCount, 2);
  assert.equal(index.inactiveArtifacts.length, 0);
});

test("recall suppresses generic matches with explicit broadening and Unicode support", () => {
  const repo = mkdtempSync(join(tmpdir(), "crystal-ranking-"));
  for (let i = 0; i < 5; i++) json(run(["checkpoint", "--repo", repo,
    "--title", `General context ${i}`, "--body", "Routine context checkpoint for gardening."]));
  const target = json(run(["checkpoint", "--repo", repo, "--title", "Doctor upgrade decision",
    "--body", "Context for doctor upgrade. Quyết định nâng cấp."]));
  const result = json(run(["recall", "--repo", repo, "context doctor upgrade", "--trace"]));
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].path, target.relativePath);
  assert.ok(result.trace.weakCount >= 5);
  const broad = json(run(["recall", "--repo", repo, "context doctor upgrade", "--include-weak", "--limit", "20"]));
  assert.ok(broad.resultCount > result.resultCount);
  assert.equal(json(run(["recall", "--repo", repo, "doctor"])).results[0].path, target.relativePath);
  assert.equal(json(run(["recall", "--repo", repo, "Quyết định"])).results[0].path, target.relativePath);
  assert.equal(json(run(["recall", "--repo", repo, "xylophoneunseen"])).resultCount, 0);
  assert.equal(json(run(["recall", "--repo", repo, "doct"])).resultCount, 0);
});
