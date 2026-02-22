"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeLogs = analyzeLogs;
// Known error patterns with plain-English explanations and fix suggestions
const ERROR_PATTERNS = [
    // Docker errors
    {
        pattern: /unauthorized.*registry|denied.*requested access|authentication required/i,
        rootCause: 'Docker registry authentication failed',
        suggestion: 'Check your `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are set correctly in repository settings (Settings → Secrets → Actions)',
        severity: 'critical'
    },
    {
        pattern: /manifest.*not found|pull access denied|repository does not exist/i,
        rootCause: 'Docker image or tag not found in registry',
        suggestion: 'Verify the image name and tag exist in your registry. Check for typos in your image reference.',
        severity: 'critical'
    },
    {
        pattern: /no space left on device/i,
        rootCause: 'Runner ran out of disk space',
        suggestion: 'Add a disk cleanup step before your build: use `docker system prune -f` or the `jlumbroso/free-disk-space` action.',
        severity: 'critical'
    },
    {
        pattern: /dockerfile.*not found|cannot find.*dockerfile/i,
        rootCause: 'Dockerfile not found at specified path',
        suggestion: 'Check the `file` or `context` path in your docker build step. Make sure the Dockerfile exists at that location.',
        severity: 'critical'
    },
    // GitHub Actions errors
    {
        pattern: /secret.*not.*set|secrets\.(\w+).*undefined|Input required and not supplied/i,
        rootCause: 'A required secret or input is missing',
        suggestion: 'Go to Settings → Secrets → Actions and add the missing secret. Check the action\'s documentation for required inputs.',
        severity: 'critical'
    },
    {
        pattern: /resource not accessible by integration|403.*github/i,
        rootCause: 'GitHub token lacks required permissions',
        suggestion: 'Add the required permissions to your workflow. Example: `permissions: contents: write` or use a Personal Access Token with broader scopes.',
        severity: 'critical'
    },
    {
        pattern: /timeout|timed out after/i,
        rootCause: 'A step exceeded its timeout limit',
        suggestion: 'Increase the `timeout-minutes` for the step or job. Consider caching dependencies to speed up the pipeline.',
        severity: 'warning'
    },
    // Node.js / npm errors
    {
        pattern: /npm ERR!.*peer dep|ERESOLVE/i,
        rootCause: 'npm dependency conflict detected',
        suggestion: 'Try adding `--legacy-peer-deps` flag to your npm install command, or update conflicting packages.',
        severity: 'critical'
    },
    {
        pattern: /cannot find module|module not found/i,
        rootCause: 'A required Node.js module is missing',
        suggestion: 'Run `npm install` before your build step, or check that all dependencies are listed in `package.json`.',
        severity: 'critical'
    },
    {
        pattern: /EACCES.*permission denied|EPERM/i,
        rootCause: 'File permission error during npm install',
        suggestion: 'Avoid running npm with sudo. Check if you need to set `NODE_PATH` or use a specific Node.js version via `actions/setup-node`.',
        severity: 'critical'
    },
    // Test failures
    {
        pattern: /(\d+) (test|spec|suite)s? failed|FAIL.*\.test\.|Tests Failed/i,
        rootCause: 'One or more tests failed',
        suggestion: 'Check the test output above for specific failing test names. Run the tests locally with the same environment variables to reproduce.',
        severity: 'critical'
    },
    // Build errors
    {
        pattern: /TypeScript.*error|TS\d{4}:/i,
        rootCause: 'TypeScript compilation error',
        suggestion: 'Fix the TypeScript errors shown above. Run `tsc --noEmit` locally to see all errors before pushing.',
        severity: 'critical'
    },
    {
        pattern: /syntax error|SyntaxError/i,
        rootCause: 'Syntax error in code',
        suggestion: 'Check the file and line number shown above for syntax errors. Run a linter locally to catch these before pushing.',
        severity: 'critical'
    },
    // Network errors
    {
        pattern: /connection refused|ECONNREFUSED|network.*unreachable/i,
        rootCause: 'Network connection failed',
        suggestion: 'Check if the target service is running and accessible. For external services, verify the URL and port. Consider adding retry logic.',
        severity: 'critical'
    },
    {
        pattern: /rate limit.*exceeded|API rate limit/i,
        rootCause: 'API rate limit exceeded',
        suggestion: 'You\'ve hit GitHub\'s API rate limit. Use `GITHUB_TOKEN` for authenticated requests (higher limits) or add delays between API calls.',
        severity: 'warning'
    },
    // Kubernetes / Helm
    {
        pattern: /imagepullbackoff|errimagepull/i,
        rootCause: 'Kubernetes cannot pull the Docker image',
        suggestion: 'Check the image name and tag. If using a private registry, ensure the imagePullSecret is configured correctly in your cluster.',
        severity: 'critical'
    },
    {
        pattern: /helm.*failed|Error: UPGRADE FAILED/i,
        rootCause: 'Helm chart deployment failed',
        suggestion: 'Run `helm status <release-name>` and `kubectl describe pod` to get more details. Check if there are resource conflicts.',
        severity: 'critical'
    },
    // Generic fallback
    {
        pattern: /error|failed|fatal/i,
        rootCause: 'An error occurred during pipeline execution',
        suggestion: 'Review the highlighted error lines above for details. Check the step\'s documentation for common issues.',
        severity: 'warning'
    }
];
function analyzeLogs(logs, stepName) {
    const lines = logs.split('\n');
    const errorLines = [];
    // Collect lines that look like errors
    for (const line of lines) {
        if (/error|failed|fatal|exception|FAIL|ERR!/i.test(line) && line.trim().length > 0) {
            errorLines.push(line.trim());
        }
    }
    // Try to match against known patterns
    for (const { pattern, rootCause, suggestion, severity } of ERROR_PATTERNS) {
        for (const line of errorLines) {
            if (pattern.test(line)) {
                return {
                    rootCause,
                    failedStep: stepName || extractFailedStep(lines) || 'Unknown step',
                    suggestion,
                    errorLines: errorLines.slice(0, 10), // top 10 error lines
                    severity
                };
            }
        }
    }
    // Fallback — couldn't match a known pattern
    return {
        rootCause: 'Unknown failure — could not automatically detect root cause',
        failedStep: stepName || extractFailedStep(lines) || 'Unknown step',
        suggestion: 'Review the error lines below carefully. Check the step\'s logs for more context.',
        errorLines: errorLines.slice(0, 10),
        severity: 'warning'
    };
}
function extractFailedStep(lines) {
    for (const line of lines) {
        const match = line.match(/##\[error\].*step[:\s]+(.+)|Run (.+) failed/i);
        if (match)
            return match[1] || match[2];
    }
    return null;
}
