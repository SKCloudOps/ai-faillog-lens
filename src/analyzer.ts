import * as fs from 'fs'
import * as path from 'path'
import * as core from '@actions/core'
import { getAISuggestion } from './ai'

export interface FailureAnalysis {
  rootCause: string
  failedStep: string
  suggestion: string
  errorLines: string[]
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

function loadLocalPatterns(): ErrorPattern[] {
  const localPath = path.join(__dirname, '..', 'patterns.json')
  try {
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, 'utf-8')
      // Cast to unknown first, then to our interface — fixes TS2322
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
    // Cast to unknown first, then to our interface — fixes TS2322
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
    const match = line.match(/##\[error\].*step[:\s]+(.+)|Run (.+) failed/i)
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
  const lines = logs.split('\n')
  const errorLines: string[] = []

  for (const line of lines) {
    if (/error|failed|fatal|exception|FAIL|ERR!/i.test(line) && line.trim().length > 0) {
      errorLines.push(line.trim())
    }
  }

  // Tier 1 — pattern matching
  for (const p of patterns) {
    const regex = new RegExp(p.pattern, p.flags)
    for (const line of errorLines) {
      if (regex.test(line)) {
        core.info(`✅ Matched pattern: ${p.id} (${p.category})`)
        return {
          rootCause: p.rootCause,
          failedStep: stepName || extractFailedStep(lines) || 'Unknown step',
          suggestion: p.suggestion,
          errorLines,
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
        failedStep: stepName || extractFailedStep(lines) || 'Unknown step',
        suggestion: `${aiResult.suggestion} *(AI-generated, confidence: ${aiResult.confidence})*`,
        errorLines,
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
    failedStep: stepName || extractFailedStep(lines) || 'Unknown step',
    suggestion: 'Review the error lines below. Consider adding a custom pattern to patterns.json to handle this error in future runs.',
    errorLines,
    severity: 'warning',
    matchedPattern: 'none',
    category: 'Unknown',
    aiGenerated: false
  }
}