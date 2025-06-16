#!/usr/bin/env python3
"""
Export Participant Scores to CSV

This script fetches data from Firebase Firestore collections (participants, jury, scores, overallBonuses)
and generates a CSV file with detailed scoring breakdown for each participant.

The CSV includes:
- For each judge and each question: all scoring fields (hifdh_judge_correction, hifdh_self_correction, etc.)
- Overall bonus for each judge
- Final calculated score using the same logic as the frontend

Usage:
    export GOOGLE_APPLICATION_CREDENTIALS=google-services-key.json
    python scripts/export_participant_scores_csv.py
"""

import csv
import os
import sys
from typing import Dict, List, Optional, Any
import firebase_admin
from firebase_admin import credentials, firestore
from dataclasses import dataclass
from datetime import datetime
import math


@dataclass
class QuestionFields:
    """Represents the scoring fields for a single question"""
    hifdh_judge_correction: int = 0
    hifdh_self_correction: int = 0
    hifdh_stuck_count: int = 0
    tajweed_major: int = 0
    tajweed_minor: int = 0
    waqf_ibtida_incorrect: float = 0
    waqf_ibtida_meaning: float = 0
    husn_al_ada_score: int = 0


@dataclass
class ScoreBreakdown:
    """Score breakdown by section"""
    hifdh: float = 0
    tajweed: float = 0
    waqf: float = 0
    husn_al_ada: float = 0
    overall_bonus: float = 0


@dataclass
class CalculatedScoreResult:
    """Result of score calculation"""
    percentage: float = 0  # Actually total points (0-105)
    breakdown_by_section: ScoreBreakdown = None

    def __post_init__(self):
        if self.breakdown_by_section is None:
            self.breakdown_by_section = ScoreBreakdown()


@dataclass
class Participant:
    """Participant model"""
    id: str
    name: str
    age: int
    country: str
    category: str
    school: str
    scheduled: str
    is_done: bool
    is_active: bool
    flag: str
    parents_name: str
    phone_num: str
    email: Optional[str] = None
    photo: Optional[str] = None
    assigned_questions: List[int] = None
    active_question: int = 0

    def __post_init__(self):
        if self.assigned_questions is None:
            self.assigned_questions = []


@dataclass
class Jury:
    """Jury model"""
    id: str
    name: str
    current_question: int
    has_finished_evaluating: bool
    is_active: bool


@dataclass
class Score:
    """Score model"""
    id: str
    participant_id: str
    jury_id: str
    question_number: int
    page_number: int
    scores: QuestionFields
    created_at: Any
    updated_at: Any


@dataclass
class OverallBonus:
    """Overall bonus model"""
    id: str
    participant_id: str
    jury_id: str
    overall_bonus: float
    created_at: Any
    updated_at: Any


# Scoring constants (from scoreUtils.ts)
BASE_SCORE_PER_QUESTION = 100
HIFDH_JUDGE_CORRECTION_PENALTY = 3
HIFDH_SELF_CORRECTION_PENALTY = 2
HIFDH_MISTAKE_VOID_THRESHOLD = 3
MAX_HIFDH_DEDUCTION = 50
TAJWEED_MAJOR_PENALTY = 2
TAJWEED_MINOR_PENALTY = 1
MAX_TAJWEED_DEDUCTION = 30
WAQF_IBTIDA_INCORRECT_PENALTY = 0.3
WAQF_IBTIDA_MEANING_PENALTY = 0.7
MAX_WAQF_IBTIDA_DEDUCTION = 10
HUSN_AL_ADA_MISTAKE_PENALTY = 1
MAX_HUSN_AL_ADA_DEDUCTION = 10
TOTAL_OVERALL_BONUS_CAP = 5


