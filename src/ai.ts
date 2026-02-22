import * as core from '@actions/core'

interface GitHubModelsResponse {
  choices: {
    message: {
      role: string
      content: string
    }
  }[]
}

export interface AISuggestion {
  rootCause: string
  suggestion: string
  confidence: 'high' | 'medium' | 'low'
}

// Call GitHub Models API using the existing GITHUB_TOKEN — no extra API key needed
export async function getAISuggestion(
  errorLines: string[],
  token: string
): Promise<AISuggestion | null> {
  try {
    core.info('🤖 No pattern matched — calling GitHub Models AI for analysis...')

    // Truncate logs to avoid token limits — send top 50 error lines only
    const logSample = errorLines.slice(0, 50).join('\n')

    const prompt = `You are a CI/CD pipeline expert. Analyze the following pipeline failure log lines and provide:
1. A plain-English root cause (1 sentence, no jargon)
2. A specific, actionable fix suggestion (2-3 sentences max)
3. A confidence level: high, medium, or low

Respond ONLY in this JSON format, nothing else:
{
  "rootCause": "...",
  "suggestion": "...",
  "confidence": "high|medium|low"
}

Pipeline failure log:
\`\`\`
${logSample}
\`\`\``

    const response = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // fast, cheap, good enough for log analysis
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.2 // low temp for consistent, factual responses
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    if (!response.ok) {
      const errorText = await response.text()
      core.warning(`⚠️ GitHub Models API returned ${response.status}: ${errorText}`)
      return null
    }

    const data: GitHubModelsResponse = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      core.warning('⚠️ GitHub Models returned empty response')
      return null
    }

    // Strip markdown code fences if present
    const clean = content.replace(/```json|```/g, '').trim()
    const parsed: AISuggestion = JSON.parse(clean)

    core.info(`🤖 AI analysis complete — confidence: ${parsed.confidence}`)
    return parsed

  } catch (err) {
    core.warning(`⚠️ GitHub Models AI fallback failed (using static fallback): ${err}`)
    return null
  }
}
