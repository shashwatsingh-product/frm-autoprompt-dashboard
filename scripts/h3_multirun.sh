#!/bin/bash
# H3 Non-Determinism Multi-Run Launcher
# Runs validation N times sequentially (runs 2-10, assumes run 1 is already done)

IDS_FILE="/tmp/gemini25_matched_ids.txt"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/h3_rerun_validation.py"
DELAY=0.05
START_RUN=${1:-2}
END_RUN=${2:-10}

echo "============================================"
echo "H3 Multi-Run Launcher: runs $START_RUN to $END_RUN"
echo "============================================"
echo ""

for RUN_ID in $(seq $START_RUN $END_RUN); do
    echo "$(date '+%Y-%m-%d %H:%M:%S') — Starting Run $RUN_ID / $END_RUN"
    python3 "$SCRIPT" --ids-file "$IDS_FILE" --delay "$DELAY" --run-id "$RUN_ID"
    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
        echo "Run $RUN_ID failed with exit code $EXIT_CODE"
        exit $EXIT_CODE
    fi
    echo ""
    echo "$(date '+%Y-%m-%d %H:%M:%S') — Run $RUN_ID complete"
    echo "---"
    echo ""
done

echo "============================================"
echo "All runs complete!"
echo "============================================"
