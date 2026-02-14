const GITHUB_API = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 10000;

async function githubFetch(path, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'InfiniteBot/1.0',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${GITHUB_API}${path}`, {
    signal: controller.signal,
    headers,
  });

  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

async function repoInfo(owner, repo, token) {
  const data = await githubFetch(`/repos/${owner}/${repo}`, token);
  return {
    name: data.full_name,
    description: data.description,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    language: data.language,
    license: data.license?.spdx_id || null,
    defaultBranch: data.default_branch,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    topics: data.topics || [],
    url: data.html_url,
  };
}

async function fileContent(owner, repo, path, token) {
  const data = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token);

  if (Array.isArray(data)) {
    return {
      type: 'directory',
      path,
      files: data.map(f => ({ name: f.name, type: f.type, size: f.size })),
    };
  }

  if (data.encoding === 'base64' && data.content) {
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    return {
      type: 'file',
      path: data.path,
      size: data.size,
      content: decoded.slice(0, 8000),
      truncated: decoded.length > 8000,
    };
  }

  return { type: data.type, path: data.path, size: data.size, downloadUrl: data.download_url };
}

async function searchCode(owner, repo, query, token) {
  const data = await githubFetch(`/search/code?q=${encodeURIComponent(query)}+repo:${owner}/${repo}&per_page=10`, token);
  return {
    totalCount: data.total_count,
    items: (data.items || []).map(item => ({
      path: item.path,
      name: item.name,
      url: item.html_url,
    })),
  };
}

async function listIssues(owner, repo, token) {
  const data = await githubFetch(`/repos/${owner}/${repo}/issues?per_page=15&state=open&sort=updated`, token);
  return data.map(issue => ({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map(l => l.name),
    createdAt: issue.created_at,
    url: issue.html_url,
    isPR: !!issue.pull_request,
  }));
}

export async function executeGithubLookup({ action, owner, repo, path, query }, token) {
  if (!action) return { error: 'action is required (repo_info, file_content, search_code, list_issues)' };
  if (!owner || !repo) return { error: 'owner and repo are required' };

  try {
    switch (action) {
      case 'repo_info':
        return await repoInfo(owner, repo, token);
      case 'file_content':
        if (!path) return { error: 'path is required for file_content' };
        return await fileContent(owner, repo, path, token);
      case 'search_code':
        if (!query) return { error: 'query is required for search_code' };
        return await searchCode(owner, repo, query, token);
      case 'list_issues':
        return await listIssues(owner, repo, token);
      default:
        return { error: `Unknown action: ${action}. Use: repo_info, file_content, search_code, list_issues` };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { error: 'GitHub API request timed out (10s limit)' };
    }
    return { error: err.message };
  }
}