def calculate_score_logic(all_scores: Dict[int, QuestionFields], participant_bonus_override: Optional[float] = None) -> CalculatedScoreResult:
    """
    Calculate score logic (Python implementation of calculateScoreLogic from scoreUtils.ts)
    """
    total_points_sum = 0
    total_question_count = 0

    # For breakdown
    total_hifdh_contribution = 0
    total_tajweed_contribution = 0
    total_waqf_contribution = 0
    total_husn_al_ada_deduction = 0

    question_scores_array = list(all_scores.values())

    if not question_scores_array:
        return CalculatedScoreResult()

    for scores in question_scores_array:
        # Each question starts with 100 points
        question_points = BASE_SCORE_PER_QUESTION
        is_void = False

        # --- 1. Hifdh ---
        # Apply 4-Mistake Rule (ONLY based on Judge Corrections)
        if scores.hifdh_judge_correction >= HIFDH_MISTAKE_VOID_THRESHOLD:
            question_points = 0
            is_void = True
            total_hifdh_contribution += 0
        else:
            hifdh_deduction = (scores.hifdh_judge_correction * HIFDH_JUDGE_CORRECTION_PENALTY +
                             scores.hifdh_self_correction * HIFDH_SELF_CORRECTION_PENALTY)
            capped_hifdh_deduction = min(MAX_HIFDH_DEDUCTION, hifdh_deduction)
            question_points -= capped_hifdh_deduction
            total_hifdh_contribution += MAX_HIFDH_DEDUCTION - capped_hifdh_deduction

        if not is_void:
            # --- 2. Tajweed ---
            tajweed_deduction = (scores.tajweed_major * TAJWEED_MAJOR_PENALTY +
                               scores.tajweed_minor * TAJWEED_MINOR_PENALTY)
            capped_tajweed_deduction = min(MAX_TAJWEED_DEDUCTION, tajweed_deduction)
            question_points -= capped_tajweed_deduction
            total_tajweed_contribution += MAX_TAJWEED_DEDUCTION - capped_tajweed_deduction

            # --- 3. Waqf & Ibtida ---
            waqf_deduction = (scores.waqf_ibtida_incorrect * WAQF_IBTIDA_INCORRECT_PENALTY +
                            scores.waqf_ibtida_meaning * WAQF_IBTIDA_MEANING_PENALTY)
            capped_waqf_deduction = min(MAX_WAQF_IBTIDA_DEDUCTION, waqf_deduction)
            question_points -= capped_waqf_deduction
            total_waqf_contribution += MAX_WAQF_IBTIDA_DEDUCTION - capped_waqf_deduction

            # --- 4. Husn Al-Ada ---
            husn_al_ada_deduction = scores.husn_al_ada_score * HUSN_AL_ADA_MISTAKE_PENALTY
            capped_husn_al_ada_deduction = min(MAX_HUSN_AL_ADA_DEDUCTION, husn_al_ada_deduction)
            question_points -= capped_husn_al_ada_deduction
            total_husn_al_ada_deduction += capped_husn_al_ada_deduction
        else:
            # If void, other categories also contribute 0 for this question's breakdown
            total_tajweed_contribution += 0
            total_waqf_contribution += 0

        # Ensure question points are not negative
        question_points = max(0, question_points)

        # Accumulate question scores
        total_points_sum += question_points
        total_question_count += 1

    # Calculate final score: Average of question scores + overall bonus
    average_question_score = total_points_sum / total_question_count if total_question_count > 0 else 0

    # Add overall bonus
    overall_bonus_points = 0
    if participant_bonus_override is not None:
        overall_bonus_points = min(TOTAL_OVERALL_BONUS_CAP, participant_bonus_override)

    # Final total score
    final_total_score = average_question_score + overall_bonus_points

    # Ensure final score is within reasonable bounds
    max_possible_score = BASE_SCORE_PER_QUESTION + TOTAL_OVERALL_BONUS_CAP
    capped_final_score = max(0, min(max_possible_score, final_total_score))

    # Calculate average breakdown for display
    num_questions_for_breakdown = len(question_scores_array) if question_scores_array else 1

    avg_breakdown = ScoreBreakdown(
        hifdh=round((total_hifdh_contribution / num_questions_for_breakdown) * 100) / 100,
        tajweed=round((total_tajweed_contribution / num_questions_for_breakdown) * 100) / 100,
        waqf=round((total_waqf_contribution / num_questions_for_breakdown) * 100) / 100,
        husn_al_ada=round((total_husn_al_ada_deduction / num_questions_for_breakdown) * 100) / 100,
        overall_bonus=round(overall_bonus_points * 100) / 100
    )

    return CalculatedScoreResult(
        percentage=round(capped_final_score * 100) / 100,
        breakdown_by_section=avg_breakdown
    )


