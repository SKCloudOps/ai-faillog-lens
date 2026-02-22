# 🔍 AI FaillogLens

> Instant CI/CD pipeline failure analysis — no more digging through 500 lines of logs.

[![GitHub Marketplace](https://img.shields.io/badge/GitHub-Marketplace-blue?logo=github)](https://github.com/marketplace/actions/pipeline-lens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

PipelineLens is a GitHub Action that automatically detects the root cause of pipeline failures and posts a clear, actionable summary directly on your PR — so your team spends less time debugging and more time shipping.

**No external API keys. No extra cost. Just add one job to your workflow.**

---

## 🚀 Quick Start

Add this job to your existing workflow file:

```yaml
analyze-failure:
  runs-on: ubuntu-latest
  needs: [your-build-job]   # replace with your actual job name
  if: failure()             # only runs when a previous job fails
  permissions:
    actions: read           # read workflow logs
    pull-requests: write    # post PR comment
    models: read            # GitHub Models AI (for unknown errors)

  steps:
    - uses: sathishkpr/ai-faillog-lens@v1
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. `GITHUB_TOKEN` is **automatically available** in every GitHub Actions workflow — no setup, no cost, no external API keys required.

---

## 💬 What It Posts on Your PR

When a pipeline fails, PipelineLens automatically comments on the PR:

```
🔴 PipelineLens — Failure Analysis

Job: `build` · Severity: Critical

🔍 Root Cause
Docker registry authentication failed

📍 Failed Step
`Build and push image`

💡 Suggested Fix
Check your DOCKER_USERNAME and DOCKER_PASSWORD secrets are set
correctly in repository settings (Settings → Secrets → Actions)
```

For direct commits to `main` (no PR), the analysis appears in the **Job Summary** tab of the workflow run instead.

---

## 🧠 How Suggestions Are Generated

PipelineLens uses a **3-tier system** to generate fix suggestions:

```
Tier 1 — Pattern matching (patterns.json)
  Fast, free, works offline. Matches known errors instantly.
  ↓ no match found

Tier 2 — GitHub Models AI (gpt-4o-mini)
  Uses your GITHUB_TOKEN — no extra API key needed.
  Analyzes the actual log lines and generates a contextual suggestion.
  ↓ AI unavailable or disabled

Tier 3 — Generic fallback
  Tells you to review the error lines and suggests adding a
  custom pattern to patterns.json for future runs.
```

---

## 🔑 About GITHUB_TOKEN & Permissions

`GITHUB_TOKEN` is a **short-lived token automatically created by GitHub** at the start of every workflow run. You do not need to create it, pay for it, or manage it.

However, you must explicitly grant the permissions PipelineLens needs:

| Permission | Why It's Needed |
|---|---|
| `actions: read` | Fetch the failed job's logs |
| `pull-requests: write` | Post the analysis comment on the PR |
| `models: read` | Call GitHub Models AI for unknown errors |

Without `models: read`, the AI fallback is automatically skipped and PipelineLens falls back to pattern matching only — the action still works fine.

You can disable AI entirely with `enable-ai: false` if preferred.

---

## ✅ What It Detects

| Category | Examples |
|---|---|
| **Docker** | Auth failures, missing images, disk space, bad Dockerfile path |
| **GitHub Actions** | Missing secrets, permission errors, timeouts |
| **Node.js / npm** | Missing modules, peer dep conflicts, permission errors |
| **Tests** | Failed test suites (Jest, Mocha, etc.) |
| **TypeScript** | Compilation errors |
| **Network** | Connection refused, API rate limits |
| **Kubernetes** | ImagePullBackOff, Helm failures |
| **Unknown** | AI-powered analysis via GitHub Models |

---

## ⚙️ Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | `${{ github.token }}` | Auto-available, no setup needed |
| `post-comment` | ❌ | `true` | Post analysis as PR comment |
| `post-summary` | ❌ | `true` | Post analysis in Job Summary tab |
| `failed-job-name` | ❌ | `` | Analyze a specific job only (analyzes all if not set) |
| `remote-patterns-url` | ❌ | `` | URL to fetch additional community patterns from |
| `enable-ai` | ❌ | `true` | Use GitHub Models AI as fallback for unknown errors |

---

## 📤 Outputs

Use these in later steps to build custom notifications or integrations:

| Output | Description |
|---|---|
| `root-cause` | Plain-English root cause |
| `failed-step` | The step that caused the failure |
| `suggestion` | Suggested fix |
| `matched-pattern` | Pattern ID that matched (or `ai-generated` / `none`) |
| `category` | Category of the failure (Docker, Node.js, etc.) |
| `ai-generated` | `true` if the suggestion was AI-generated |

### Example — Use outputs in a Slack notification

```yaml
- uses: your-username/pipeline-lens@main
  id: lens
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}

- name: Notify Slack
  run: |
    echo "Root cause: ${{ steps.lens.outputs.root-cause }}"
    echo "Fix: ${{ steps.lens.outputs.suggestion }}"
```

---

## 📋 Adding Custom Patterns

PipelineLens loads error patterns from `patterns.json` in the repo root. You can add your own patterns without touching any TypeScript:

```json
{
  "id": "my-custom-error",
  "category": "MyTool",
  "pattern": "my specific error message",
  "flags": "i",
  "rootCause": "Plain English explanation of what went wrong",
  "suggestion": "Specific steps to fix it",
  "severity": "critical",
  "tags": ["mytool", "custom"]
}
```

Custom patterns are matched **before** AI is called — so they're fast, free, and always take priority.

---

## 🤝 Contributing

Contributions are welcome! The easiest way to contribute is to **add new error patterns** to `patterns.json` — no TypeScript knowledge needed, just JSON.

Each pattern needs:
- `id` — unique identifier (e.g. `docker-auth`)
- `category` — group name (e.g. `Docker`, `Node.js`)
- `pattern` — regex string to match against log lines
- `flags` — regex flags (usually `"i"` for case-insensitive)
- `rootCause` — one sentence plain-English explanation
- `suggestion` — 2-3 sentences on how to fix it
- `severity` — `critical`, `warning`, or `info`
- `tags` — array of searchable tags

See [CONTRIBUTING.md](CONTRIBUTING.md) for full details.

---

## 📄 License

MIT
