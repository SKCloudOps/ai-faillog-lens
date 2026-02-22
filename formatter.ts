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
    ? `\n<details>\n<summary>📋 Error lines detected</summary>\n\n\`\`\`\n${analysis.errorLines.join('\n')}\n\`\`\`\n</details>`
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

export function formatJobSummary(analysis: FailureAnalysis, jobName: string, runUrl: string): string {
  const emoji = SEVERITY_EMOJI[analysis.severity]

  const errorRows = analysis.errorLines
    .slice(0, 5)
    .map(line => `| \`${line.substring(0, 100)}\` |`)
    .join('\n')

  return `# ${emoji} PipelineLens Failure Report

| Field | Details |
|---|---|
| **Job** | \`${jobName}\` |
| **Root Cause** | ${analysis.rootCause} |
| **Failed Step** | \`${analysis.failedStep}\` |
| **Full Logs** | [View on GitHub](${runUrl}) |

## 💡 Suggested Fix
${analysis.suggestion}

${analysis.errorLines.length > 0 ? `## 📋 Top Error Lines\n| Error |\n|---|\n${errorRows}` : ''}

---
*Analyzed by [PipelineLens](https://github.com/your-username/pipeline-lens)*`
}
