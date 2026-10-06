export function blobUrl(repo: string, branch: string, path: string): string {
  return `https://github.com/${repo}/blob/${branch}/${path}`;
}

export function repoUrl(repo: string): string {
  return `https://github.com/${repo}`;
}
