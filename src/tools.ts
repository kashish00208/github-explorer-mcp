import { Octokit } from "@octokit/rest";

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

export type CodeSearchOptions = {
  repoUrl: string;
  query: string;
  perPage?: number;
};

export function parseGithubRepoUrl(repo_url: string) {
  const match =
    repo_url.match(/github\.com[/:]([^/]+)\/([^/#?]+)/i) ??
    repo_url.match(/git@github\.com:([^/]+)\/([^/#?]+)/i);

  if (!match) {
    throw new Error("Invalid GitHub repository URL");
  }

  return {
    owner: match[1],
    repo: match[2].replace(/\.git$/, ""),
  };
}

export async function analyze_repository(repo_url: string) {
  const { owner, repo } = parseGithubRepoUrl(repo_url);
  const response = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: "",
  });

  const files = response.data;
  if (!Array.isArray(files)) {
    throw new Error("Expected repository directory contents");
  }

  const project_structure = files.map((file) => ({
    name: file.name,
    path: file.path,
    type: file.type,
  }));

  return { owner, repo, project_structure };
}

export async function get_repository_map(repo_url: string) {
  const { owner, repo } = parseGithubRepoUrl(repo_url);

  const { data: repository } = await octokit.rest.repos.get({ owner, repo });
  const branch = repository.default_branch;

  const { data: treeData } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  return {
    owner,
    repo,
    branch,
    files: (treeData.tree || []).map((item) => ({
      path: item.path,
      type: item.type,
      sha: item.sha,
      size: item.size,
    })),
    truncated: treeData.truncated,
  };
}

export async function detectTechStack(repo_url: string) {
  const repoMap = await get_repository_map(repo_url);
  const paths = repoMap.files.map((item) => item.path ?? "").filter(Boolean);

  const has = (filename: string) => paths.some((path) => path === filename);
  const hasAny = (...filenames: string[]) => filenames.some(has);

  const stack = {
    languages: [] as string[],
    frontend: [] as string[],
    backend: [] as string[],
    database: [] as string[],
    tools: [] as string[],
  };

  if (hasAny("tsconfig.json")) stack.languages.push("TypeScript");
  if (hasAny("package.json", "vite.config.js", "vite.config.ts", "webpack.config.js")) {
    stack.languages.push("JavaScript");
  }
  if (hasAny("requirements.txt", "pyproject.toml", "Pipfile", "manage.py")) {
    stack.languages.push("Python");
  }
  if (hasAny("Gemfile", "config/application.rb")) stack.languages.push("Ruby");
  if (hasAny("go.mod")) stack.languages.push("Go");
  if (hasAny("Cargo.toml")) stack.languages.push("Rust");

  if (hasAny("next.config.js", "next.config.mjs", "next.config.ts")) stack.frontend.push("Next.js");
  if (hasAny("vite.config.js", "vite.config.ts")) stack.frontend.push("Vite");
  if (hasAny("angular.json")) stack.frontend.push("Angular");
  if (hasAny("vue.config.js", "nuxt.config.ts", "nuxt.config.js")) stack.frontend.push("Vue / Nuxt");

  if (hasAny("manage.py")) stack.backend.push("Django (likely)");
  if (hasAny("Gemfile", "config/routes.rb")) stack.backend.push("Ruby on Rails (possible)");
  if (hasAny("nest-cli.json")) stack.backend.push("NestJS");

  if (hasAny("Dockerfile", "docker-compose.yml", "compose.yaml", "compose.yml")) stack.tools.push("Docker");
  if (paths.some((p) => p.startsWith(".github/workflows/"))) stack.tools.push("GitHub Actions");

  if (hasAny("prisma/schema.prisma")) stack.database.push("Prisma ORM");
  if (hasAny("drizzle.config.ts", "drizzle.config.js")) stack.database.push("Drizzle ORM");

  return {
    repository: `${repoMap.owner}/${repoMap.repo}`,
    defaultBranch: repoMap.branch,
    stack,
    truncated: repoMap.truncated,
    note: "Detections are heuristic; inspect manifests for accuracy.",
  };
}

export function detectLanguage(filePath: string) {
  const name = filePath.toLowerCase();
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "TypeScript";
  if (name.endsWith(".js") || name.endsWith(".jsx")) return "JavaScript";
  if (name.endsWith(".py")) return "Python";
  if (name.endsWith(".go")) return "Go";
  if (name.endsWith(".rs")) return "Rust";
  if (name.endsWith(".java")) return "Java";
  if (name.endsWith(".json")) return "JSON";
  if (name.endsWith(".md")) return "Markdown";
  if (name.endsWith(".yml") || name.endsWith(".yaml")) return "YAML";
  if (name.endsWith(".sql")) return "SQL";
  return "Text";
}

export function extractSymbolNames(content: string) {
  const patterns = [
    /export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:default\s+)?class\s+([A-Za-z0-9_]+)/g,
    /export\s+(?:const|let|var|interface|type)\s+([A-Za-z0-9_]+)/g,
    /class\s+([A-Za-z0-9_]+)/g,
    /function\s+([A-Za-z0-9_]+)/g,
    /const\s+([A-Za-z0-9_]+)\s*=\s*/g,
  ];

  const symbols = new Set<string>();
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) symbols.add(match[1]);
    }
  }
  return [...symbols].slice(0, 8);
}

export async function explain_file(repo_url: string, file_path: string) {
  const { owner, repo } = parseGithubRepoUrl(repo_url);
  const normalizedPath = file_path.replace(/^\/+/, "");

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: normalizedPath,
  });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error("Path must point to a file, not a directory.");
  }

  const content =
    typeof data.content === "string" && data.content
      ? Buffer.from(
          data.content,
          data.encoding === "base64" ? "base64" : "utf8",
        ).toString("utf8")
      : "";

  const language = detectLanguage(normalizedPath);
  const symbols = extractSymbolNames(content);

  return {
    repository: `${owner}/${repo}`,
    path: normalizedPath,
    language,
    sizeBytes: data.size,
    keySymbols: symbols,
    preview: content.slice(0, 500),
  };
}

export async function search_code({
  repoUrl,
  query,
  perPage = 10,
}: CodeSearchOptions) {
  const { owner, repo } = parseGithubRepoUrl(repoUrl);

  if (!query.trim()) throw new Error("Search query cannot be empty");

  const { data } = await octokit.rest.search.code({
    q: `${query.trim()} repo:${owner}/${repo}`,
    per_page: Math.min(Math.max(perPage, 1), 100),
    headers: {
      accept: "application/vnd.github.text-match+json",
    },
  });

  return {
    repository: `${owner}/${repo}`,
    query,
    totalCount: data.total_count,
    incompleteResults: data.incomplete_results,
    results: data.items.map((item) => ({
      path: item.path,
      name: item.name,
      url: item.html_url,
      sha: item.sha,
      snippets: item.text_matches?.map((match) => match.fragment) ?? [],
    })),
  };
}