def calculate_final_score(all_scores: Dict[str, QuestionFields], participant_bonus_override: Optional[float] = None) -> CalculatedScoreResult:
    """
    Calculate the final total score for a participant based on scores from all questions.
    Python implementation of calculateFinalScore from scoreUtils.ts
    """
    normalized_scores = {}
    for key, value in all_scores.items():
        normalized_scores[int(key)] = value
    return calculate_score_logic(normalized_scores, participant_bonus_override)


def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
        elif os.path.exists("google-services-key.json"):
            cred = credentials.Certificate("google-services-key.json")
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using google-services-key.json.")
        else:
            print("Error: Firebase credentials not found.")
            print("Please either set the GOOGLE_APPLICATION_CREDENTIALS environment variable")
            print("or place 'google-services-key.json' in the script's directory.")
            return None
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return None
    
    return firestore.client()


def fetch_participants(db) -> List[Participant]:
    """Fetch all participants from Firestore"""
    participants = []
    try:
        docs = db.collection('participants').stream()
        for doc in docs:
            data = doc.to_dict()
            participant = Participant(
                id=doc.id,
                name=data.get('name', ''),
                age=data.get('age', 0),
                country=data.get('country', ''),
                category=data.get('category', ''),
                school=data.get('school', ''),
                scheduled=data.get('scheduled', ''),
                is_done=data.get('isDone', False),
                is_active=data.get('isActive', False),
                flag=data.get('flag', ''),
                parents_name=data.get('parentsName', ''),
                phone_num=data.get('phoneNum', ''),
                email=data.get('email'),
                photo=data.get('photo'),
                assigned_questions=data.get('assignedQuestions', []),
                active_question=data.get('activeQuestion', 0)
            )
            participants.append(participant)
        print(f"Fetched {len(participants)} participants")
    except Exception as e:
        print(f"Error fetching participants: {e}")
    return participants


def fetch_jury(db) -> List[Jury]:
    """Fetch all jury members from Firestore"""
    jury_members = []
    try:
        docs = db.collection('jury').stream()
        for doc in docs:
            data = doc.to_dict()
            jury = Jury(
                id=doc.id,
                name=data.get('name', ''),
                current_question=data.get('currentQuestion', 0),
                has_finished_evaluating=data.get('hasFinishedEvaluating', False),
                is_active=data.get('isActive', False)
            )
            jury_members.append(jury)
        print(f"Fetched {len(jury_members)} jury members")
    except Exception as e:
        print(f"Error fetching jury: {e}")
    return jury_members


