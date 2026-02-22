"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPatterns = loadPatterns;
exports.analyzeLogs = analyzeLogs;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const core = __importStar(require("@actions/core"));
const ai_1 = require("./ai");
function loadLocalPatterns() {
    const localPath = path.join(__dirname, '..', 'patterns.json');
    try {
        if (fs.existsSync(localPath)) {
            const raw = fs.readFileSync(localPath, 'utf-8');
            // Cast to unknown first, then to our interface — fixes TS2322
            const parsed = JSON.parse(raw);
            core.info(`✅ Loaded ${parsed.patterns.length} patterns from patterns.json (v${parsed.version})`);
            return parsed.patterns;
        }
    }
    catch (err) {
        core.warning(`⚠️ Could not load local patterns.json: ${err}`);
    }
    return [];
}
async function fetchRemotePatterns(remoteUrl) {
    try {
        core.info(`🌐 Fetching remote patterns from ${remoteUrl}...`);
        const response = await fetch(remoteUrl, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) {
            core.warning(`⚠️ Remote patterns fetch failed: HTTP ${response.status}`);
            return [];
        }
        // Cast to unknown first, then to our interface — fixes TS2322
        const parsed = await response.json();
        core.info(`✅ Loaded ${parsed.patterns.length} remote patterns (v${parsed.version})`);
        return parsed.patterns;
    }
    catch (err) {
        core.warning(`⚠️ Could not fetch remote patterns: ${err}`);
        return [];
    }
}
function mergePatterns(local, remote) {
    const localIds = new Set(local.map(p => p.id));
    const remoteOnly = remote.filter(p => !localIds.has(p.id));
    const merged = [...local, ...remoteOnly];
    core.info(`📋 Using ${merged.length} total patterns (${local.length} local + ${remoteOnly.length} remote)`);
    return merged;
}
async function loadPatterns(remoteUrl) {
    const local = loadLocalPatterns();
    if (remoteUrl) {
        const remote = await fetchRemotePatterns(remoteUrl);
        return mergePatterns(local, remote);
    }
    return local;
}
function extractFailedStep(lines) {
    for (const line of lines) {
        const match = line.match(/##\[error\].*step[:\s]+(.+)|Run (.+) failed/i);
        if (match)
            return match[1] || match[2];
    }
    return null;
}
async function analyzeLogs(logs, patterns, token, useAI, stepName) {
    const lines = logs.split('\n');
    const errorLines = [];
    for (const line of lines) {
        if (/error|failed|fatal|exception|FAIL|ERR!/i.test(line) && line.trim().length > 0) {
            errorLines.push(line.trim());
        }
    }
    // Tier 1 — pattern matching
    for (const p of patterns) {
        const regex = new RegExp(p.pattern, p.flags);
        for (const line of errorLines) {
            if (regex.test(line)) {
                core.info(`✅ Matched pattern: ${p.id} (${p.category})`);
                return {
                    rootCause: p.rootCause,
                    failedStep: stepName || extractFailedStep(lines) || 'Unknown step',
                    suggestion: p.suggestion,
                    errorLines,
                    severity: p.severity,
                    matchedPattern: p.id,
                    category: p.category,
                    aiGenerated: false
                };
            }
        }
    }
    // Tier 2 — GitHub Models AI fallback
    if (useAI && errorLines.length > 0) {
        core.info('⚠️ No pattern matched — trying GitHub Models AI fallback...');
        const aiResult = await (0, ai_1.getAISuggestion)(errorLines, token);
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
            };
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
    };
}
