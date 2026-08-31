import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createBoundedGitLoopFixture } from "../src/validation/bounded-git-loop-fixture.mjs";

function git(repoPath, ...args) {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      LANG: "C",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Source Fixture",
      GIT_AUTHOR_EMAIL: "source@example.invalid",
      GIT_COMMITTER_NAME: "Source Fixture",
      GIT_COMMITTER_EMAIL: "source@example.invalid",
    },
  }).trim();
}

function sourceRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-bounded-source-"));
  git(root, "init", "--quiet");
  fs.writeFileSync(path.join(root, "README.md"), "bounded source\n");
  git(root, "add", "README.md");
  git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "source base");
  return { root, sha: git(root, "rev-parse", "HEAD") };
}

function fixtureOptions(source, temporaryParent = os.tmpdir()) {
  return {
    sourceRoot: source.root,
    validatedBaseSha: source.sha,
    temporaryParent,
    seedFiles: {
      "fixture/value.txt": "BUG\n",
      "fixture/expectation.txt": "FIXED\n",
    },
  };
}

function removeSource(source) {
  fs.rmSync(source.root, { recursive: true, force: true });
}

function bytesDigest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("isolates implementation, exact review, same-worktree fix, and exact verification", () => {
  const source = sourceRepository();
  const fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  const root = fixture.root;
  try {
    assert.equal(fs.statSync(root).mode & 0o777, 0o700);
    assert.equal(git(fixture.bareRepository, "remote"), "");
    assert.equal(
      fs.existsSync(path.join(fixture.bareRepository, "objects", "info", "alternates")),
      false,
    );
    assert.equal(fixture.seedEvidence.parentSha, source.sha);
    assert.equal(fixture.seedEvidence.fixtureDefinitionDigest, fixture.fixtureDefinitionDigest);

    fixture.writeImplementerFile("fixture/value.txt", "IMPLEMENTED_WITH_FINDING\n", {
      expectedHead: fixture.seedSha,
    });
    const implementation = fixture.commitImplementation({ expectedParent: fixture.seedSha });
    assert.equal(implementation.parentSha, fixture.seedSha);
    assert.equal(implementation.clean, true);

    const reviewer = fixture.createReviewerCheckout({
      implementationSha: implementation.subjectSha,
    });
    assert.equal(reviewer.evidence.detached, true);
    assert.equal(git(reviewer.worktree, "rev-parse", "HEAD"), implementation.subjectSha);
    assert.equal(fixture.verifyReviewerCheckout({
      implementationSha: implementation.subjectSha,
    }).subjectSha, implementation.subjectSha);

    const persistentImplementerPath = fixture.implementerWorktree;
    fixture.writeImplementerFile("fixture/value.txt", "FIXED\n", {
      expectedHead: implementation.subjectSha,
    });
    const fix = fixture.commitFix({ expectedParent: implementation.subjectSha });
    assert.equal(fixture.implementerWorktree, persistentImplementerPath);
    assert.equal(fix.parentSha, implementation.subjectSha);
    assert.equal(JSON.stringify({ implementation, fix }).includes(root), false);

    const verifier = fixture.createVerifierCheckout({ fixSha: fix.subjectSha });
    assert.equal(verifier.evidence.detached, true);
    assert.equal(verifier.evidence.subjectSha, fix.subjectSha);
    assert.equal(fixture.verifyVerifierCheckout({ fixSha: fix.subjectSha }).clean, true);
    assert.equal(git(source.root, "rev-parse", "HEAD"), source.sha);
    assert.equal(git(source.root, "status", "--porcelain"), "");
    assert.notEqual(spawnSync(
      "git",
      ["-C", source.root, "cat-file", "-e", `${fix.subjectSha}^{commit}`],
      { stdio: "ignore" },
    ).status, 0);
  } finally {
    const cleanup = fixture.cleanup();
    assert.deepEqual(cleanup, {
      attempted: true,
      complete: true,
      temporaryRootRemoved: true,
      bareRepositoryRemoved: true,
      implementerWorktreeRemoved: true,
      reviewerWorktreeRemoved: true,
      verifierWorktreeRemoved: true,
    });
    assert.equal(fs.existsSync(root), false);
    removeSource(source);
  }
});