def fetch_scores(db) -> List[Score]:
    """Fetch all scores from Firestore"""
    scores = []
    try:
        docs = db.collection('scores').stream()
        doc_count = 0
        for doc in docs:
            data = doc.to_dict()
            doc_id = doc.id
            doc_count += 1
            
            # Get participant and jury IDs directly from document data
            participant_id = data.get('participantId', '')
            jury_id = data.get('juryId', '')
            question_number = data.get('questionNumber', 0)
            
            # Debug: Show first few documents
            if doc_count <= 3:
                print(f"Score Doc {doc_count}: ID='{doc_id}', participantId='{participant_id}', juryId='{jury_id}', questionNumber={question_number}")
                scores_data = data.get('scores', {})
                if scores_data:
                    sample_scores = {k: v for k, v in list(scores_data.items())[:3]}
                    print(f"   Sample scores: {sample_scores}")
            
            if not participant_id:
                print(f"Warning: Document '{doc_id}' missing participantId. Skipping.")
                continue
                
            if not jury_id:
                print(f"Warning: Document '{doc_id}' missing juryId. Skipping.")
                continue
                
            if not question_number:
                print(f"Warning: Document '{doc_id}' missing questionNumber. Skipping.")
                continue
            
            scores_data = data.get('scores', {})
            
            question_fields = QuestionFields(
                hifdh_judge_correction=scores_data.get('hifdh_judge_correction', 0),
                hifdh_self_correction=scores_data.get('hifdh_self_correction', 0),
                hifdh_stuck_count=scores_data.get('hifdh_stuck_count', 0),
                tajweed_major=scores_data.get('tajweed_major', 0),
                tajweed_minor=scores_data.get('tajweed_minor', 0),
                waqf_ibtida_incorrect=scores_data.get('waqf_ibtida_incorrect', 0),
                waqf_ibtida_meaning=scores_data.get('waqf_ibtida_meaning', 0),
                husn_al_ada_score=scores_data.get('husn_al_ada_score', 0)
            )
            
            score = Score(
                id=doc_id,
                participant_id=participant_id,
                jury_id=jury_id,
                question_number=question_number,
                page_number=data.get('pageNumber', 0),
                scores=question_fields,
                created_at=data.get('createdAt'),
                updated_at=data.get('updatedAt')
            )
            scores.append(score)
            
        print(f"Fetched {len(scores)} scores from {doc_count} documents")
    except Exception as e:
        print(f"Error fetching scores: {e}")
    return scores


def fetch_overall_bonuses(db) -> List[OverallBonus]:
    """Fetch all overall bonuses from Firestore"""
    bonuses = []
    try:
        docs = db.collection('overallBonuses').stream()
        for doc in docs:
            data = doc.to_dict()
            doc_id = doc.id
            
            # Get participant and jury IDs directly from document data
            participant_id = data.get('participantId', '')
            jury_id = data.get('juryId', '')
            
            if not participant_id:
                print(f"Warning: OverallBonus document '{doc_id}' missing participantId. Skipping.")
                continue
                
            if not jury_id:
                print(f"Warning: OverallBonus document '{doc_id}' missing juryId. Skipping.")
                continue
            
            bonus = OverallBonus(
                id=doc_id,
                participant_id=participant_id,
                jury_id=jury_id,
                overall_bonus=data.get('overallBonus', 0),
                created_at=data.get('createdAt'),
                updated_at=data.get('updatedAt')
            )
            bonuses.append(bonus)
            
        print(f"Fetched {len(bonuses)} overall bonuses")
    except Exception as e:
        print(f"Error fetching overall bonuses: {e}")
    return bonuses


