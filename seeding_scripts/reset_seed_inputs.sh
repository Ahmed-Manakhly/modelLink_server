#!/bin/bash

cd "$(dirname "$0")"

echo "🔄 Resetting data_input.json files from references..."
echo "------------------------------------------------------"

# Loop through the specific flow directories (00 through 06)
for dir in 00_* 01_* 02_* 03_* 04_* 05_* 06_*; do
  if [ -d "$dir" ]; then
    if [ -f "$dir/data_reference.json" ]; then
      # Copy reference over the input file, replacing whatever was there
      cp "$dir/data_reference.json" "$dir/data_input.json"
      echo "✅ Reset: $dir/data_input.json"
    else
      echo "⚠️  Skipped: $dir (No data_reference.json found)"
    fi
  fi
done

echo "------------------------------------------------------"
echo "🎉 All specified input files have been refreshed from references."
