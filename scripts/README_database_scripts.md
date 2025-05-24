# Database Management Scripts

This folder contains Python scripts for managing Firestore collections in the FIP-Hifz application.

## Scripts Overview

1. **`reset_scores.py`** - Resets (deletes all documents from) the scores collection
2. **`reset_participants.py`** - Resets (deletes all documents from) the participants collection
3. **`import_participants_from_csv.py`** - Imports participants from CSV file
4. **`update_participant_flags.py`** - Updates participant flag fields with base64 images

## Prerequisites

- Python 3.7+
- Firebase Admin SDK: `pip install firebase-admin`
- Firebase credentials configured (see Firebase Setup below)

## Firebase Setup

Ensure one of the following is configured:

### Option 1: Environment Variable

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/google-services-key.json"
```

### Option 2: Key File (Recommended)

Place `google-services-key.json` in the project root directory (one level up from `scripts/`).

## Script Details

### 1. Reset Scores Collection

**File:** `reset_scores.py`

Deletes all documents from the `scores` collection.

```bash
cd scripts
python reset_scores.py
```

**Safety Features:**

- Double confirmation required
- Must type 'DELETE' to confirm
- Comprehensive logging
- Batch deletion for performance

**Use Case:** Clear all scoring data to start fresh evaluation

---

### 2. Reset Participants Collection

**File:** `reset_participants.py`

Deletes all documents from the `participants` collection.

```bash
cd scripts
python reset_participants.py
```

**Safety Features:**

- Double confirmation required
- Must type 'DELETE' to confirm
- Comprehensive logging
- Batch deletion for performance

**Use Case:** Clear all participant data before importing new participants

---

### 3. Import Participants from CSV

**File:** `import_participants_from_csv.py`

Reads `pre-selection.csv` and creates participant documents following the Participant model.

```bash
cd scripts
python import_participants_from_csv.py
```

**CSV Format Expected:**

```csv
SLOT SCHEDULE,CATEGORY,🔒_FIRST_AND_LAST_NAME,FIRST NAME,LAST NAME,AGE ON EVENT,FLAG,🔒_PARTICIPANT_PHOTO,🔒_CATEGORY_IMAGE,🔒_FLAG_IMAGE
```

**Participant Document Structure:**

```typescript
{
  name: string,           // From CSV: FIRST NAME + LAST NAME
  age: number,            // From CSV: AGE ON EVENT
  country: string,        // Converted from CSV: 🔒_FLAG_IMAGE
  category: string,       // From CSV: CATEGORY
  scheduled: string,      // From CSV: SLOT SCHEDULE
  school: string,         // Default: "" (fill manually)
  isDone: boolean,        // Default: false
  isActive: boolean,      // Default: false (first participant = true)
  flag: string,           // Default: "" (use flag update script)
  parentsName: string,    // Default: "" (fill manually)
  phoneNum: string,       // Default: "" (fill manually)
  email?: string,         // Default: "" (fill manually)
  photo?: string,         // Default: "" (add later)
  assignedQuestions: [],  // Default: [] (assign later)
  activeQuestion: 0       // Default: 0
}
```

**Features:**

- Automatic participant ID generation from names
- Country name normalization (portugal → Portugal)
- Duplicate prevention (skips existing participants)
- First participant automatically set as active
- Comprehensive error handling and logging

---

### 4. Update Participant Flags

**File:** `update_participant_flags.py`

Updates all participants' flag fields with base64-encoded flag images.

```bash
cd scripts
python update_participant_flags.py
```

**Process:**

1. Gets participant's country field
2. Normalizes country name (e.g., "United States" → "united-states")
3. Finds matching flag PNG in `/obs/assets/flags/`
4. Converts to base64: `data:image/png;base64,iVBORw0...`
5. Updates participant's flag field

**Features:**

- Fallback to `_global.png` for unknown countries
- Comprehensive country mapping
- Base64 data URI format
- Safe overwrite of existing flag data

## Typical Workflow

### Fresh Start (New Event)

1. **Reset existing data:**

   ```bash
   python reset_participants.py
   python reset_scores.py
   ```

2. **Import participants:**

   ```bash
   python import_participants_from_csv.py
   ```

3. **Update flags:**

   ```bash
   python update_participant_flags.py
   ```

4. **Manual steps:**
   - Update missing participant details (school, parents, phone)
   - Assign questions to participants
   - Set up jury members

### Data Updates Only

```bash
# Just update flags after changing flag images
python update_participant_flags.py

# Just import new participants (skips existing)
python import_participants_from_csv.py
```

## Safety Features

All scripts include:

- **Confirmation prompts** before destructive operations
- **Comprehensive logging** with timestamps
- **Error handling** with detailed error messages
- **Batch operations** for performance
- **Duplicate prevention** where applicable
- **Summary reports** after completion

## Country Mapping

The CSV import script includes comprehensive country mapping:

| CSV Flag Value | Normalized Country   |
| -------------- | -------------------- |
| `portugal`     | Portugal             |
| `pakistan`     | Pakistan             |
| `mozambique`   | Mozambique           |
| `usa`          | United States        |
| `uk`           | United Kingdom       |
| `uae`          | United Arab Emirates |
| ...            | ...                  |

_See the script for the complete mapping table._

## File Structure

```
scripts/
├── reset_scores.py
├── reset_participants.py
├── import_participants_from_csv.py
├── update_participant_flags.py
├── pre-selection.csv              # Input CSV file
└── README_database_scripts.md     # This file
```

## Troubleshooting

### Firebase Connection Issues

- Verify credentials are properly configured
- Check internet connection
- Ensure Firebase project ID matches

### CSV Import Issues

- Verify `pre-selection.csv` exists in scripts folder
- Check CSV column headers match expected format
- Review logs for specific row errors

### Flag Update Issues

- Ensure flag images exist in `/obs/assets/flags/`
- Check file permissions
- Verify image file formats (PNG required)

### Memory Issues

- For large datasets, scripts use batch processing
- Consider running during off-peak hours
- Monitor system resources

## Logging

All scripts generate detailed logs with:

- Timestamp for each operation
- Operation details and progress
- Error messages with context
- Summary statistics
- Next steps recommendations

Logs help with debugging and provide audit trails for data operations.
