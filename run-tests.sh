#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# LocaLedger Test Runner
#
# Usage:
#   ./run-tests.sh              — run all tests, headless
#   ./run-tests.sh --headed     — run with visible browser window
#   ./run-tests.sh UC-05        — run a single use case by ID
#   ./run-tests.sh UC-00        — run all base UI render tests
#
# Outputs:
#   test-results/results.json           — full Playwright JSON results
#   test-results/failure-report.md      — paste-ready summary for a fixing agent
#   test-results/ui-context/<tab>.html  — #app HTML snapshot per tab per run
# ---------------------------------------------------------------------------

set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

HEADED=""
GREP_ARG=""

for arg in "$@"; do
  case "$arg" in
    --headed) HEADED="HEADED=1" ;;
    UC-*)     GREP_ARG="--grep \"$arg\"" ;;
    *)        GREP_ARG="--grep \"$arg\"" ;;
  esac
done

# ---------------------------------------------------------------------------
# Ensure Playwright + Chromium are available
# ---------------------------------------------------------------------------
if ! npx --no-install playwright --version &>/dev/null 2>&1; then
  echo "📦 Installing Playwright..."
  npm install --save-dev @playwright/test
  npx playwright install chromium
fi

mkdir -p test-results test-results/ui-context test-results/playwright-artifacts

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  LocaLedger Test Suite"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
[ -n "$GREP_ARG" ] && echo "  Filter: $GREP_ARG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ---------------------------------------------------------------------------
# Run Playwright (capture exit code without killing the script)
# ---------------------------------------------------------------------------
set +e
eval "$HEADED npx playwright test $GREP_ARG"
EXIT_CODE=$?
set -e

# ---------------------------------------------------------------------------
# Generate failure-report.md from JSON results
# ---------------------------------------------------------------------------
if [ -f test-results/results.json ]; then
  node - <<'EOF'
const fs   = require('fs');
const path = require('path');

let raw;
try {
  raw = fs.readFileSync('test-results/results.json', 'utf8');
} catch (e) {
  process.exit(0);
}

const results = JSON.parse(raw);
const failed  = [];
const passed  = [];
const skipped = [];

// Flatten nested suite structure into individual test entries
function walk(suites) {
  for (const suite of (suites || [])) {
    for (const spec of (suite.specs || [])) {
      for (const test of (spec.tests || [])) {
        const outcome = test.results?.[0] || {};
        const entry = {
          title:      spec.title,
          file:       path.relative(process.cwd(), spec.file || ''),
          status:     outcome.status,
          duration:   outcome.duration || 0,
          error:      outcome.error?.message || null,
          stderr:     (outcome.stderr || []).join(''),
          attachments: outcome.attachments || [],
        };
        if (outcome.status === 'failed' || outcome.status === 'timedOut') failed.push(entry);
        else if (outcome.status === 'skipped') skipped.push(entry);
        else passed.push(entry);
      }
    }
    // Recurse into nested suites
    walk(suite.suites);
  }
}
walk(results.suites);

const total = passed.length + failed.length + skipped.length;
const lines = [];
const ts    = new Date().toISOString();

lines.push('# LocaLedger Test Results');
lines.push(`> Generated: ${ts}`);
lines.push('');
lines.push(`| Passed | Failed | Skipped | Total |`);
lines.push(`|--------|--------|---------|-------|`);
lines.push(`| ${passed.length} | ${failed.length} | ${skipped.length} | ${total} |`);
lines.push('');

// ---------------------------------------------------------------------------
// UI Context snapshots section
// ---------------------------------------------------------------------------
const uiDir = 'test-results/ui-context';
if (fs.existsSync(uiDir)) {
  const snapshots = fs.readdirSync(uiDir).filter(f => f.endsWith('.html')).sort();
  if (snapshots.length) {
    lines.push('## UI Context Snapshots');
    lines.push('');
    lines.push('Rendered `#app` HTML saved after each tab render. Use these to verify');
    lines.push('selectors and inspect actual DOM structure when fixing tests.');
    lines.push('');
    for (const snap of snapshots) {
      lines.push(`- \`${uiDir}/${snap}\``);
    }
    lines.push('');
  }
}

// ---------------------------------------------------------------------------
// Failures section
// ---------------------------------------------------------------------------
if (failed.length === 0) {
  lines.push('## ✅ All Tests Passed');
} else {
  lines.push('## ❌ Failures');
  lines.push('');
  lines.push('Each block below is ready to paste into a fixing agent.\n');

  for (const f of failed) {
    const ucMatch = f.title.match(/UC-\d+[a-z]?/i);
    const uc = ucMatch ? ucMatch[0].toUpperCase() : 'UNKNOWN';

    lines.push('---');
    lines.push('');
    lines.push(`### ${f.title}`);
    lines.push('');
    lines.push('```');
    lines.push(`USE CASE:   ${uc} — ${f.title}`);
    lines.push(`TEST FILE:  ${f.file}`);
    lines.push(`STATUS:     ${f.status}  (${f.duration}ms)`);
    lines.push('');
    lines.push('ERROR MESSAGE:');
    if (f.error) {
      // Strip ANSI codes from Playwright output
      lines.push(f.error.replace(/\x1B\[[0-9;]*m/g, '').trim());
    } else {
      lines.push('(no error message captured)');
    }
    if (f.stderr && f.stderr.trim()) {
      lines.push('');
      lines.push('STDERR:');
      lines.push(f.stderr.replace(/\x1B\[[0-9;]*m/g, '').trim());
    }
    lines.push('');
    lines.push('WHERE TO LOOK:');
    lines.push(`  • UseCases.md  → full expected behavior for ${uc}`);
    lines.push('  • Context.md   → function signatures and storage shapes');
    lines.push(`  • index.html   → implementation (search function name from Context.md)`);
    lines.push(`  • test-results/ui-context/  → actual rendered HTML at time of failure`);

    // List any screenshot attachments
    const screenshots = f.attachments.filter(a => a.contentType?.startsWith('image'));
    if (screenshots.length) {
      lines.push('');
      lines.push('SCREENSHOTS:');
      for (const s of screenshots) lines.push(`  ${s.path}`);
    }
    lines.push('```');
    lines.push('');
  }
}

// ---------------------------------------------------------------------------
// Passed section
// ---------------------------------------------------------------------------
lines.push('---');
lines.push('');
lines.push('## ✅ Passed Tests');
for (const p of passed) {
  lines.push(`- ${p.title}  _(${p.duration}ms)_`);
}

const reportPath = 'test-results/failure-report.md';
fs.writeFileSync(reportPath, lines.join('\n') + '\n');
console.log(`\nFailure report written → ${reportPath}`);
EOF
fi

# ---------------------------------------------------------------------------
# Final banner
# ---------------------------------------------------------------------------
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $EXIT_CODE -eq 0 ]; then
  echo "  ✅ ALL TESTS PASSED"
else
  echo "  ❌ SOME TESTS FAILED"
  echo ""
  echo "  Failure report:  test-results/failure-report.md"
  echo "  UI snapshots:    test-results/ui-context/"
  echo ""
  echo "  Paste failure-report.md into a fixing agent for full context."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

exit $EXIT_CODE
