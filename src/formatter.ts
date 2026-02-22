import { FailureAnalysis } from './analyzer'

const SEVERITY_EMOJI = {
  critical: '🔴',
  warning: '🟡',
  info: '🔵'
}

const SEVERITY_LABEL = {
  critical: 'Critical',
  warning: 'Warning',
  info: 'Info'
}

export function formatPRComment(analysis: FailureAnalysis, jobName: string, runUrl: string): string {
  const emoji = SEVERITY_EMOJI[analysis.severity]
  const label = SEVERITY_LABEL[analysis.severity]

  const errorBlock = analysis.errorLines.length > 0
    ? `\n<details>\n<summary>📋 Error lines detected (${analysis.errorLines.length})</summary>\n\n\`\`\`\n${analysis.errorLines.join('\n')}\n\`\`\`\n</details>`
    : ''

  return `## ${emoji} PipelineLens — Failure Analysis

> **Job:** \`${jobName}\` · **Severity:** ${label} · [View full logs](${runUrl})

---

### 🔍 Root Cause
${analysis.rootCause}

### 📍 Failed Step
\`${analysis.failedStep}\`

### 💡 Suggested Fix
${analysis.suggestion}
${errorBlock}

---
<sub>🔬 Analyzed by [PipelineLens](https://github.com/your-username/pipeline-lens) · [Report false positive](https://github.com/your-username/pipeline-lens/issues)</sub>`
}

export function formatJobSummary(
  analysis: FailureAnalysis,
  jobName: string,
  runUrl: string,
  steps: { name: string; conclusion: string | null; started_at?: string | null; completed_at?: string | null }[],
  triggeredBy: string,
  branch: string,
  commit: string,
  repo: string
): string {
  const emoji = SEVERITY_EMOJI[analysis.severity]
  const label = SEVERITY_LABEL[analysis.severity]
  const now = new Date().toUTCString()

  // Step breakdown table
  const stepRows = steps.map(step => {
    const icon =
      step.conclusion === 'success' ? '✅' :
      step.conclusion === 'failure' ? '❌' :
      step.conclusion === 'skipped' ? '⏭️' :
      step.conclusion === 'cancelled' ? '🚫' : '⏳'

    const duration = step.started_at && step.completed_at
      ? `${Math.round((new Date(step.completed_at).getTime() - new Date(step.started_at).getTime()) / 1000)}s`
      : '—'

    return `| ${icon} | \`${step.name}\` | ${step.conclusion ?? 'in progress'} | ${duration} |`
  }).join('\n')

  // All error lines — no truncation
  const allErrorLines = analysis.errorLines.length > 0
    ? analysis.errorLines.join('\n')
    : 'No error lines captured'

  return `# ${emoji} PipelineLens — Failure Report

> ${emoji} **Severity:** ${label} &nbsp;|&nbsp; 📋 **Job:** \`${jobName}\` &nbsp;|&nbsp; 🕐 **Time:** ${now}

---

## 📊 Run Information

| Field | Value |
|---|---|
| **Repository** | \`${repo}\` |
| **Branch** | \`${branch}\` |
| **Commit** | \`${commit.substring(0, 7)}\` |
| **Triggered By** | \`${triggeredBy}\` |
| **Full Logs** | [View on GitHub Actions](${runUrl}) |

---

## 🔍 Failure Analysis

| Field | Details |
|---|---|
| **Root Cause** | ${analysis.rootCause} |
| **Failed Step** | \`${analysis.failedStep}\` |
| **Severity** | ${emoji} ${label} |

---

## 💡 Suggested Fix

> ${analysis.suggestion}

---

## 🗂️ Step-by-Step Breakdown

| Status | Step | Result | Duration |
|---|---|---|---|
${stepRows}

---

## 📋 Full Error Log

\`\`\`
${allErrorLines}
\`\`\`

---

## 🛠️ Quick Actions

- 🔗 [View full workflow run](${runUrl})
- 🐛 [Report a false positive](https://github.com/your-username/pipeline-lens/issues)
- 📖 [PipelineLens documentation](https://github.com/your-username/pipeline-lens#readme)

---
<sub>🔬 Analyzed by PipelineLens · ${now}</sub>`
}
