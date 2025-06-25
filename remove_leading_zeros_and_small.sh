#!/bin/bash

# Script to remove leading zeros and "_small" string from filenames
# Usage: ./remove_leading_zeros_and_small.sh [directory_path]

# Default directory is "small" relative to script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DIR="$SCRIPT_DIR/small"

# Use provided directory or default
TARGET_DIR="${1:-$DEFAULT_DIR}"

# Check if directory exists
if [[ ! -d "$TARGET_DIR" ]]; then
    echo "Error: Directory '$TARGET_DIR' does not exist!"
    exit 1
fi

echo "Processing files in: $TARGET_DIR"
echo "----------------------------------------"

# Counter for renamed files
renamed_count=0

# Change to target directory
cd "$TARGET_DIR" || exit 1

# Process files matching the pattern *_small.*
for file in *_small.*; do
    # Skip if no matching files found
    [[ ! -f "$file" ]] && continue
    
    # Extract parts using parameter expansion
    if [[ $file =~ ^([0-9]+)_small\.(.+)$ ]]; then
        # Get the number part and extension
        number_part="${BASH_REMATCH[1]}"
        extension="${BASH_REMATCH[2]}"
        
        # Remove leading zeros by converting to decimal and back
        number_no_zeros=$((10#$number_part))
        
        # Create new filename
        new_filename="${number_no_zeros}.${extension}"
        
        # Check if target file already exists
        if [[ -f "$new_filename" ]]; then
            echo "Warning: $new_filename already exists. Skipping $file"
            continue
        fi
        
        # Rename the file
        if mv "$file" "$new_filename"; then
            echo "Renamed: $file -> $new_filename"
            ((renamed_count++))
        else
            echo "Error: Failed to rename $file"
        fi
    else
        echo "Skipped: $file (doesn't match expected pattern)"
    fi
done

echo "----------------------------------------"
echo "Total files renamed: $renamed_count" 