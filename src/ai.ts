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

export async function getAISuggestion(
  errorLines: string[],
  token: string
): Promise<AISuggestion | null> {
  try {
    core.info('🤖 No pattern matched — calling GitHub Models AI for analysis...')

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
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      const errorText = await response.text()
      core.warning(`⚠️ GitHub Models API returned ${response.status}: ${errorText}`)
      return null
    }

    // Cast to unknown first, then to our interface — fixes TS2322
    const data = await response.json() as unknown as GitHubModelsResponse
    const content = data.choices?.[0]?.message?.content?.trim()

    if (!content) {
      core.warning('⚠️ GitHub Models returned empty response')
      return null
    }

    const clean = content.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean) as AISuggestion

    core.info(`🤖 AI analysis complete — confidence: ${parsed.confidence}`)
    return parsed

  } catch (err) {
    core.warning(`⚠️ GitHub Models AI fallback failed: ${err}`)
    return null
  }
}