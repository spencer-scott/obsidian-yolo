import { requestUrl } from 'obsidian'

import { type FileEntry, parseFrontmatter } from './skillValidation'

// ---------------------------------------------------------------------------
// The only retained limit: single file size. Others (depth / file count /
// directory count) are covered by GitHub's Trees API limits (max 100k entries
// / 7MB per response, returns truncated:true).
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 1 * 1024 * 1024 // 1MB per file

// Allowed character set for owner / repo / branch / path segments.
// GitHub restricts owner / repo to alnum / `-` / `_` / `.`; reused here.
const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/

function isSafePathSegment(seg: string): boolean {
  if (!seg) return false
  if (seg === '.' || seg === '..') return false
  if (/[\\]/.test(seg)) return false
  // Reject control characters / filesystem-dangerous characters
  // eslint-disable-next-line no-control-regex -- Explicit check for NUL and control characters is intentional
  if (/[<>:"|?*\x00-\x1f]/.test(seg)) return false
  return true
}

function decodeAndValidatePath(path: string): string | null {
  if (/\\/.test(path)) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return null
  }
  // eslint-disable-next-line no-control-regex -- Explicit check for control characters
  if (/\\/.test(decoded) || /[\x00-\x1f]/.test(decoded)) return null
  const segments = decoded.split('/')
  for (const seg of segments) {
    if (!isSafePathSegment(seg)) return null
  }
  return decoded
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export type GitHubUrlInfo = {
  owner: string
  repo: string
  /** Explicit branch (specified in the URL); bare repo URLs default to 'main' with fallback to 'master' */
  branch: string
  /** Whether the branch was explicitly specified in the URL; affects master fallback behavior */
  branchExplicit: boolean
  /** File path (file mode) / subdirectory path (repo mode, optional) */
  path?: string
  type: 'file' | 'repo'
}

const GITHUB_BLOB_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)\/blob\/([^/]+)\/(.+\.md)$/

const GITHUB_TREE_RE =
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)\/tree\/([^/]+)\/(.+)$/

const GITHUB_REPO_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(\.git)?$/

function isSafeSegment(seg: string): boolean {
  if (!seg) return false
  if (seg === '.' || seg === '..') return false
  return SEGMENT_PATTERN.test(seg)
}

function validateOwnerRepo(owner: string, repo: string): boolean {
  return isSafeSegment(owner) && isSafeSegment(repo)
}

export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
  const trimmed = url.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  const blobMatch = GITHUB_BLOB_RE.exec(trimmed)
  if (blobMatch) {
    const owner = blobMatch[1]
    const repo = blobMatch[2]
    const branch = blobMatch[3]
    if (!validateOwnerRepo(owner, repo)) return null
    if (!isSafeSegment(branch)) return null
    const safePath = decodeAndValidatePath(blobMatch[4])
    if (!safePath) return null
    return {
      owner,
      repo,
      branch,
      branchExplicit: true,
      path: safePath,
      type: 'file',
    }
  }

  const treeMatch = GITHUB_TREE_RE.exec(trimmed)
  if (treeMatch) {
    const owner = treeMatch[1]
    const repo = treeMatch[2]
    const branch = treeMatch[3]
    if (!validateOwnerRepo(owner, repo)) return null
    if (!isSafeSegment(branch)) return null
    const safePath = decodeAndValidatePath(treeMatch[4])
    if (!safePath) return null
    return {
      owner,
      repo,
      branch,
      branchExplicit: true,
      path: safePath,
      type: 'repo',
    }
  }

  const repoMatch = GITHUB_REPO_RE.exec(trimmed)
  if (repoMatch) {
    const owner = repoMatch[1]
    const repo = repoMatch[2]
    if (!validateOwnerRepo(owner, repo)) return null
    return {
      owner,
      repo,
      branch: 'main',
      branchExplicit: false,
      type: 'repo',
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class GitHubRateLimitError extends Error {
  constructor() {
    super('GitHub API rate limit exceeded')
    this.name = 'GitHubRateLimitError'
  }
}

export class GitHubNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubNotFoundError'
  }
}

export class GitHubLimitExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitHubLimitExceededError'
  }
}

// ---------------------------------------------------------------------------
// Low-level HTTP
// ---------------------------------------------------------------------------

