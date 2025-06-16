# Participant Scores CSV Export Script

This script exports participant scores from Firebase Firestore to a CSV file with detailed scoring breakdowns.

## Overview

The script fetches data from the following Firebase collections:

- `participants` - Basic participant information
- `jury` - Jury member information
- `scores` - Individual question scores from each jury member
- `overallBonuses` - Overall bonus points given by each jury member

## CSV Structure

The generated CSV includes the following columns for each participant:

### Basic Information

- Participant ID, Name, Age, Country, Category, School, Scheduled, Parents Name, Phone, Email

### For Each Judge

For each jury member, the following columns are repeated:

**JUDGE: [Judge Name]**

- For each question (1-10):
  - `hifdh_judge_correction` - Judge corrections (-3 points each)
  - `hifdh_self_correction` - Self corrections (-2 points each)
  - `tajweed_major` - Major Tajweed mistakes (-2 points each)
  - `tajweed_minor` - Minor Tajweed mistakes (-1 point each)
  - `waqf_ibtida_incorrect` - Incorrect pause/start (-0.3 points each)
  - `waqf_ibtida_meaning` - Pause/start alters meaning (-0.7 points each)
  - `husn_al_ada_score` - Fluency mistakes (-1 point each)
- `Overall Bonus` - Bonus points (0-5) for this judge

### Final Score

- `TOTAL SCORE` - Calculated final score using the same logic as the frontend (0-105 points)

## Scoring Logic

The script implements the exact same scoring calculation as the frontend TypeScript code:

1. **Base Score**: Each question starts with 100 points
2. **Hifdh (Memorization)**:
   - Judge corrections: -3 points each
   - Self corrections: -2 points each
   - If 3+ judge corrections: Question is voided (score = 0)
   - Max deduction: 50 points
3. **Tajweed**:
   - Major mistakes: -2 points each
   - Minor mistakes: -1 point each
   - Max deduction: 30 points
4. **Waqf & Ibtida (Stopping & Starting)**:
   - Incorrect pause/start: -0.3 points each
   - Meaning-altering pause/start: -0.7 points each
   - Max deduction: 10 points
5. **Husn al-Adā' (Fluency)**:
   - Each mistake: -1 point
   - Max deduction: 10 points
6. **Overall Bonus**: 0-5 bonus points added to final average
7. **Final Score**: Average of all question scores + overall bonus (0-105 total)

## Usage

### Prerequisites

1. Ensure Firebase credentials are set up:

   - Either set `GOOGLE_APPLICATION_CREDENTIALS` environment variable
   - Or place `google-services-key.json` in the project root

2. Ensure Python dependencies are installed (firebase-admin should be available)

### Running the Script

#### Method 1: Using npm script (recommended)

```bash
npm run export-scores-csv
```

#### Method 2: Direct Python execution

```bash
export GOOGLE_APPLICATION_CREDENTIALS=google-services-key.json
python scripts/export_participant_scores_csv.py
```

### Output

The script will generate a CSV file named `participant_scores_export_[timestamp].csv` in the project root directory.

Example filename: `participant_scores_export_20250117_143022.csv`

## Features

- **Complete Data Export**: Exports all participant data with detailed scoring breakdown
- **Accurate Calculations**: Uses the exact same scoring logic as the frontend
- **Timestamped Output**: Each export file is uniquely timestamped
- **Error Handling**: Graceful handling of missing data and connection issues
- **Progress Tracking**: Console output shows fetching and processing progress

## Error Handling

The script handles various error conditions:

- Missing Firebase credentials
- Network connectivity issues
- Missing or incomplete data in Firestore
- File writing permissions

## Data Validation

The script includes validation for:

- Participant information completeness
- Score data integrity
- Jury member information
- Overall bonus calculations

## Notes

- The script assumes question numbers 1-10 for column generation
- Empty cells are filled with "0" for missing scores
- The final score calculation averages scores across all judges for each participant
- Overall bonuses are averaged across judges and capped at 5 points total
