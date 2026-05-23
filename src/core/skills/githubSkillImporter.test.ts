import { parseGitHubUrl } from './githubSkillImporter'

describe('parseGitHubUrl', () => {
  it('parses a single-file blob URL', () => {
    expect(
      parseGitHubUrl(
        'https://github.com/user/repo/blob/main/skills/my-skill.md',
      ),
    ).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      branchExplicit: true,
      path: 'skills/my-skill.md',
      type: 'file',
    })
  })

  it('parses a repo root URL', () => {
    expect(parseGitHubUrl('https://github.com/user/repo')).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      branchExplicit: false,
      type: 'repo',
    })
  })

  it('parses repo URL with trailing slash', () => {
    expect(parseGitHubUrl('https://github.com/user/repo/')).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      branchExplicit: false,
      type: 'repo',
    })
  })

  it('parses repo URL with .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/user/repo.git')).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      branchExplicit: false,
      type: 'repo',
    })
  })

  it('parses a tree URL pointing to a subdirectory', () => {
    expect(
      parseGitHubUrl(
        'https://github.com/okooo5km/beautiful-mermaid-cli/tree/main/skills/beautiful-mermaid',
      ),
    ).toEqual({
      owner: 'okooo5km',
      repo: 'beautiful-mermaid-cli',
      branch: 'main',
      branchExplicit: true,
      path: 'skills/beautiful-mermaid',
      type: 'repo',
    })
  })

  it('parses tree URL with master branch', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/tree/master/path/to/skill'),
    ).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'master',
      branchExplicit: true,
      path: 'path/to/skill',
      type: 'repo',
    })
  })

  it('parses blob URL with master branch', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/blob/master/skills/test.md'),
    ).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'master',
      branchExplicit: true,
      path: 'skills/test.md',
      type: 'file',
    })
  })

  it('accepts http:// scheme', () => {
    expect(parseGitHubUrl('http://github.com/user/repo')).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      branchExplicit: false,
      type: 'repo',
    })
  })

  it('trims surrounding whitespace', () => {
    expect(parseGitHubUrl('  https://github.com/user/repo  ')).toEqual({
      owner: 'user',
      repo: 'repo',
      branch: 'main',
      branchExplicit: false,
      type: 'repo',
    })
  })

  it('returns null for non-GitHub URL', () => {
    expect(parseGitHubUrl('https://example.com/file.md')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseGitHubUrl('')).toBeNull()
    expect(parseGitHubUrl('   ')).toBeNull()
  })

  it('returns null for blob URL pointing to non-md file', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/blob/main/readme.txt'),
    ).toBeNull()
  })

  it('returns null when path contains ".." segment (decoded)', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/tree/main/skills/../etc'),
    ).toBeNull()
  })

  it('returns null when path contains percent-encoded ".."', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/tree/main/%2e%2e/etc'),
    ).toBeNull()
  })

  it('returns null when path contains backslash', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/blob/main/foo\\bar.md'),
    ).toBeNull()
  })

  it('returns null when owner has invalid chars', () => {
    expect(parseGitHubUrl('https://github.com/us er/repo')).toBeNull()
  })

  it('returns null for blob path that decodes to a non-md file', () => {
    // `%2e` decodes to `.`, causing the .md suffix to disappear - should be
    // rejected at the regex level first; covered by segment validation as a safety net
    expect(
      parseGitHubUrl('https://github.com/user/repo/blob/main/foo%00.md'),
    ).toBeNull()
  })

  it('returns null for URL with query string after repo', () => {
    expect(parseGitHubUrl('https://github.com/user/repo?tab=readme')).toBeNull()
  })

  it('returns null for URL with fragment after repo', () => {
    expect(parseGitHubUrl('https://github.com/user/repo#readme')).toBeNull()
  })

  it('returns null when owner is "."', () => {
    expect(parseGitHubUrl('https://github.com/./repo')).toBeNull()
  })

  it('returns null when repo is ".."', () => {
    expect(parseGitHubUrl('https://github.com/user/..')).toBeNull()
  })

  it('returns null when branch is ".."', () => {
    expect(
      parseGitHubUrl('https://github.com/user/repo/blob/../SKILL.md'),
    ).toBeNull()
    expect(
      parseGitHubUrl('https://github.com/user/repo/tree/../path'),
    ).toBeNull()
  })
})