def organize_data(participants: List[Participant], jury_members: List[Jury], scores: List[Score], bonuses: List[OverallBonus]):
    """Organize data for CSV generation"""
    
    # Create mappings
    participant_map = {p.id: p for p in participants}
    jury_map = {j.id: j for j in jury_members}
    
    print(f"\n=== Organizing Data ===")
    print(f"Participants: {[p.id + ' (' + p.name + ')' for p in participants[:3]]}")
    print(f"Jury Members: {[j.id + ' (' + j.name + ')' for j in jury_members]}")
    
    # Group scores by participant and jury
    scores_by_participant_jury = {}
    score_count = 0
    for score in scores:
        key = (score.participant_id, score.jury_id)
        if key not in scores_by_participant_jury:
            scores_by_participant_jury[key] = {}
        scores_by_participant_jury[key][score.question_number] = score.scores
        score_count += 1
        
        # Debug: Show first few scores
        if score_count <= 5:
            participant_name = participant_map.get(score.participant_id, {}).name if score.participant_id in participant_map else "Unknown"
            jury_name = jury_map.get(score.jury_id, {}).name if score.jury_id in jury_map else "Unknown"
            print(f"Score {score_count}: {participant_name} ({score.participant_id}) + {jury_name} ({score.jury_id}) Q{score.question_number}")
    
    # Group bonuses by participant and jury
    bonuses_by_participant_jury = {}
    bonus_count = 0
    for bonus in bonuses:
        key = (bonus.participant_id, bonus.jury_id)
        bonuses_by_participant_jury[key] = bonus.overall_bonus
        bonus_count += 1
        
        # Debug: Show first few bonuses
        if bonus_count <= 5:
            participant_name = participant_map.get(bonus.participant_id, {}).name if bonus.participant_id in participant_map else "Unknown"
            jury_name = jury_map.get(bonus.jury_id, {}).name if bonus.jury_id in jury_map else "Unknown"
            print(f"Bonus {bonus_count}: {participant_name} ({bonus.participant_id}) + {jury_name} ({bonus.jury_id}) = {bonus.overall_bonus}")
    
    print(f"Total Score Records Organized: {score_count}")
    print(f"Total Bonus Records Organized: {bonus_count}")
    print(f"Unique Participant-Jury Score Combinations: {len(scores_by_participant_jury)}")
    print(f"Unique Participant-Jury Bonus Combinations: {len(bonuses_by_participant_jury)}")
    
    return participant_map, jury_map, scores_by_participant_jury, bonuses_by_participant_jury


def generate_csv_headers(jury_members: List[Jury]) -> List[str]:
    """Generate CSV headers based on jury members and questions"""
    headers = [
        "Participant ID", "Name", "Age", "Country", "Category", "School", 
        "Scheduled", "Parents Name", "Phone", "Email"
    ]
    
    # Maximum 3 questions per category type
    max_questions = 3
    
    scoring_fields = [
        "hifdh_judge_correction", "hifdh_self_correction", "tajweed_major", 
        "tajweed_minor", "waqf_ibtida_incorrect", "waqf_ibtida_meaning", "husn_al_ada_score"
    ]
    
    # For each jury member
    for jury in jury_members:
        headers.append("")  # Empty column as separator
        headers.append(f"JUDGE: {jury.name}")
        headers.append("")  # Empty column
        
        # For each question (maximum 3)
        for question_num in range(1, max_questions + 1):
            headers.append(f"Question {question_num}")
            headers.extend(scoring_fields)
            headers.append("")  # Space between questions
        
        # Overall bonus for this jury
        headers.append("Overall Bonus")
        headers.append("")  # Space after jury
    
    # Final total score
    headers.append("TOTAL SCORE")
    
    return headers


