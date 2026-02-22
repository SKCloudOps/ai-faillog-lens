import * as core from '@actions/core'
import * as github from '@actions/github'
import { loadPatterns, analyzeLogs } from './analyzer'
import { formatPRComment, formatJobSummary } from './formatter'

async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true })
    const postComment = core.getInput('post-comment') === 'true'
    const postSummary = core.getInput('post-summary') === 'true'
    const failedJobName = core.getInput('failed-job-name')
    const remotePatternsUrl = core.getInput('remote-patterns-url')
    const enableAI = core.getInput('enable-ai') === 'true'

    const octokit = github.getOctokit(token)
    const context = github.context
    const { owner, repo } = context.repo

    core.info('🔍 PipelineLens: Starting failure analysis...')
    core.info(`🤖 AI fallback: ${enableAI ? 'enabled (GitHub Models)' : 'disabled'}`)

    // Load patterns — local + optional remote
    const patterns = await loadPatterns(remotePatternsUrl || undefined)

    const runId = context.runId
    const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`
    const branch = context.ref.replace('refs/heads/', '')
    const commit = context.sha
    const triggeredBy = context.actor
    const repoFullName = `${owner}/${repo}`

    const { data: jobsData } = await octokit.rest.actions.listJobsForWorkflowRun({
      owner, repo, run_id: runId
    })

    const failedJobs = jobsData.jobs.filter(job => {
      const isFailed = job.conclusion === 'failure'
      if (failedJobName) return isFailed && job.name === failedJobName
      return isFailed
    })

    if (failedJobs.length === 0) {
      core.info('✅ No failed jobs found. Nothing to analyze.')
      return
    }

    core.info(`Found ${failedJobs.length} failed job(s). Analyzing...`)

    for (const job of failedJobs) {
      core.info(`📋 Analyzing job: ${job.name}`)

      let logs = ''
      try {
        const logsResponse = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
          owner, repo, job_id: job.id
        })
        logs = logsResponse.data as unknown as string
      } catch (err) {
        core.warning(`Could not fetch logs for job ${job.name}: ${err}`)
        logs = job.steps
          ?.filter(s => s.conclusion === 'failure')
          .map(s => `Step failed: ${s.name}`)
          .join('\n') || ''
      }

      const failedStep = job.steps?.find(s => s.conclusion === 'failure')?.name

      // Analyze — pattern match first, AI fallback if enabled and no match
      const analysis = await analyzeLogs(logs, patterns, token, enableAI, failedStep)

      core.info(`🔍 Root cause: ${analysis.rootCause}`)
      core.info(`📦 Category: ${analysis.category}`)
      core.info(`🎯 Matched pattern: ${analysis.matchedPattern}`)
      core.info(`🤖 AI generated: ${analysis.aiGenerated}`)

      // Set outputs
      core.setOutput('root-cause', analysis.rootCause)
      core.setOutput('failed-step', analysis.failedStep)
      core.setOutput('suggestion', analysis.suggestion)
      core.setOutput('matched-pattern', analysis.matchedPattern)
      core.setOutput('category', analysis.category)
      core.setOutput('ai-generated', String(analysis.aiGenerated))

      // Post job summary
      if (postSummary) {
        const summary = formatJobSummary(
          analysis, job.name, runUrl,
          job.steps ?? [], triggeredBy, branch, commit, repoFullName
        )
        await core.summary.addRaw(summary).write()
        core.info('📊 Job summary posted.')
      }

      // Post PR comment
      if (postComment && context.payload.pull_request) {
        const prNumber = context.payload.pull_request.number
        const comment = formatPRComment(analysis, job.name, runUrl)

        const { data: comments } = await octokit.rest.issues.listComments({
          owner, repo, issue_number: prNumber
        })

        const existingComment = comments.find(c =>
          c.body?.includes('PipelineLens — Failure Analysis') &&
          c.body?.includes(job.name)
        )

        if (existingComment) {
          await octokit.rest.issues.updateComment({
            owner, repo, comment_id: existingComment.id, body: comment
          })
          core.info('💬 Updated existing PR comment.')
        } else {
          await octokit.rest.issues.createComment({
            owner, repo, issue_number: prNumber, body: comment
          })
          core.info('💬 Posted PR comment.')
        }
      }
    }

    core.info('✅ PipelineLens analysis complete.')
  } catch (error) {
    core.setFailed(`PipelineLens failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

run()