test("rejects wrong parents, unbounded dirt, path escape, and abnormal file modes", () => {
  const source = sourceRepository();
  const fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  try {
    assert.throws(
      () => fixture.commitImplementation({ expectedParent: "a".repeat(40) }),
      { code: "threadmesh_bounded_git_fixture_state_conflict" },
    );
    assert.throws(
      () => fixture.writeImplementerFile("../escape.txt", "escape\n", {
        expectedHead: fixture.seedSha,
      }),
      { code: "threadmesh_bounded_git_fixture_path_denied" },
    );
    fixture.writeImplementerFile("fixture/value.txt", "IMPLEMENTATION\n", {
      expectedHead: fixture.seedSha,
    });
    fs.writeFileSync(path.join(fixture.implementerWorktree, "outside.txt"), "outside\n");
    assert.throws(
      () => fixture.commitImplementation({ expectedParent: fixture.seedSha }),
      { code: "threadmesh_bounded_git_fixture_dirty_invalid" },
    );
    fs.rmSync(path.join(fixture.implementerWorktree, "outside.txt"));
    fs.chmodSync(path.join(fixture.implementerWorktree, "fixture", "value.txt"), 0o755);
    assert.throws(
      () => fixture.commitImplementation({ expectedParent: fixture.seedSha }),
      { code: "threadmesh_bounded_git_fixture_file_invalid" },
    );
  } finally {
    assert.equal(fixture.cleanup().complete, true);
    removeSource(source);
  }
});

test("rejects symlinks and staged gitlinks", () => {
  const source = sourceRepository();
  let fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  try {
    const target = path.join(fixture.implementerWorktree, "fixture", "value.txt");
    fs.rmSync(target);
    fs.symlinkSync(path.join(source.root, "README.md"), target);
    assert.throws(
      () => fixture.writeImplementerFile("fixture/value.txt", "escape\n", {
        expectedHead: fixture.seedSha,
      }),
      { code: "threadmesh_bounded_git_fixture_path_denied" },
    );
  } finally {
    assert.equal(fixture.cleanup().complete, true);
  }

  fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  try {
    git(
      fixture.implementerWorktree,
      "update-index", "--add", "--cacheinfo",
      `160000,${source.sha},fixture/value.txt`,
    );
    assert.throws(
      () => fixture.commitImplementation({ expectedParent: fixture.seedSha }),
      { code: "threadmesh_bounded_git_fixture_submodule_denied" },
    );
  } finally {
    assert.equal(fixture.cleanup().complete, true);
    removeSource(source);
  }
});

test("detects added remotes and object alternates", () => {
  const source = sourceRepository();
  let fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  try {
    git(fixture.bareRepository, "remote", "add", "unexpected", source.root);
    assert.throws(
      () => fixture.writeImplementerFile("fixture/value.txt", "change\n", {
        expectedHead: fixture.seedSha,
      }),
      { code: "threadmesh_bounded_git_fixture_topology_invalid" },
    );
  } finally {
    assert.equal(fixture.cleanup().complete, true);
  }

  fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  try {
    const alternates = path.join(fixture.bareRepository, "objects", "info", "alternates");
    fs.writeFileSync(alternates, `${path.join(source.root, ".git", "objects")}\n`);
    assert.throws(
      () => fixture.writeImplementerFile("fixture/value.txt", "change\n", {
        expectedHead: fixture.seedSha,
      }),
      { code: "threadmesh_bounded_git_fixture_topology_invalid" },
    );
  } finally {
    assert.equal(fixture.cleanup().complete, true);
    removeSource(source);
  }
});

