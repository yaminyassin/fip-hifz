# Flag Update Script

This script updates the `flag` field for all participants in the Firestore `participants` collection with base64-encoded flag images.

## What it does

1. **Connects to Firestore** using the same connection logic as `update_values.py`
2. **Retrieves all participants** from the `participants` collection
3. **For each participant:**
   - Gets the `country` field value
   - Normalizes the country name (lowercase, spaces to hyphens)
   - Finds the matching flag PNG file in `/obs/assets/flags/`
   - Converts the flag image to base64 format
   - Updates the participant's `flag` field with the base64 data
4. **Fallback behavior:**
   - If no matching flag is found, uses `_global.png` as default
   - If no country is specified, uses default flag
   - If flag conversion fails, skips the participant

## Usage

```bash
# Navigate to the scripts directory
cd scripts

# Run the script
python update_participant_flags.py
```

## Prerequisites

- Firebase credentials configured (either `GOOGLE_APPLICATION_CREDENTIALS` env var or `google-services-key.json` file)
- Firebase Admin SDK installed (`firebase-admin` package)
- Flag images present in `/obs/assets/flags/` directory

## Country Name Normalization

The script normalizes country names to match flag filenames:

- Converts to lowercase
- Replaces spaces with hyphens
- Example: "United States of America" → "united-states-of-america.png"

## Flag File Structure

Expected flag files in `/obs/assets/flags/`:

- Country-specific flags: `country-name.png`
- Default flag: `_global.png`
- Files starting with `_` are treated as special files (not country flags)

## Output Format

The `flag` field will contain a data URI in the format:

```
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...
```

## Safety Features

- **Confirmation prompt** before making changes
- **Comprehensive logging** of all operations
- **Error handling** for missing files, network issues, etc.
- **Summary report** showing update statistics

## Example Output

```
2025-01-17 10:30:00 - INFO - Processing participant: participant_123
2025-01-17 10:30:00 - INFO - Found matching flag for 'United States': 'united-states-of-america.png'
2025-01-17 10:30:00 - INFO - Successfully updated flag for participant participant_123
...
==================================================
UPDATE SUMMARY
==================================================
Participants updated: 25
Participants with default flag: 3
Participants skipped: 2
Participants with errors: 0
Total processed: 30
```

## Troubleshooting

- **Firebase connection issues**: Ensure credentials are properly configured
- **Missing flag files**: Check that flag images exist in the correct directory
- **Permission errors**: Ensure proper Firestore write permissions
- **Memory issues**: For large datasets, consider batch processing

## Notes

- This script modifies ALL participants in the collection
- Base64 encoding increases the data size significantly
- Consider running during off-peak hours for large datasets
- The script can be run multiple times safely (it will overwrite existing flag data)
