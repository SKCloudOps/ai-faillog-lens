#!/usr/bin/env node
/**
 * AI FaillogLens — Pattern Test Runner
 * 
 * Validates every pattern in patterns.json against its test cases.
 * Run: node scripts/test-patterns.js
 * Or:  npm run test:patterns
 */

const fs = require('fs')
const path = require('path')

// ─────────────────────────────────────────────
// LOAD PATTERNS
// ─────────────────────────────────────────────

const patternsPath = path.join(__dirname, '..', 'patterns.json')

if (!fs.existsSync(patternsPath)) {
  console.error('❌ patterns.json not found at', patternsPath)
  process.exit(1)
}

const patternsFile = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'))
const { patterns, settings } = patternsFile

console.log(`\n🔍 AI FaillogLens — Pattern Validator`)
console.log(`📋 patterns.json v${patternsFile.version}`)
console.log(`📊 Testing ${patterns.length} patterns...\n`)

// ─────────────────────────────────────────────
// VALIDATION CHECKS
// ─────────────────────────────────────────────

let passed = 0
let failed = 0
let warnings = 0
const errors = []

// ── Check 1: Required fields ──
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📋 Check 1: Required fields')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const REQUIRED_FIELDS = ['id', 'category', 'priority', 'pattern', 'flags', 'rootCause', 'suggestion', 'severity', 'tags']
const ids = new Set()

for (const p of patterns) {
  // Check required fields
  for (const field of REQUIRED_FIELDS) {
    if (p[field] === undefined || p[field] === null || p[field] === '') {
      errors.push(`❌ [${p.id || 'UNKNOWN'}] Missing required field: '${field}'`)
      failed++
    }
  }

  // Check duplicate IDs
  if (ids.has(p.id)) {
    errors.push(`❌ [${p.id}] Duplicate ID found`)
    failed++
  }
  ids.add(p.id)

  // Check valid severity
  if (!['critical', 'warning', 'info'].includes(p.severity)) {
    errors.push(`❌ [${p.id}] Invalid severity: '${p.severity}'. Must be critical, warning or info.`)
    failed++
  }

  // Check valid flags
  if (!/^[gimsuy]*$/.test(p.flags)) {
    errors.push(`❌ [${p.id}] Invalid regex flags: '${p.flags}'`)
    failed++
  }

  // Check priority range
  if (p.priority < 1 || p.priority > 100) {
    errors.push(`⚠️  [${p.id}] Priority ${p.priority} is outside recommended range 1-100`)
    warnings++
  }

  // Warn if no tests
  if (!p.tests || !p.tests.shouldMatch || p.tests.shouldMatch.length === 0) {
    errors.push(`⚠️  [${p.id}] No test cases defined — add tests.shouldMatch and tests.shouldNotMatch`)
    warnings++
  }

  passed++
}

console.log(`✅ ${passed} patterns have valid structure`)
if (warnings > 0) console.log(`⚠️  ${warnings} warnings`)
if (failed > 0) console.log(`❌ ${failed} failures`)

// ── Check 2: Regex validity ──
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📋 Check 2: Regex validity')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

let regexPassed = 0
let regexFailed = 0

for (const p of patterns) {
  try {
    new RegExp(p.pattern, p.flags)
    regexPassed++
  } catch (err) {
    errors.push(`❌ [${p.id}] Invalid regex: ${err.message}`)
    regexFailed++
  }
}

console.log(`✅ ${regexPassed} valid regex patterns`)
if (regexFailed > 0) console.log(`❌ ${regexFailed} invalid regex patterns`)

// ── Check 3: Test cases ──
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📋 Check 3: Pattern test cases')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

let testsPassed = 0
let testsFailed = 0
let testsSkipped = 0

for (const p of patterns) {
  if (!p.tests) {
    testsSkipped++
    continue
  }

  let regex
  try {
    regex = new RegExp(p.pattern, p.flags)
  } catch {
    continue
  }

  // Test shouldMatch cases
  if (p.tests.shouldMatch) {
    for (const testCase of p.tests.shouldMatch) {
      if (regex.test(testCase)) {
        testsPassed++
      } else {
        errors.push(`❌ [${p.id}] shouldMatch FAILED: "${testCase}"`)
        testsFailed++
      }
    }
  }

  // Test shouldNotMatch cases
  if (p.tests.shouldNotMatch) {
    for (const testCase of p.tests.shouldNotMatch) {
      if (!regex.test(testCase)) {
        testsPassed++
      } else {
        errors.push(`❌ [${p.id}] shouldNotMatch FAILED (matched but should not): "${testCase}"`)
        testsFailed++
      }
    }
  }
}

console.log(`✅ ${testsPassed} test cases passed`)
if (testsFailed > 0) console.log(`❌ ${testsFailed} test cases failed`)
if (testsSkipped > 0) console.log(`⏭️  ${testsSkipped} patterns skipped (no tests defined)`)

// ── Check 4: Category priority coverage ──
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📋 Check 4: Category coverage')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

const categoriesInPatterns = new Set(patterns.map(p => p.category))
const categoriesInPriority = new Set(settings?.categoryPriority || [])

// Check all pattern categories are in priority list
for (const cat of categoriesInPatterns) {
  if (!categoriesInPriority.has(cat)) {
    errors.push(`⚠️  Category '${cat}' is used in patterns but not in settings.categoryPriority`)
    warnings++
  }
}

// Show category breakdown
console.log('\n📊 Patterns per category:')
const catCounts = {}
for (const p of patterns) {
  catCounts[p.category] = (catCounts[p.category] || 0) + 1
}
for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${cat.padEnd(25)} ${count} pattern${count !== 1 ? 's' : ''}`)
}

// ── Check 5: Conflict detection ──
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📋 Check 5: Conflict detection')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

let conflicts = 0
for (let i = 0; i < patterns.length; i++) {
  for (let j = i + 1; j < patterns.length; j++) {
    const a = patterns[i]
    const b = patterns[j]
    if (!a.tests?.shouldMatch || !b.tests) continue

    let regexB
    try { regexB = new RegExp(b.pattern, b.flags) } catch { continue }

    for (const testCase of a.tests.shouldMatch) {
      if (regexB.test(testCase)) {
        errors.push(`⚠️  [${a.id}] and [${b.id}] both match: "${testCase}" — check priority ordering`)
        conflicts++
        warnings++
      }
    }
  }
}

if (conflicts === 0) {
  console.log('✅ No conflicts detected between patterns')
} else {
  console.log(`⚠️  ${conflicts} potential conflicts found — review priority ordering`)
}

// ─────────────────────────────────────────────
// FINAL REPORT
// ─────────────────────────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('📊 Final Report')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

if (errors.length > 0) {
  console.log('\nIssues found:')
  for (const err of errors) {
    console.log(' ', err)
  }
}

const totalFailed = failed + regexFailed + testsFailed
const totalPassed = passed + regexPassed + testsPassed

console.log(`\n✅ Passed: ${totalPassed}`)
console.log(`⚠️  Warnings: ${warnings}`)
console.log(`❌ Failed: ${totalFailed}`)

if (totalFailed > 0) {
  console.log('\n❌ Pattern validation FAILED — fix errors before merging\n')
  process.exit(1)
} else if (warnings > 0) {
  console.log('\n⚠️  Pattern validation passed with warnings\n')
  process.exit(0)
} else {
  console.log('\n✅ All pattern validations passed!\n')
  process.exit(0)
}
