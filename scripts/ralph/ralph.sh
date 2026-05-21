#!/bin/bash
# Ralph - Autonomous AI agent loop (Monthly Calendar App)
set -e

TOOL="claude"
MAX_ITERATIONS=10

while [[ $# -gt 0 ]]; do
  case $1 in
    --tool) TOOL="$2"; shift 2 ;;
    --tool=*) TOOL="${1#*=}"; shift ;;
    *) [[ "$1" =~ ^[0-9]+$ ]] && MAX_ITERATIONS="$1"; shift ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"

[ ! -f "$PROGRESS_FILE" ] && echo "# Ralph Progress Log" > "$PROGRESS_FILE"

echo "Starting Ralph - Tool: $TOOL - Max iterations: $MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "==============================================================="
  echo "  Ralph Iteration $i of $MAX_ITERATIONS ($TOOL)"
  echo "==============================================================="

  # Stop early if all stories already pass
  REMAINING=$(jq '[.userStories[] | select(.passes==false)] | length' "$PRD_FILE" 2>/dev/null || echo "?")
  echo "  Remaining stories: $REMAINING"
  if [ "$REMAINING" = "0" ]; then
    echo "All stories pass. Done."
    exit 0
  fi

  OUTPUT=$(claude --dangerously-skip-permissions --print < "$SCRIPT_DIR/CLAUDE.md" 2>&1 | tee /dev/stderr) || true

  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Ralph completed all tasks!"
    exit 0
  fi

  sleep 2
done

echo "Ralph reached max iterations without completing all tasks."
exit 1
