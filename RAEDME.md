# GitHub Explorer MCP Server

A Model Context Protocol (MCP) server that provides repository analysis, file tree mapping, code search, and tech stack detection tools using the GitHub REST API.

---

## Features

- **Repository Structure Analysis**: Quick inspection of top-level directories and contents.
- **Recursive File Tree Mapping**: Fetches the complete file structure using the Git Trees API.
- **Heuristic Tech Stack Detection**: Detects languages, frameworks, ORMs, and CI/CD tools from file paths and configurations.
- **Single-File Symbol Extraction**: Pulls file contents and extracts exported classes, functions, and variables via regex analysis.
- **Targeted Code Search**: Scoped code search within the repository with matching code snippets.

---

## Tools

| Tool Name | Parameters | Description |
|---|---|---|
| `analyze_repository` | `repo_url` (string) | Lists top-level directory items and their types. |
| `get_repository_map` | `repo_url` (string) | Returns the recursive Git tree for the default branch. |
| `detect_tech_stack` | `repo_url` (string) | Heuristically detects languages, frameworks, and tools. |
| `explain_file` | `repo_url` (string), `file_path` (string) | Fetches file metadata, language, and extracted symbols. |
| `search_code` | `repo_url` (string), `query` (string), `per_page` (number, optional) | Searches repository code and returns file snippets. |

---

