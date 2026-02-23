import * as fs from 'fs'
import * as path from 'path'
import * as core from '@actions/core'
import { getAISuggestion } from './ai'

export interface FailureAnalysis {
  rootCause: string
  failedStep: string
  suggestion: string
  errorLines: string[]
  exactMatchLine: string     // the exact line that triggered the pattern
  exactMatchLineNumber: number  // line number in original log
  totalLines: number         // total lines in log
  severity: 'critical' | 'warning' | 'info'
  matchedPattern: string
  category: string
  aiGenerated: boolean
}

interface ErrorPattern {
  id: string
  category: string
  pattern: string
  flags: string
  rootCause: string
  suggestion: string
  severity: 'critical' | 'warning' | 'info'
  tags: string[]
}

interface PatternsFile {
  version: string
  patterns: ErrorPattern[]
}

// Strip GitHub Actions log timestamps and ANSI color codes
function cleanLine(raw: string): string {
  return raw
    .replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '') // remove timestamp: 2026-02-22T19:12:50.8020453Z
    .replace(/\x1b\[[0-9;]*[mGKHF]/g, '')            // remove ANSI color codes: \u001b[36;1m
    .replace(/##\[(?:error|warning|debug|group|endgroup)\]/g, '') // remove GHA annotations
    .trim()
}

function loadLocalPatterns(): ErrorPattern[] {
  const localPath = path.join(__dirname, '..', 'patterns.json')
  try {
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown as PatternsFile
      core.info(`✅ Loaded ${parsed.patterns.length} patterns from patterns.json (v${parsed.version})`)
      return parsed.patterns
    }
  } catch (err) {
    core.warning(`⚠️ Could not load local patterns.json: ${err}`)
  }
  return []
}

async function fetchRemotePatterns(remoteUrl: string): Promise<ErrorPattern[]> {
  try {
    core.info(`🌐 Fetching remote patterns from ${remoteUrl}...`)
    const response = await fetch(remoteUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    })
    if (!response.ok) {
      core.warning(`⚠️ Remote patterns fetch failed: HTTP ${response.status}`)
      return []
    }
    const parsed = await response.json() as unknown as PatternsFile
    core.info(`✅ Loaded ${parsed.patterns.length} remote patterns (v${parsed.version})`)
    return parsed.patterns
  } catch (err) {
    core.warning(`⚠️ Could not fetch remote patterns: ${err}`)
    return []
  }
}

function mergePatterns(local: ErrorPattern[], remote: ErrorPattern[]): ErrorPattern[] {
  const localIds = new Set(local.map(p => p.id))
  const remoteOnly = remote.filter(p => !localIds.has(p.id))
  const merged = [...local, ...remoteOnly]
  core.info(`📋 Using ${merged.length} total patterns (${local.length} local + ${remoteOnly.length} remote)`)
  return merged
}

export async function loadPatterns(remoteUrl?: string): Promise<ErrorPattern[]> {
  const local = loadLocalPatterns()
  if (remoteUrl) {
    const remote = await fetchRemotePatterns(remoteUrl)
    return mergePatterns(local, remote)
  }
  return local
}

function extractFailedStep(lines: string[]): string | null {
  for (const line of lines) {
    const clean = cleanLine(line)
    const match = clean.match(/##\[error\].*step[:\s]+(.+)|Run (.+) failed/i)
    if (match) return match[1] || match[2]
  }
  return null
}

export async function analyzeLogs(
  logs: string,
  patterns: ErrorPattern[],
  token: string,
  useAI: boolean,
  stepName?: string
): Promise<FailureAnalysis> {
  const rawLines = logs.split('\n')
  const totalLines = rawLines.length
  const errorLines: string[] = []

  // Clean and collect error lines with their original line numbers
  const cleanedLines: { cleaned: string; lineNumber: number }[] = rawLines.map((raw, i) => ({
    cleaned: cleanLine(raw),
    lineNumber: i + 1
  }))

  // Collect lines that look like errors (after cleaning)
  for (const { cleaned } of cleanedLines) {
    if (/error|failed|fatal|exception|FAIL|ERR!/i.test(cleaned) && cleaned.length > 0) {
      errorLines.push(cleaned)
    }
  }

  core.info(`📋 Scanned ${totalLines} log lines, found ${errorLines.length} error lines`)

  // Tier 1 — pattern matching on cleaned lines
  for (const p of patterns) {
    const regex = new RegExp(p.pattern, p.flags)
    for (const { cleaned, lineNumber } of cleanedLines) {
      if (cleaned.length === 0) continue
      if (regex.test(cleaned)) {
        core.info(`✅ Matched pattern: ${p.id} (${p.category}) at line ${lineNumber}`)
        return {
          rootCause: p.rootCause,
          failedStep: stepName || extractFailedStep(rawLines) || 'Unknown step',
          suggestion: p.suggestion,
          errorLines,
          exactMatchLine: cleaned,
          exactMatchLineNumber: lineNumber,
          totalLines,
          severity: p.severity,
          matchedPattern: p.id,
          category: p.category,
          aiGenerated: false
        }
      }
    }
  }

  // Tier 2 — GitHub Models AI fallback
  if (useAI && errorLines.length > 0) {
    core.info('⚠️ No pattern matched — trying GitHub Models AI fallback...')
    const aiResult = await getAISuggestion(errorLines, token)

    if (aiResult) {
      return {
        rootCause: aiResult.rootCause,
        failedStep: stepName || extractFailedStep(rawLines) || 'Unknown step',
        suggestion: `${aiResult.suggestion} *(AI-generated, confidence: ${aiResult.confidence})*`,
        errorLines,
        exactMatchLine: errorLines[0] || '',
        exactMatchLineNumber: 0,
        totalLines,
        severity: 'warning',
        matchedPattern: 'ai-generated',
        category: 'AI Analysis',
        aiGenerated: true
      }
    }
  }

  // Tier 3 — generic fallback
  return {
    rootCause: 'Unknown failure — could not automatically detect root cause',
    failedStep: stepName || extractFailedStep(rawLines) || 'Unknown step',
    suggestion: 'Review the error lines below. Consider adding a custom pattern to patterns.json to handle this error in future runs.',
    errorLines,
    exactMatchLine: errorLines[0] || '',
    exactMatchLineNumber: 0,
    totalLines,
    severity: 'warning',
    matchedPattern: 'none',
    category: 'Unknown',
    aiGenerated: false
  }
}
