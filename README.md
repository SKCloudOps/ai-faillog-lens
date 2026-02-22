# 🔍 PipelineLens

> Instant CI/CD pipeline failure analysis — no more digging through 500 lines of logs.

[![GitHub Marketplace](https://img.shields.io/badge/GitHub-Marketplace-blue?logo=github)](https://github.com/marketplace/actions/pipeline-lens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

PipelineLens is a GitHub Action that automatically detects the root cause of pipeline failures and posts a clear, actionable summary directly on your PR — so your team spends less time debugging and more time shipping.

---

## 🚀 Quick Start

Add this job to your existing workflow:

```yaml
analyze-failure:
  runs-on: ubuntu-latest
  needs: [your-build-job]
  if: failure()
  permissions:
    actions: read
    pull-requests: write

  steps:
    - uses: your-username/pipeline-lens@v1
      with:
        github-token: ${{ secrets.GITHUB_TOKEN }}
```

That's it. On the next failure, PipelineLens will post this on your PR:

---

## 🔴 PipelineLens — Failure Analysis

> **Job:** `build` · **Severity:** Critical

### 🔍 Root Cause
Docker registry authentication failed

### 📍 Failed Step
`Build and push image`

### 💡 Suggested Fix
Check your `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are set correctly in repository settings (Settings → Secrets → Actions)

---

## ✅ What It Detects

| Category | Examples |
|---|---|
| **Docker** | Auth failures, missing images, disk space |
| **GitHub Actions** | Missing secrets, permission errors, timeouts |
| **Node.js / npm** | Missing modules, peer dep conflicts, permission errors |
| **Tests** | Failed test suites |
| **TypeScript** | Compilation errors |
| **Network** | Connection refused, rate limits |
| **Kubernetes** | ImagePullBackOff, Helm failures |

## ⚙️ Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | ✅ | `${{ github.token }}` | GitHub token for API access |
| `post-comment` | ❌ | `true` | Post analysis as PR comment |
| `post-summary` | ❌ | `true` | Post analysis as job summary |
| `failed-job-name` | ❌ | `` | Analyze a specific job only |

## 📤 Outputs

| Output | Description |
|---|---|
| `root-cause` | Plain-English root cause |
| `failed-step` | The step that caused the failure |
| `suggestion` | Suggested fix |

## 🤝 Contributing

Contributions are welcome! The most impactful way to contribute is to **add new error patterns** in `src/analyzer.ts`. Each pattern needs a regex, a plain-English root cause, and a fix suggestion.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

MIT