test("failure paths clean the exact temporary topology and construction failure leaks nothing", () => {
  const source = sourceRepository();
  const fixture = createBoundedGitLoopFixture(fixtureOptions(source));
  const root = fixture.root;
  assert.throws(
    () => fixture.createReviewerCheckout({ implementationSha: "b".repeat(40) }),
    { code: "threadmesh_bounded_git_fixture_checkout_invalid" },
  );
  const first = fixture.cleanup();
  assert.equal(first.complete, true);
  assert.equal(fs.existsSync(root), false);
  assert.equal(fixture.cleanup(), first);

  const temporaryParent = fs.mkdtempSync(path.join(os.tmpdir(), "threadmesh-bounded-parent-"));
  fs.writeFileSync(path.join(source.root, "dirty.txt"), "dirty\n");
  try {
    const before = fs.readdirSync(temporaryParent);
    assert.throws(
      () => createBoundedGitLoopFixture(fixtureOptions(source, temporaryParent)),
      { code: "threadmesh_bounded_git_fixture_source_invalid" },
    );
    assert.deepEqual(fs.readdirSync(temporaryParent), before);
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
    removeSource(source);
  }
});

test("rejects temporary roots inside the source worktree or Git directories without mutation", () => {
  const source = sourceRepository();
  const gitDirectory = fs.realpathSync(git(source.root, "rev-parse", "--absolute-git-dir"));
  const commonDirectoryValue = git(source.root, "rev-parse", "--git-common-dir");
  const commonDirectory = fs.realpathSync(path.isAbsolute(commonDirectoryValue)
    ? commonDirectoryValue
    : path.resolve(source.root, commonDirectoryValue));
  const before = {
    head: git(source.root, "rev-parse", "HEAD"),
    status: git(source.root, "status", "--porcelain"),
    worktreeEntries: fs.readdirSync(source.root).sort(),
    gitEntries: fs.readdirSync(gitDirectory).sort(),
    commonEntries: fs.readdirSync(commonDirectory).sort(),
  };

  try {
    for (const temporaryParent of new Set([source.root, gitDirectory, commonDirectory])) {
      assert.throws(
        () => createBoundedGitLoopFixture(fixtureOptions(source, temporaryParent)),
        { code: "threadmesh_bounded_git_fixture_temporary_parent_denied" },
      );
      assert.equal(
        fs.readdirSync(temporaryParent).some((name) =>
          name.startsWith("threadmesh-bounded-git-loop-")),
        false,
      );
    }
    assert.equal(git(source.root, "rev-parse", "HEAD"), before.head);
    assert.equal(git(source.root, "status", "--porcelain"), before.status);
    assert.deepEqual(fs.readdirSync(source.root).sort(), before.worktreeEntries);
    assert.deepEqual(fs.readdirSync(gitDirectory).sort(), before.gitEntries);
    assert.deepEqual(fs.readdirSync(commonDirectory).sort(), before.commonEntries);
  } finally {
    removeSource(source);
  }
});

test("source inspection disables fsmonitor and preserves source index bytes", () => {
  const source = sourceRepository();
  const gitDirectory = fs.realpathSync(git(source.root, "rev-parse", "--absolute-git-dir"));
  const monitor = path.join(gitDirectory, "threadmesh-test-fsmonitor.sh");
  const sideEffect = path.join(gitDirectory, "threadmesh-test-fsmonitor-ran");
  const indexPath = path.join(gitDirectory, "index");
  fs.writeFileSync(
    monitor,
    `#!/bin/sh\nprintf invoked > ${JSON.stringify(sideEffect)}\nprintf 'threadmesh-test-token\\n'\nexit 0\n`,
    { mode: 0o700 },
  );
  git(source.root, "config", "core.fsmonitor", monitor);
  git(source.root, "config", "core.untrackedCache", "true");
  git(source.root, "config", "core.preloadIndex", "true");
  const indexBefore = fs.readFileSync(indexPath);
  const digestBefore = bytesDigest(indexBefore);
  let fixture;

  try {
    fixture = createBoundedGitLoopFixture(fixtureOptions(source));
    assert.equal(fs.existsSync(sideEffect), false);
    const indexAfter = fs.readFileSync(indexPath);
    assert.equal(bytesDigest(indexAfter), digestBefore);
    assert.deepEqual(indexAfter, indexBefore);
    git(source.root, "status", "--porcelain");
    assert.equal(fs.existsSync(sideEffect), true, "test fsmonitor must be observable without guards");
  } finally {
    if (fixture) assert.equal(fixture.cleanup().complete, true);
    fs.rmSync(sideEffect, { force: true });
    removeSource(source);
  }
});
