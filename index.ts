import * as core from '@actions/core'
import * as github from '@actions/github'
import { analyzeLogs } from './analyzer'
import { formatPRComment, formatJobSummary } from './formatter'

async function run(): Promise<void> {
  try {
    // Get inputs
    const token = core.getInput('github-token', { required: true })
    const postComment = core.getInput('post-comment') === 'true'
    const postSummary = core.getInput('post-summary') === 'true'
    const failedJobName = core.getInput('failed-job-name')

    const octokit = github.getOctokit(token)
    const context = github.context
    const { owner, repo } = context.repo

    core.info('🔍 PipelineLens: Starting failure analysis...')

    // Get the current workflow run
    const runId = context.runId
    const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`

    // Fetch jobs for this run
    const { data: jobsData } = await octokit.rest.actions.listJobsForWorkflowRun({
      owner,
      repo,
      run_id: runId
    })

    // Find failed jobs
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

      // Fetch logs for the failed job
      let logs = ''
      try {
        const logsResponse = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
          owner,
          repo,
          job_id: job.id
        })
        logs = logsResponse.data as unknown as string
      } catch (err) {
        core.warning(`Could not fetch logs for job ${job.name}: ${err}`)
        logs = job.steps
          ?.filter(s => s.conclusion === 'failure')
          .map(s => `Step failed: ${s.name}`)
          .join('\n') || ''
      }

      // Find the failed step name
      const failedStep = job.steps?.find(s => s.conclusion === 'failure')?.name

      // Analyze the logs
      const analysis = analyzeLogs(logs, failedStep)

      core.info(`🔍 Root cause: ${analysis.rootCause}`)
      core.info(`💡 Suggestion: ${analysis.suggestion}`)

      // Set outputs
      core.setOutput('root-cause', analysis.rootCause)
      core.setOutput('failed-step', analysis.failedStep)
      core.setOutput('suggestion', analysis.suggestion)

      // Post job summary
      if (postSummary) {
        const summary = formatJobSummary(analysis, job.name, runUrl)
        await core.summary.addRaw(summary).write()
        core.info('📊 Job summary posted.')
      }

      // Post PR comment if this is a pull request
      if (postComment && context.payload.pull_request) {
        const prNumber = context.payload.pull_request.number
        const comment = formatPRComment(analysis, job.name, runUrl)

        // Check if we already commented (avoid duplicates)
        const { data: comments } = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: prNumber
        })

        const existingComment = comments.find(c =>
          c.body?.includes('PipelineLens — Failure Analysis') &&
          c.body?.includes(job.name)
        )

        if (existingComment) {
          // Update existing comment
          await octokit.rest.issues.updateComment({
            owner,
            repo,
            comment_id: existingComment.id,
            body: comment
          })
          core.info('💬 Updated existing PR comment.')
        } else {
          // Create new comment
          await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: prNumber,
            body: comment
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
