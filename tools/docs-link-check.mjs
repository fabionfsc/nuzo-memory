#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const docsRoot = join(repositoryRoot, "docs");
const externalTimeoutMs = Number.parseInt(process.env.NUZO_DOCS_LINK_TIMEOUT_MS ?? "8000", 10);
const checkExternal = process.env.NUZO_DOCS_LINK_CHECK_EXTERNAL !== "0";

const markdownFiles = [
  "README.md",
  "packages/memory/README.md",
  "packages/cli/README.md",
  "packages/mcp-server/README.md",
  ...listMarkdownFiles(docsRoot).map((path) => relative(repositoryRoot, path)),
].sort();

const failures = [];
const externalLinks = new Map();

for (const path of markdownFiles) {
  checkMarkdownFile(path);
}

if (checkExternal) {
  await checkExternalLinks();
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

const externalMessage = checkExternal
  ? `${externalLinks.size} external link(s)`
  : "external link checks disabled";
console.log(`documentation link validation passed: ${markdownFiles.length} files, ${externalMessage}`);

function checkMarkdownFile(path) {
  const absolutePath = join(repositoryRoot, path);
  const content = readFileSync(absolutePath, "utf8");
  const anchors = markdownAnchors(content);

  for (const link of extractMarkdownLinks(content)) {
    if (link.target.startsWith("#")) {
      checkAnchor(path, link.line, path, link.target, anchors);
      continue;
    }
    if (isExternalUrl(link.target)) {
      addExternalLink(path, link);
      continue;
    }
    if (isIgnoredScheme(link.target)) {
      continue;
    }
    checkLocalLink(path, link);
  }
}

function checkLocalLink(sourcePath, link) {
  const [targetPath, hash] = link.target.split("#", 2);
  const decodedTargetPath = decodeURIComponent(targetPath);
  const absoluteTarget = normalize(resolve(dirname(join(repositoryRoot, sourcePath)), decodedTargetPath));
  if (!absoluteTarget.startsWith(repositoryRoot)) {
    fail(sourcePath, link.line, `local link escapes repository: ${link.target}`);
    return;
  }
  if (!existsSync(absoluteTarget)) {
    fail(sourcePath, link.line, `local link target does not exist: ${link.target}`);
    return;
  }
  if (hash && extname(absoluteTarget) === ".md") {
    const targetRelative = relative(repositoryRoot, absoluteTarget);
    const targetContent = readFileSync(absoluteTarget, "utf8");
    checkAnchor(sourcePath, link.line, targetRelative, `#${hash}`, markdownAnchors(targetContent));
  }
}

function checkAnchor(sourcePath, line, targetPath, hash, anchors) {
  const normalizedHash = decodeURIComponent(hash.slice(1)).toLowerCase();
  if (!anchors.has(normalizedHash)) {
    fail(sourcePath, line, `anchor not found in ${targetPath}: ${hash}`);
  }
}

async function checkExternalLinks() {
  for (const [url, references] of externalLinks) {
    if (isIgnoredExternalUrl(url)) {
      continue;
    }
    const result = await resolves(url);
    if (result.ok) {
      continue;
    }
    for (const reference of references) {
      fail(reference.path, reference.line, `external link failed (${result.reason}): ${url}`);
    }
  }
}

async function resolves(url) {
  for (const method of ["HEAD", "GET"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), externalTimeoutMs);
    try {
      const response = await fetch(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "nuzo-docs-link-check/1.0",
        },
      });
      if (response.status >= 200 && response.status < 400) {
        return { ok: true };
      }
      if (![403, 405, 429].includes(response.status)) {
        return { ok: false, reason: `HTTP ${response.status}` };
      }
      if (method === "GET" || response.status === 403 || response.status === 429) {
        return { ok: false, reason: `HTTP ${response.status}` };
      }
    } catch (error) {
      if (method === "GET") {
        return { ok: false, reason: error.name === "AbortError" ? "timeout" : error.message };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, reason: "unreachable" };
}

function addExternalLink(path, link) {
  const url = normalizeExternalUrl(link.target);
  const references = externalLinks.get(url) ?? [];
  references.push({ path, line: link.line });
  externalLinks.set(url, references);
}

function extractMarkdownLinks(content) {
  const links = [];
  const lines = content.split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    if (/^\s{0,3}```/u.test(line)) {
      continue;
    }
    for (const match of line.matchAll(/!?\[[^\]]+\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
      links.push({ target: match[1], line: index + 1 });
    }
    for (const match of line.matchAll(/(?<![\]("'<])https?:\/\/[^\s)"'<>]+/gu)) {
      links.push({ target: match[0], line: index + 1 });
    }
  }
  return links;
}

function markdownAnchors(content) {
  const anchors = new Set();
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^(#{1,6})\s+(.+)$/u);
    if (!match) {
      continue;
    }
    const heading = match[2]
      .replace(/[{]#[^}]+[}]$/u, "")
      .replace(/`([^`]+)`/gu, "$1")
      .trim();
    anchors.add(slugify(heading));
  }
  return anchors;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/gu, "-");
}

function listMarkdownFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(path));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path);
    }
  }
  return files;
}

function isExternalUrl(value) {
  return /^https?:\/\//u.test(value);
}

function isIgnoredScheme(value) {
  return /^(mailto:|tel:|#)/u.test(value);
}

function normalizeExternalUrl(value) {
  return value.replace(/[.,;:]+$/u, "");
}

function isIgnoredExternalUrl(value) {
  const url = new URL(value);
  // Historical GitHub Actions run pages may expire or require dynamic state;
  // release evidence still keeps the URL text, but CI does not depend on them.
  if (url.hostname === "github.com" && url.pathname.includes("/actions/runs/")) {
    return true;
  }
  // Badges are generated images rather than user navigation targets.
  if (url.hostname === "github.com" && url.pathname.includes("/actions/workflows/") && url.pathname.endsWith("/badge.svg")) {
    return true;
  }
  if (url.hostname === "img.shields.io") {
    return true;
  }
  return false;
}

function fail(path, line, message) {
  failures.push(`${path}:${line}: ${message}`);
}