def generate_csv_row(participant: Participant, jury_members: List[Jury], 
                    scores_by_participant_jury: Dict, bonuses_by_participant_jury: Dict) -> List[str]:
    """Generate a CSV row for a participant"""
    
    row = [
        participant.id, participant.name, participant.age, participant.country,
        participant.category, participant.school, participant.scheduled,
        participant.parents_name, participant.phone_num, participant.email or ""
    ]
    
    # Maximum 3 questions per category type
    max_questions = 3
    scoring_fields = [
        "hifdh_judge_correction", "hifdh_self_correction", "tajweed_major", 
        "tajweed_minor", "waqf_ibtida_incorrect", "waqf_ibtida_meaning", "husn_al_ada_score"
    ]
    
    # Collect all scores for final calculation
    all_participant_scores = {}
    total_bonus = 0
    jury_count = 0
    
    # For each jury member
    for jury in jury_members:
        row.append("")  # Empty column as separator
        row.append("")  # Judge name column (header only)
        row.append("")  # Empty column
        
        jury_key = (participant.id, jury.id)
        jury_scores = scores_by_participant_jury.get(jury_key, {})
        jury_bonus = bonuses_by_participant_jury.get(jury_key, 0)
        
        # Debug: Print what we found for this participant-jury combination
        if jury_scores:
            print(f"Found scores for {participant.name} + {jury.name}: {list(jury_scores.keys())}")
        
        # Add jury scores to total for final calculation
        if jury_scores:
            jury_count += 1
            total_bonus += jury_bonus
            for question_num, question_scores in jury_scores.items():
                if str(question_num) not in all_participant_scores:
                    all_participant_scores[str(question_num)] = []
                all_participant_scores[str(question_num)].append(question_scores)
        
        # For each question (maximum 3)
        for question_num in range(1, max_questions + 1):
            row.append("")  # Question header column
            
            if question_num in jury_scores:
                scores = jury_scores[question_num]
                for field in scoring_fields:
                    value = getattr(scores, field, 0)
                    row.append(str(value))
            else:
                # No scores for this question
                for field in scoring_fields:
                    row.append("0")
            
            row.append("")  # Space between questions
        
        # Overall bonus for this jury
        row.append(str(jury_bonus))
        row.append("")  # Space after jury
    
    # Calculate final total score
    # Average scores across juries for each question
    averaged_scores = {}
    for question_num, question_scores_list in all_participant_scores.items():
        if question_scores_list:
            # Average each field across juries
            avg_scores = QuestionFields()
            for field in scoring_fields:
                field_values = [getattr(scores, field, 0) for scores in question_scores_list]
                setattr(avg_scores, field, sum(field_values) / len(field_values))
            averaged_scores[question_num] = avg_scores
    
    # Calculate final score
    avg_bonus = total_bonus / jury_count if jury_count > 0 else 0
    if averaged_scores:
        final_result = calculate_final_score(averaged_scores, avg_bonus)
        final_score = final_result.percentage
    else:
        final_score = 0
    
    row.append(f"{final_score:.2f}")
    
    return row