function encodePathSegments(path: string): string {
  return path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function buildRawUrl(info: GitHubUrlInfo, filePath: string): string {
  return `https://raw.githubusercontent.com/${encodeURIComponent(info.owner)}/${encodeURIComponent(info.repo)}/${encodeURIComponent(info.branch)}/${encodePathSegments(filePath)}`
}

function isRateLimitResponse(
  status: number,
  headers: Record<string, string> | undefined,
): boolean {
  if (status === 429) return true
  if (status !== 403) return false
  // primary:x-ratelimit-remaining: 0
  const remaining =
    headers?.['x-ratelimit-remaining'] ?? headers?.['X-RateLimit-Remaining']
  if (remaining === '0') return true
  // secondary: retry-after header present (GitHub includes retry-after for secondary rate limits)
  if (headers?.['retry-after'] ?? headers?.['Retry-After']) return true
  return false
}

/**
 * Fetch raw text with a size limit. Uses content-length first; falls back to
 * byte length verification after download completes.
 */
async function fetchRawText(rawUrl: string): Promise<string> {
  const response = await requestUrl({ url: rawUrl, throw: false })

  if (isRateLimitResponse(response.status, response.headers)) {
    throw new GitHubRateLimitError()
  }
  if (response.status === 404) {
    throw new GitHubNotFoundError(`404: ${rawUrl}`)
  }
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}: ${rawUrl}`)
  }

  const contentLengthRaw =
    response.headers?.['content-length'] ?? response.headers?.['Content-Length']
  const contentLength = contentLengthRaw ? Number(contentLengthRaw) : NaN
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES) {
    throw new GitHubLimitExceededError(
      `file exceeds ${MAX_FILE_BYTES} bytes: ${rawUrl}`,
    )
  }

  const text = response.text
  // CDN may gzip; content-length can be smaller than decompressed size; verify with UTF-8 byte length after download
  const byteLength = new TextEncoder().encode(text).byteLength
  if (byteLength > MAX_FILE_BYTES) {
    throw new GitHubLimitExceededError(
      `file exceeds ${MAX_FILE_BYTES} bytes: ${rawUrl}`,
    )
  }
  return text
}

// ---------------------------------------------------------------------------
// Git Trees API: fetch the entire tree in one request; subsequent raw
// downloads do not consume API quota
// ---------------------------------------------------------------------------

type GitTreeEntry = {
  path: string
  /** 100644=file, 100755=executable, 120000=symlink, 040000=dir, 160000=submodule */
  mode: string
  type: 'blob' | 'tree' | 'commit'
  sha: string
  size?: number
}

type GitTreeResponse = {
  sha: string
  tree: GitTreeEntry[]
  truncated: boolean
}

async function fetchRepoTree(info: GitHubUrlInfo): Promise<GitTreeResponse> {
  const ownerSeg = encodeURIComponent(info.owner)
  const repoSeg = encodeURIComponent(info.repo)
  const refSeg = encodeURIComponent(info.branch)
  const apiUrl = `https://api.github.com/repos/${ownerSeg}/${repoSeg}/git/trees/${refSeg}?recursive=1`

  const response = await requestUrl({ url: apiUrl, throw: false })

  if (isRateLimitResponse(response.status, response.headers)) {
    throw new GitHubRateLimitError()
  }
  if (response.status === 403) {
    throw new Error(`HTTP 403: ${apiUrl}`)
  }
  if (response.status === 404 || response.status === 422) {
    // 422 = ref does not exist (GitHub Trees API returns 422 for unknown refs)
    throw new GitHubNotFoundError(`ref not found: ${info.branch}`)
  }
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}: ${apiUrl}`)
  }
  const body = response.json as GitTreeResponse | null
  if (!body || !Array.isArray(body.tree)) {
    throw new Error(`Unexpected GitHub API response: ${apiUrl}`)
  }
  return body
}

// ---------------------------------------------------------------------------
// Concurrent download utilities
// ---------------------------------------------------------------------------

const RAW_DOWNLOAD_CONCURRENCY = 8

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workerCount = Math.max(1, Math.min(limit, items.length))
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = cursor++
      if (idx >= items.length) return
      results[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export type GitHubFetchResult = {
  files: FileEntry[]
  /** Display source name */
  sourceName: string
  /** Directory mode = frontmatter.name; single-file mode = source filename */
  targetName: string
  isDirectory: boolean
}

/**
 * Build a skill package from the tree based on the SKILL.md entry (downloading
 * all blobs). skillDir = '' means the skill root is the repository root.
 */
async function buildSkillPackage(
  effectiveInfo: GitHubUrlInfo,
  tree: GitTreeResponse,
  skillDir: string,
  /** Other skill directories in the same tree, used to exclude subtrees when nested */
  siblingSkillDirs: string[],
  fallbackRepoName: string,
): Promise<GitHubFetchResult> {
  const skillMdPath = skillDir ? `${skillDir}/SKILL.md` : 'SKILL.md'
  const subtreePrefix = skillDir ? `${skillDir}/` : ''

  const blobs = tree.tree.filter((e) => {
    if (e.type !== 'blob') return false
    if (e.mode === '120000') return false
    // Within the skill subtree
    if (skillDir === '') {
      // Repo root as skill root: exclude files belonging to other skill subtrees
      const inOtherSkill = siblingSkillDirs.some(
        (other) => other !== '' && e.path.startsWith(`${other}/`),
      )
      return !inOtherSkill
    }
    return e.path === skillMdPath || e.path.startsWith(subtreePrefix)
  })

  // Pre-check file sizes using tree metadata to avoid unnecessary downloads
  for (const blob of blobs) {
    if (typeof blob.size === 'number' && blob.size > MAX_FILE_BYTES) {
      throw new GitHubLimitExceededError(
        `file exceeds ${MAX_FILE_BYTES} bytes: ${blob.path}`,
      )
    }
  }

  const downloaded = await mapWithConcurrency(
    blobs,
    RAW_DOWNLOAD_CONCURRENCY,
    async (blob) => ({
      blob,
      content: await fetchRawText(buildRawUrl(effectiveInfo, blob.path)),
    }),
  )

  const files: FileEntry[] = []
  let skillMdContent = ''
  for (const { blob, content } of downloaded) {
    const relativePath = skillDir
      ? blob.path.slice(subtreePrefix.length)
      : blob.path
    files.push({ relativePath, content })
    if (blob.path === skillMdPath) skillMdContent = content
  }

  const fm = parseFrontmatter(skillMdContent)
  const fmName =
    typeof fm?.name === 'string' && fm.name.trim().length > 0
      ? fm.name.trim()
      : null
  const dirLastSeg = skillDir ? (skillDir.split('/').pop() ?? skillDir) : ''
  const fallbackName = dirLastSeg || fallbackRepoName
  const targetName = fmName ?? fallbackName

  return {
    files,
    sourceName: dirLastSeg || fallbackRepoName,
    targetName,
    isDirectory: true,
  }
}

/**
 * Fetch the content pointed to by a GitHub URL, returning one or more skill
 * packages.
 *
 * - blob URL: single-file skill (returns 1)
 * - tree/repo URL with SKILL.md directly at the path: single skill (returns 1)
 * - tree/repo URL without SKILL.md at the path but N in subtrees: N skills
 * - No SKILL.md found: throws GitHubNotFoundError
 */
export async function fetchGitHubSkill(
  url: string,
): Promise<GitHubFetchResult[]> {
  const info = parseGitHubUrl(url)
  if (!info) {
    throw new Error('Invalid GitHub URL')
  }

  if (info.type === 'file') {
    const filePath = info.path!
    const content = await fetchRawText(buildRawUrl(info, filePath))
    const fileName = filePath.split('/').pop() ?? filePath
    return [
      {
        files: [{ relativePath: fileName, content }],
        sourceName: fileName,
        targetName: fileName,
        isDirectory: false,
      },
    ]
  }

  // ---- repo / tree mode ----
  const rootPath = info.path ?? ''

  // 1. Fetch the entire tree (allow main -> master fallback for bare repo URLs)
  let tree: GitTreeResponse
  let effectiveInfo = info
  try {
    tree = await fetchRepoTree(info)
  } catch (err) {
    if (
      err instanceof GitHubNotFoundError &&
      !info.branchExplicit &&
      info.branch === 'main'
    ) {
      effectiveInfo = { ...info, branch: 'master' }
      tree = await fetchRepoTree(effectiveInfo)
    } else {
      throw err
    }
  }

  if (tree.truncated) {
    throw new GitHubLimitExceededError(
      'repository tree exceeds GitHub single-response limit (truncated)',
    )
  }

  // 2. Locate all SKILL.md files
  //    - If SKILL.md exists directly at the path: single skill with that path as root
  //    - Otherwise: find all SKILL.md files in the subtree
  const directSkillMd = rootPath ? `${rootPath}/SKILL.md` : 'SKILL.md'
  const hasDirectSkillMd = tree.tree.some(
    (e) => e.type === 'blob' && e.path === directSkillMd,
  )

  let skillDirs: string[]
  if (hasDirectSkillMd) {
    skillDirs = [rootPath]
  } else {
    const subtreePrefix = rootPath ? `${rootPath}/` : ''
    const skillMdEntries = tree.tree.filter((e) => {
      if (e.type !== 'blob') return false
      if (rootPath !== '' && !e.path.startsWith(subtreePrefix)) return false
      const segs = e.path.split('/')
      return segs[segs.length - 1] === 'SKILL.md'
    })
    if (skillMdEntries.length === 0) {
      throw new GitHubNotFoundError('SKILL.md not found at the specified path')
    }
    // Get the directory of each SKILL.md
    const dirs = skillMdEntries.map((e) => {
      const slashIdx = e.path.lastIndexOf('/')
      return slashIdx === -1 ? '' : e.path.slice(0, slashIdx)
    })
    // Exclude nested: if A is a parent directory of B, discard B (keep only the shallowest)
    dirs.sort((a, b) => a.length - b.length)
    const accepted: string[] = []
    for (const dir of dirs) {
      const isNested = accepted.some((parent) =>
        parent === '' ? true : dir.startsWith(`${parent}/`),
      )
      if (!isNested) accepted.push(dir)
    }
    skillDirs = accepted
  }

  // 3. Build each skill package sequentially (files within a package download concurrently; skills are serial to avoid concurrency explosion)
  const results: GitHubFetchResult[] = []
  for (const skillDir of skillDirs) {
    const pkg = await buildSkillPackage(
      effectiveInfo,
      tree,
      skillDir,
      skillDirs,
      info.repo,
    )
    results.push(pkg)
  }
  return results
}
