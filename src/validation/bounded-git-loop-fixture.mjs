import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sha256Digest } from "../canonical-json.mjs";

const GIT_SHA = /^[a-f0-9]{40}$/;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ROOT_PREFIX = "threadmesh-bounded-git-loop-";
const SAFE_GIT_GLOBAL_ARGS = Object.freeze([
  "--no-optional-locks",
  "-c", "core.fsmonitor=false",
  "-c", "core.untrackedCache=false",
  "-c", "core.preloadIndex=false",
  "-c", "core.hooksPath=/dev/null",
  "-c", "commit.gpgSign=false",
]);
const FIXED_GIT_ENV = Object.freeze({
  GIT_AUTHOR_NAME: "ThreadMesh Ephemeral Implementer",
  GIT_AUTHOR_EMAIL: "threadmesh-implementer@example.invalid",
  GIT_AUTHOR_DATE: "2000-01-01T00:00:00Z",
  GIT_COMMITTER_NAME: "ThreadMesh Ephemeral Implementer",
  GIT_COMMITTER_EMAIL: "threadmesh-implementer@example.invalid",
  GIT_COMMITTER_DATE: "2000-01-01T00:00:00Z",
});

function fixtureError(code, detail) {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function gitEnvironment(home, extra = {}) {
  return {
    PATH: process.env.PATH ?? "",
    LANG: "C",
    LC_ALL: "C",
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    ...extra,
  };
}

function preflightGitText(args, cwd) {
  return execFileSync("git", [...SAFE_GIT_GLOBAL_ARGS, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      LANG: "C",
      LC_ALL: "C",
      HOME: os.tmpdir(),
      XDG_CONFIG_HOME: os.tmpdir(),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024,
  }).trim();
}

function isEqualOrWithin(candidate, boundary) {
  const relative = path.relative(boundary, candidate);
  return relative === "" || (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function resolveGitPath(worktree, value) {
  return fs.realpathSync(path.isAbsolute(value) ? value : path.resolve(worktree, value));
}

function runGit(args, { cwd, home, encoding = "utf8", extraEnv = {} } = {}) {
  return execFileSync(
    "git",
    [...SAFE_GIT_GLOBAL_ARGS, ...args],
    {
      cwd,
      encoding,
      env: gitEnvironment(home, extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

function gitText(args, options) {
  return runGit(args, options).trim();
}

function gitSuccess(args, options) {
  return spawnSync(
    "git",
    [...SAFE_GIT_GLOBAL_ARGS, ...args],
    {
      cwd: options.cwd,
      env: gitEnvironment(options.home, options.extraEnv),
      stdio: "ignore",
      timeout: 10_000,
    },
  ).status === 0;
}

function assertGitSha(value, field = "sha") {
  if (!GIT_SHA.test(value ?? "")) {
    throw fixtureError("threadmesh_bounded_git_fixture_invalid", field);
  }
}

function normalizeRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 240 ||
    value.includes("\\") ||
    value.includes("\0") ||
    path.posix.isAbsolute(value)
  ) {
    throw fixtureError("threadmesh_bounded_git_fixture_path_denied", "path");
  }
  const segments = value.split("/");
  if (
    segments.some((segment) =>
      !SAFE_SEGMENT.test(segment) || segment === "." || segment === ".." ||
      segment.toLowerCase() === ".git")
  ) {
    throw fixtureError("threadmesh_bounded_git_fixture_path_denied", value);
  }
  return segments.join("/");
}

function normalizeAllowlist(values) {
  if (
    !Array.isArray(values) || values.length < 1 || values.length > 32 ||
    new Set(values).size !== values.length
  ) {
    throw fixtureError("threadmesh_bounded_git_fixture_invalid", "allowlist");
  }
  const normalized = values.map(normalizeRelativePath).sort();
  if (new Set(normalized).size !== normalized.length) {
    throw fixtureError("threadmesh_bounded_git_fixture_invalid", "allowlist");
  }
  return Object.freeze(normalized);
}

function normalizeSeedFiles(seedFiles, allowlist, maxFileBytes, maxTotalBytes) {
  if (!seedFiles || typeof seedFiles !== "object" || Array.isArray(seedFiles)) {
    throw fixtureError("threadmesh_bounded_git_fixture_invalid", "seedFiles");
  }
  const entries = Object.entries(seedFiles).map(([name, content]) => {
    const relativePath = normalizeRelativePath(name);
    if (!allowlist.includes(relativePath) || typeof content !== "string" || content.includes("\0")) {
      throw fixtureError("threadmesh_bounded_git_fixture_invalid", "seedFiles");
    }
    const byteLength = Buffer.byteLength(content);
    if (byteLength > maxFileBytes) {
      throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", "seed file too large");
    }
    return { path: relativePath, content, byteLength, digest: sha256Digest(content) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (entries.length < 1 || entries.reduce((sum, entry) => sum + entry.byteLength, 0) > maxTotalBytes) {
    throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", "seed total too large");
  }
  return entries;
}

function statusEntries(worktree, home) {
  const raw = runGit(
    ["-C", worktree, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { home },
  );
  return raw.split("\0").filter(Boolean).map((entry) => ({
    status: entry.slice(0, 2),
    path: entry.slice(3),
  }));
}

function indexEntries(worktree, home) {
  const raw = runGit(["-C", worktree, "ls-files", "--stage", "-z"], { home });
  return raw.split("\0").filter(Boolean).map((entry) => {
    const match = /^(\d{6}) ([a-f0-9]{40}) (\d)\t([\s\S]+)$/u.exec(entry);
    if (!match) throw fixtureError("threadmesh_bounded_git_fixture_state_invalid", "index entry");
    return { mode: match[1], sha: match[2], stage: Number(match[3]), path: match[4] };
  });
}

function assertNoSymlinkComponents(worktree, relativePath, { targetMayBeMissing = true } = {}) {
  const segments = relativePath.split("/");
  let current = worktree;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    if (!fs.existsSync(current)) {
      if (targetMayBeMissing) return;
      throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", relativePath);
    }
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw fixtureError("threadmesh_bounded_git_fixture_path_denied", "symlink");
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw fixtureError("threadmesh_bounded_git_fixture_path_denied", "non-directory ancestor");
    }
  }
}

function assertRegularBoundedFile(worktree, relativePath, maxFileBytes) {
  assertNoSymlinkComponents(worktree, relativePath, { targetMayBeMissing: false });
  const filename = path.join(worktree, ...relativePath.split("/"));
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || (stat.mode & 0o111) !== 0 || stat.size > maxFileBytes) {
    throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", relativePath);
  }
}

function safeWrite(worktree, relativePath, content) {
  assertNoSymlinkComponents(worktree, relativePath);
  const filename = path.join(worktree, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  assertNoSymlinkComponents(worktree, path.posix.dirname(relativePath) === "."
    ? relativePath
    : path.posix.dirname(relativePath));
  if (fs.existsSync(filename) && !fs.lstatSync(filename).isFile()) {
    throw fixtureError("threadmesh_bounded_git_fixture_path_denied", relativePath);
  }
  fs.writeFileSync(filename, content, { encoding: "utf8", mode: 0o644 });
  fs.chmodSync(filename, 0o644);
}

function changedPaths(parentSha, subjectSha, worktree, home) {
  const raw = runGit(
    ["-C", worktree, "diff-tree", "--no-commit-id", "--name-only", "-r", "-z", parentSha, subjectSha],
    { home },
  );
  return raw.split("\0").filter(Boolean).sort();
}

export class BoundedGitLoopFixture {
  #closed = false;
  #cleanupResult = null;
  #implementationSha = null;
  #fixSha = null;
  #reviewerWorktree = null;
  #verifierWorktree = null;

  constructor({
    sourceRoot,
    validatedBaseSha,
    seedFiles,
    allowlist = Object.keys(seedFiles ?? {}),
    temporaryParent = os.tmpdir(),
    maxFileBytes = 64 * 1024,
    maxTotalBytes = 256 * 1024,
  } = {}) {
    assertGitSha(validatedBaseSha, "validatedBaseSha");
    if (
      !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 1024 * 1024 ||
      !Number.isInteger(maxTotalBytes) || maxTotalBytes < maxFileBytes ||
      maxTotalBytes > 4 * 1024 * 1024
    ) {
      throw fixtureError("threadmesh_bounded_git_fixture_invalid", "size limits");
    }
    if (!path.isAbsolute(sourceRoot ?? "") || !fs.existsSync(sourceRoot)) {
      throw fixtureError("threadmesh_bounded_git_fixture_invalid", "sourceRoot");
    }
    const requestedSource = fs.realpathSync(sourceRoot);
    const source = fs.realpathSync(preflightGitText(
      ["-C", requestedSource, "rev-parse", "--show-toplevel"],
      requestedSource,
    ));
    const sourceGitDirectory = resolveGitPath(source, preflightGitText(
      ["-C", source, "rev-parse", "--absolute-git-dir"],
      source,
    ));
    const sourceCommonDirectory = resolveGitPath(source, preflightGitText(
      ["-C", source, "rev-parse", "--git-common-dir"],
      source,
    ));
    const parent = fs.realpathSync(temporaryParent);
    if ([source, sourceGitDirectory, sourceCommonDirectory].some(
      (boundary) => isEqualOrWithin(parent, boundary),
    )) {
      throw fixtureError("threadmesh_bounded_git_fixture_temporary_parent_denied");
    }
    const normalizedAllowlist = normalizeAllowlist(allowlist);
    const seeds = normalizeSeedFiles(
      seedFiles,
      normalizedAllowlist,
      maxFileBytes,
      maxTotalBytes,
    );
    this.root = fs.mkdtempSync(path.join(parent, ROOT_PREFIX));
    this.home = path.join(this.root, "home");
    this.bareRepository = path.join(this.root, "repository.git");
    this.implementerWorktree = path.join(this.root, "implementer");
    Object.defineProperties(this, {
      root: { value: this.root, enumerable: true, writable: false, configurable: false },
      home: { value: this.home, enumerable: false, writable: false, configurable: false },
      bareRepository: {
        value: this.bareRepository,
        enumerable: true,
        writable: false,
        configurable: false,
      },
      implementerWorktree: {
        value: this.implementerWorktree,
        enumerable: true,
        writable: false,
        configurable: false,
      },
    });
    this.validatedBaseSha = validatedBaseSha;
    this.allowlist = normalizedAllowlist;
    this.maxFileBytes = maxFileBytes;
    this.maxTotalBytes = maxTotalBytes;
    this.seedManifest = Object.freeze({
      schemaVersion: 1,
      validatedBaseSha,
      allowlist: [...this.allowlist],
      maxFileBytes,
      maxTotalBytes,
      files: seeds.map(({ path: filePath, byteLength, digest }) => ({
        path: filePath,
        byteLength,
        digest,
      })),
    });
    this.fixtureDefinitionDigest = sha256Digest(this.seedManifest);

    try {
      fs.chmodSync(this.root, 0o700);
      fs.mkdirSync(this.home, { mode: 0o700 });
      if (
        gitText(["-C", source, "rev-parse", "HEAD"], { home: this.home }) !== validatedBaseSha ||
        statusEntries(source, this.home).length !== 0 ||
        gitText(["-C", source, "rev-parse", "--show-object-format"], { home: this.home }) !== "sha1" ||
        !gitSuccess(["-C", source, "cat-file", "-e", `${validatedBaseSha}^{commit}`], {
          cwd: source,
          home: this.home,
        })
      ) {
        throw fixtureError("threadmesh_bounded_git_fixture_source_invalid");
      }
      runGit(["clone", "--bare", "--no-local", "--quiet", source, this.bareRepository], {
        home: this.home,
      });
      fs.chmodSync(this.bareRepository, 0o700);
      if (gitText(["--git-dir", this.bareRepository, "remote"], { home: this.home })) {
        runGit(["--git-dir", this.bareRepository, "remote", "remove", "origin"], { home: this.home });
      }
      runGit(["--git-dir", this.bareRepository, "config", "gc.auto", "0"], { home: this.home });
      this.#assertTopology();

      const branch = `threadmesh-implementer-${path.basename(this.root).slice(ROOT_PREFIX.length)}`;
      runGit([
        "--git-dir", this.bareRepository,
        "worktree", "add", "--quiet", "-b", branch,
        this.implementerWorktree, validatedBaseSha,
      ], { home: this.home });
      fs.chmodSync(this.implementerWorktree, 0o700);
      for (const seed of seeds) safeWrite(this.implementerWorktree, seed.path, seed.content);
      runGit(["-C", this.implementerWorktree, "add", "--", ...this.allowlist], { home: this.home });
      this.#assertBoundedDirty({ requireDirty: true });
      runGit([
        "-C", this.implementerWorktree,
        "commit", "--quiet", "--no-verify", "--no-gpg-sign",
        "-m", "ThreadMesh bounded fixture seed",
        "-m", `Fixture-Digest: ${this.fixtureDefinitionDigest}`,
      ], { home: this.home, extraEnv: FIXED_GIT_ENV });
      this.seedSha = gitText(["-C", this.implementerWorktree, "rev-parse", "HEAD"], { home: this.home });
      this.seedEvidence = this.#checkoutEvidence({
        worktree: this.implementerWorktree,
        role: "seed",
        subjectSha: this.seedSha,
        expectedParent: validatedBaseSha,
        detached: false,
      });
    } catch (error) {
      const cleanup = this.cleanup();
      error.cleanup = cleanup;
      throw error;
    }
  }

  get implementationSha() {
    return this.#implementationSha;
  }

  get fixSha() {
    return this.#fixSha;
  }

  #assertOpen() {
    if (this.#closed) throw fixtureError("threadmesh_bounded_git_fixture_closed");
  }

  #assertTopology() {
    if (
      !fs.existsSync(this.root) ||
      (fs.statSync(this.root).mode & 0o777) !== 0o700 ||
      !fs.existsSync(this.bareRepository) ||
      gitText(["--git-dir", this.bareRepository, "rev-parse", "--is-bare-repository"], {
        home: this.home,
      }) !== "true" ||
      gitText(["--git-dir", this.bareRepository, "remote"], { home: this.home }) !== "" ||
      fs.existsSync(path.join(this.bareRepository, "objects", "info", "alternates"))
    ) {
      throw fixtureError("threadmesh_bounded_git_fixture_topology_invalid");
    }
    if (fs.existsSync(this.implementerWorktree)) {
      const commonDir = gitText(["-C", this.implementerWorktree, "rev-parse", "--git-common-dir"], {
        home: this.home,
      });
      if (fs.realpathSync(path.resolve(this.implementerWorktree, commonDir)) !== fs.realpathSync(this.bareRepository)) {
        throw fixtureError("threadmesh_bounded_git_fixture_topology_invalid", "common dir");
      }
    }
  }

  #assertBoundedDirty({ requireDirty }) {
    this.#assertTopology();
    const entries = statusEntries(this.implementerWorktree, this.home);
    if (requireDirty && entries.length === 0) {
      throw fixtureError("threadmesh_bounded_git_fixture_dirty_invalid", "no bounded change");
    }
    for (const entry of entries) {
      if (
        !this.allowlist.includes(entry.path) ||
        /[DRCU]/u.test(entry.status)
      ) {
        throw fixtureError("threadmesh_bounded_git_fixture_dirty_invalid", "unbounded change");
      }
    }
    const indexed = indexEntries(this.implementerWorktree, this.home);
    if (indexed.some((entry) => entry.mode === "160000" || entry.stage !== 0)) {
      throw fixtureError("threadmesh_bounded_git_fixture_submodule_denied");
    }
    for (const entry of entries) {
      assertRegularBoundedFile(this.implementerWorktree, entry.path, this.maxFileBytes);
    }
    const totalBytes = this.allowlist.reduce((sum, relativePath) => {
      const filename = path.join(this.implementerWorktree, ...relativePath.split("/"));
      return sum + (fs.existsSync(filename) ? fs.lstatSync(filename).size : 0);
    }, 0);
    if (totalBytes > this.maxTotalBytes) {
      throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", "total size");
    }
    return entries;
  }

  writeImplementerFile(relativePath, content, { expectedHead } = {}) {
    this.#assertOpen();
    assertGitSha(expectedHead, "expectedHead");
    const normalized = normalizeRelativePath(relativePath);
    if (!this.allowlist.includes(normalized)) {
      throw fixtureError("threadmesh_bounded_git_fixture_path_denied", normalized);
    }
    if (
      typeof content !== "string" || content.includes("\0") ||
      Buffer.byteLength(content) > this.maxFileBytes
    ) {
      throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", normalized);
    }
    this.#assertBoundedDirty({ requireDirty: false });
    const head = gitText(["-C", this.implementerWorktree, "rev-parse", "HEAD"], { home: this.home });
    if (head !== expectedHead) {
      throw fixtureError("threadmesh_bounded_git_fixture_state_conflict", "head");
    }
    safeWrite(this.implementerWorktree, normalized, content);
    this.#assertBoundedDirty({ requireDirty: true });
    return Object.freeze({
      pathDigest: sha256Digest(normalized),
      contentDigest: sha256Digest(content),
      byteLength: Buffer.byteLength(content),
    });
  }

  #commitPhase(phase, expectedParent) {
    this.#assertOpen();
    assertGitSha(expectedParent, "expectedParent");
    const expected = phase === "implementation" ? this.seedSha : this.#implementationSha;
    if (!expected || expectedParent !== expected) {
      throw fixtureError("threadmesh_bounded_git_fixture_state_conflict", "parent");
    }
    if (phase === "implementation" && this.#implementationSha) {
      throw fixtureError("threadmesh_bounded_git_fixture_state_conflict", "implementation replay");
    }
    if (phase === "fix" && (this.#fixSha || !this.#reviewerWorktree)) {
      throw fixtureError("threadmesh_bounded_git_fixture_state_conflict", "fix sequence");
    }
    if (phase === "fix") {
      this.verifyReviewerCheckout({ implementationSha: this.#implementationSha });
    }
    const head = gitText(["-C", this.implementerWorktree, "rev-parse", "HEAD"], { home: this.home });
    if (head !== expectedParent) {
      throw fixtureError("threadmesh_bounded_git_fixture_state_conflict", "head parent");
    }
    this.#assertBoundedDirty({ requireDirty: true });
    runGit(["-C", this.implementerWorktree, "add", "--", ...this.allowlist], { home: this.home });
    this.#assertBoundedDirty({ requireDirty: true });
    runGit([
      "-C", this.implementerWorktree,
      "commit", "--quiet", "--no-verify", "--no-gpg-sign",
      "-m", phase === "implementation"
        ? "ThreadMesh bounded implementation"
        : "ThreadMesh bounded review fix",
    ], { home: this.home, extraEnv: FIXED_GIT_ENV });
    const subjectSha = gitText(["-C", this.implementerWorktree, "rev-parse", "HEAD"], {
      home: this.home,
    });
    const evidence = this.#checkoutEvidence({
      worktree: this.implementerWorktree,
      role: phase,
      subjectSha,
      expectedParent,
      detached: false,
    });
    if (phase === "implementation") this.#implementationSha = subjectSha;
    else this.#fixSha = subjectSha;
    return evidence;
  }

  commitImplementation({ expectedParent } = {}) {
    return this.#commitPhase("implementation", expectedParent);
  }

  commitFix({ expectedParent } = {}) {
    return this.#commitPhase("fix", expectedParent);
  }

  #createDetached(role, subjectSha, expectedParent) {
    this.#assertOpen();
    assertGitSha(subjectSha, "subjectSha");
    const expected = role === "reviewer" ? this.#implementationSha : this.#fixSha;
    if (!expected || subjectSha !== expected) {
      throw fixtureError("threadmesh_bounded_git_fixture_checkout_invalid", "wrong subject");
    }
    const field = role === "reviewer" ? "#reviewerWorktree" : "#verifierWorktree";
    const existing = role === "reviewer" ? this.#reviewerWorktree : this.#verifierWorktree;
    if (existing) throw fixtureError("threadmesh_bounded_git_fixture_state_conflict", field);
    const worktree = path.join(this.root, role);
    runGit([
      "--git-dir", this.bareRepository,
      "worktree", "add", "--quiet", "--detach", worktree, subjectSha,
    ], { home: this.home });
    fs.chmodSync(worktree, 0o700);
    if (role === "reviewer") this.#reviewerWorktree = worktree;
    else this.#verifierWorktree = worktree;
    return Object.freeze({
      worktree,
      evidence: this.#checkoutEvidence({
        worktree,
        role,
        subjectSha,
        expectedParent,
        detached: true,
      }),
    });
  }

  createReviewerCheckout({ implementationSha } = {}) {
    return this.#createDetached("reviewer", implementationSha, this.seedSha);
  }

  createVerifierCheckout({ fixSha } = {}) {
    return this.#createDetached("verifier", fixSha, this.#implementationSha);
  }

  verifyReviewerCheckout({ implementationSha } = {}) {
    this.#assertOpen();
    if (!this.#reviewerWorktree || implementationSha !== this.#implementationSha) {
      throw fixtureError("threadmesh_bounded_git_fixture_checkout_invalid", "reviewer");
    }
    return this.#checkoutEvidence({
      worktree: this.#reviewerWorktree,
      role: "reviewer",
      subjectSha: implementationSha,
      expectedParent: this.seedSha,
      detached: true,
    });
  }

  verifyVerifierCheckout({ fixSha } = {}) {
    this.#assertOpen();
    if (!this.#verifierWorktree || fixSha !== this.#fixSha) {
      throw fixtureError("threadmesh_bounded_git_fixture_checkout_invalid", "verifier");
    }
    return this.#checkoutEvidence({
      worktree: this.#verifierWorktree,
      role: "verifier",
      subjectSha: fixSha,
      expectedParent: this.#implementationSha,
      detached: true,
    });
  }

  #checkoutEvidence({ worktree, role, subjectSha, expectedParent, detached }) {
    this.#assertTopology();
    assertGitSha(subjectSha, "subjectSha");
    assertGitSha(expectedParent, "expectedParent");
    const head = gitText(["-C", worktree, "rev-parse", "HEAD"], { home: this.home });
    const branch = gitText(["-C", worktree, "branch", "--show-current"], { home: this.home });
    const status = runGit(
      ["-C", worktree, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { home: this.home },
    );
    const parents = gitText(["-C", worktree, "rev-list", "--parents", "-n", "1", subjectSha], {
      home: this.home,
    }).split(" ");
    const treeSha = gitText(["-C", worktree, "rev-parse", `${subjectSha}^{tree}`], { home: this.home });
    const identity = gitText([
      "-C", worktree, "show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce", subjectSha,
    ], { home: this.home });
    const paths = changedPaths(expectedParent, subjectSha, worktree, this.home);
    const commonDir = fs.realpathSync(path.resolve(
      worktree,
      gitText(["-C", worktree, "rev-parse", "--git-common-dir"], { home: this.home }),
    ));
    if (
      head !== subjectSha || status !== "" ||
      (detached ? branch !== "" : branch === "") ||
      identity !== [
        FIXED_GIT_ENV.GIT_AUTHOR_NAME,
        FIXED_GIT_ENV.GIT_AUTHOR_EMAIL,
        FIXED_GIT_ENV.GIT_COMMITTER_NAME,
        FIXED_GIT_ENV.GIT_COMMITTER_EMAIL,
      ].join("\0") ||
      parents.length !== 2 || parents[0] !== subjectSha || parents[1] !== expectedParent ||
      commonDir !== fs.realpathSync(this.bareRepository) ||
      paths.length < 1 || paths.some((filePath) => !this.allowlist.includes(filePath)) ||
      !gitSuccess(["-C", worktree, "merge-base", "--is-ancestor", expectedParent, subjectSha], {
        cwd: worktree,
        home: this.home,
      })
    ) {
      throw fixtureError("threadmesh_bounded_git_fixture_checkout_invalid", role);
    }
    const subjectEntries = runGit(
      ["-C", worktree, "ls-tree", "-r", "-z", subjectSha, "--", ...paths],
      { home: this.home },
    ).split("\0").filter(Boolean);
    if (subjectEntries.some((entry) => !entry.startsWith("100644 blob "))) {
      throw fixtureError("threadmesh_bounded_git_fixture_file_invalid", "tree mode");
    }
    const diff = runGit([
      "-C", worktree, "diff", "--binary", "--no-ext-diff", expectedParent, subjectSha,
      "--", ...this.allowlist,
    ], { home: this.home });
    return Object.freeze({
      role,
      validatedBaseSha: this.validatedBaseSha,
      fixtureDefinitionDigest: this.fixtureDefinitionDigest,
      seedSha: this.seedSha ?? subjectSha,
      subjectSha,
      parentSha: expectedParent,
      treeSha,
      clean: true,
      detached,
      ancestryVerified: true,
      changedPathCount: paths.length,
      changedPathsDigest: sha256Digest(paths),
      diffDigest: sha256Digest(diff),
      statusDigest: sha256Digest(""),
      authorIdentityDigest: sha256Digest(identity),
    });
  }

  cleanup() {
    if (this.#cleanupResult) return this.#cleanupResult;
    this.#closed = true;
    let errorCode = null;
    try {
      if (
        typeof this.root !== "string" ||
        path.basename(this.root).startsWith(ROOT_PREFIX) !== true
      ) {
        throw fixtureError("threadmesh_bounded_git_fixture_cleanup_refused");
      }
      if (fs.existsSync(this.bareRepository)) {
        for (const worktree of [this.#verifierWorktree, this.#reviewerWorktree, this.implementerWorktree]) {
          if (!worktree || !fs.existsSync(worktree)) continue;
          spawnSync("git", [
            ...SAFE_GIT_GLOBAL_ARGS,
            "--git-dir", this.bareRepository,
            "worktree", "remove", "--force", worktree,
          ], {
            env: gitEnvironment(this.home),
            stdio: "ignore",
            timeout: 10_000,
          });
        }
      }
      fs.rmSync(this.root, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
    } catch (error) {
      errorCode = error?.code ?? "threadmesh_bounded_git_fixture_cleanup_failed";
    }
    const result = Object.freeze({
      attempted: true,
      complete: !fs.existsSync(this.root),
      temporaryRootRemoved: !fs.existsSync(this.root),
      bareRepositoryRemoved: !fs.existsSync(this.bareRepository),
      implementerWorktreeRemoved: !fs.existsSync(this.implementerWorktree),
      reviewerWorktreeRemoved: !this.#reviewerWorktree || !fs.existsSync(this.#reviewerWorktree),
      verifierWorktreeRemoved: !this.#verifierWorktree || !fs.existsSync(this.#verifierWorktree),
      ...(errorCode ? { errorCode } : {}),
    });
    this.#cleanupResult = result;
    return result;
  }
}

export function createBoundedGitLoopFixture(options) {
  return new BoundedGitLoopFixture(options);
}
