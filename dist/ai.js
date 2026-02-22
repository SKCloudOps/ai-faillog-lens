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
exports.getAISuggestion = getAISuggestion;
const core = __importStar(require("@actions/core"));
async function getAISuggestion(errorLines, token) {
    try {
        core.info('🤖 No pattern matched — calling GitHub Models AI for analysis...');
        const logSample = errorLines.slice(0, 50).join('\n');
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
\`\`\``;
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
        });
        if (!response.ok) {
            const errorText = await response.text();
            core.warning(`⚠️ GitHub Models API returned ${response.status}: ${errorText}`);
            return null;
        }
        // Cast to unknown first, then to our interface — fixes TS2322
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (!content) {
            core.warning('⚠️ GitHub Models returned empty response');
            return null;
        }
        const clean = content.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        core.info(`🤖 AI analysis complete — confidence: ${parsed.confidence}`);
        return parsed;
    }
    catch (err) {
        core.warning(`⚠️ GitHub Models AI fallback failed: ${err}`);
        return null;
    }
}