def export_to_csv(participants: List[Participant], jury_members: List[Jury], 
                 scores_by_participant_jury: Dict, bonuses_by_participant_jury: Dict, 
                 output_filename: str = "participant_scores_export.csv"):
    """Export data to CSV file"""
    
    try:
        headers = generate_csv_headers(jury_members)
        
        with open(output_filename, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.writer(csvfile)
            
            # Write headers
            writer.writerow(headers)
            
            # Write data rows
            for participant in participants:
                row = generate_csv_row(participant, jury_members, scores_by_participant_jury, bonuses_by_participant_jury)
                writer.writerow(row)
        
        print(f"Successfully exported data to {output_filename}")
        print(f"Exported {len(participants)} participants with {len(jury_members)} judges")
        
    except Exception as e:
        print(f"Error writing CSV file: {e}")


def validate_data_integrity(participants: List[Participant], jury_members: List[Jury], scores: List[Score], bonuses: List[OverallBonus]):
    """Validate data integrity and relationships"""
    print("\n=== Data Validation ===")
    
    # Create sets for validation
    participant_ids = {p.id for p in participants}
    jury_ids = {j.id for j in jury_members}
    
    # Validate scores
    invalid_scores = []
    score_stats = {}
    
    for score in scores:
        # Check if participant exists
        if score.participant_id not in participant_ids:
            invalid_scores.append(f"Score {score.id}: Unknown participant '{score.participant_id}'")
            continue
            
        # Check if jury exists
        if score.jury_id not in jury_ids:
            invalid_scores.append(f"Score {score.id}: Unknown jury '{score.jury_id}'")
            continue
        
        # Track statistics
        key = (score.participant_id, score.jury_id)
        if key not in score_stats:
            score_stats[key] = []
        score_stats[key].append(score.question_number)
    
    # Validate bonuses
    invalid_bonuses = []
    bonus_stats = {}
    
    for bonus in bonuses:
        # Check if participant exists
        if bonus.participant_id not in participant_ids:
            invalid_bonuses.append(f"Bonus {bonus.id}: Unknown participant '{bonus.participant_id}'")
            continue
            
        # Check if jury exists  
        if bonus.jury_id not in jury_ids:
            invalid_bonuses.append(f"Bonus {bonus.id}: Unknown jury '{bonus.jury_id}'")
            continue
            
        # Track statistics
        key = (bonus.participant_id, bonus.jury_id)
        bonus_stats[key] = bonus.overall_bonus
    
    # Report validation results
    if invalid_scores:
        print(f"⚠️  Found {len(invalid_scores)} invalid score records:")
        for invalid in invalid_scores[:10]:  # Show first 10
            print(f"   {invalid}")
        if len(invalid_scores) > 10:
            print(f"   ... and {len(invalid_scores) - 10} more")
    else:
        print("✅ All score records have valid participant and jury references")
    
    if invalid_bonuses:
        print(f"⚠️  Found {len(invalid_bonuses)} invalid bonus records:")
        for invalid in invalid_bonuses[:10]:  # Show first 10
            print(f"   {invalid}")
        if len(invalid_bonuses) > 10:
            print(f"   ... and {len(invalid_bonuses) - 10} more")
    else:
        print("✅ All bonus records have valid participant and jury references")
    
    # Show statistics
    print(f"\n📊 Data Statistics:")
    print(f"   Participants: {len(participants)}")
    print(f"   Jury Members: {len(jury_members)}")
    print(f"   Score Records: {len(scores)}")
    print(f"   Bonus Records: {len(bonuses)}")
    print(f"   Unique Participant-Jury Score Combinations: {len(score_stats)}")
    print(f"   Unique Participant-Jury Bonus Combinations: {len(bonus_stats)}")
    
    # Show sample of questions per participant-jury combination
    if score_stats:
        print(f"\n📋 Sample Question Counts per Participant-Jury:")
        sample_keys = list(score_stats.keys())[:5]  # Show first 5
        for key in sample_keys:
            participant_id, jury_id = key
            questions = sorted(score_stats[key])
            participant_name = next((p.name for p in participants if p.id == participant_id), "Unknown")
            jury_name = next((j.name for j in jury_members if j.id == jury_id), "Unknown")
            print(f"   {participant_name} ({participant_id}) + {jury_name} ({jury_id}): Questions {questions}")
        if len(score_stats) > 5:
            print(f"   ... and {len(score_stats) - 5} more combinations")
    
    return len(invalid_scores) == 0 and len(invalid_bonuses) == 0


def main():
    """Main function"""
    print("Starting participant scores CSV export...")
    
    # Initialize Firebase
    db = initialize_firebase()
    if db is None:
        sys.exit(1)
    
    # Fetch data from Firestore
    print("\nFetching data from Firestore...")
    participants = fetch_participants(db)
    jury_members = fetch_jury(db)
    scores = fetch_scores(db)
    bonuses = fetch_overall_bonuses(db)
    
    if not participants:
        print("No participants found. Exiting.")
        sys.exit(1)
    
    if not jury_members:
        print("No jury members found. Exiting.")
        sys.exit(1)
    
    # Organize data
    print("\nOrganizing data...")
    participant_map, jury_map, scores_by_participant_jury, bonuses_by_participant_jury = organize_data(
        participants, jury_members, scores, bonuses
    )
    
    # Validate data integrity
    print("\nValidating data integrity...")
    if not validate_data_integrity(participants, jury_members, scores, bonuses):
        print("⚠️  Data integrity validation found issues. Proceeding with export but please review the warnings above.")
    
    # Generate CSV
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"participant_scores_export_{timestamp}.csv"
    
    print(f"\nGenerating CSV: {output_filename}")
    export_to_csv(participants, jury_members, scores_by_participant_jury, bonuses_by_participant_jury, output_filename)
    
    print("\nExport completed successfully!")


if __name__ == "__main__":
    main() 