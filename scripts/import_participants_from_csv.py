"""
Participants CSV Import Script

This script imports participant data from a CSV file into Firestore with integrated flag processing.
It handles:
- CSV data extraction and validation
- Country flag processing and base64 encoding
- Photo path generation based on category
- Participant document creation in Firestore

Author: FIP Hifz Competition System
"""

import logging
import sys
import os
import csv
import base64
import firebase_admin
from firebase_admin import credentials, firestore
from typing import Dict, Any, List, Optional

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# ===== CONFIGURATION =====
class Config:
    """Configuration constants for the import script."""
    COLLECTION_NAME = "participants"
    FLAGS_DIR = "/Users/yaminyassin/Work/fip-hifz/obs/assets/flags"

# ===== FIREBASE INITIALIZATION =====
def initialize_firebase():
    """Initializes the Firebase Admin SDK if not already initialized."""
    try:
        if not firebase_admin._apps:
            if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred)
                logging.info("Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
            else:
                # Construct the expected path relative to the script's directory, then get its absolute path
                script_dir = os.path.dirname(os.path.abspath(__file__))
                expected_key_path = os.path.join(script_dir, "..", "google-services-key.json")
                absolute_key_path = os.path.abspath(expected_key_path)
                
                logging.info(f"Attempting to load Firebase key from: {absolute_key_path}")

                if os.path.exists(absolute_key_path):
                    cred = credentials.Certificate(absolute_key_path)
                    firebase_admin.initialize_app(cred)
                    logging.info(f"Initialized Firebase Admin SDK using {absolute_key_path}.")
                else:
                    logging.error(f"Firebase credentials not found at {absolute_key_path}. "
                                  "Set GOOGLE_APPLICATION_CREDENTIALS or ensure the key file is correctly placed.")
                    return None
        else:
            logging.info("Firebase Admin SDK already initialized.")
        return firestore.client()
    except Exception as e:
        logging.error(f"Error initializing Firebase Admin SDK: {e}")
        return None

# ===== COUNTRY AND FLAG PROCESSING =====
def normalize_country_name(flag_value: str) -> str:
    """Convert flag value to proper country name."""
    if not flag_value:
        return ""
    
    # Remove .png extension if present
    clean_flag_value = flag_value.strip()
    if clean_flag_value.lower().endswith('.png'):
        clean_flag_value = clean_flag_value[:-4]  # Remove last 4 characters (.png)
    
    # Map common flag values to proper country names
    flag_mapping = {
        'portugal': 'Portugal',
        'pakistan': 'Pakistan',
        'mozambique': 'Mozambique',
        'usa': 'United States',
        'uk': 'United Kingdom',
        'uae': 'United Arab Emirates',
        'spain': 'Spain',
        'france': 'France',
        'germany': 'Germany',
        'italy': 'Italy',
        'brazil': 'Brazil',
        'india': 'India',
        'indonesia': 'Indonesia',
        'malaysia': 'Malaysia',
        'turkey': 'Turkey',
        'egypt': 'Egypt',
        'morocco': 'Morocco',
        'algeria': 'Algeria',
        'tunisia': 'Tunisia',
        'saudi-arabia': 'Saudi Arabia',
        'bangladesh': 'Bangladesh',
        'afghanistan': 'Afghanistan',
        'iran': 'Iran',
        'iraq': 'Iraq',
        'syria': 'Syria',
        'lebanon': 'Lebanon',
        'jordan': 'Jordan',
        'palestine': 'Palestine',
        'kuwait': 'Kuwait',
        'qatar': 'Qatar',
        'bahrain': 'Bahrain',
        'oman': 'Oman',
        'yemen': 'Yemen',
        'somalia': 'Somalia',
        'sudan': 'Sudan',
        'libya': 'Libya',
        'nigeria': 'Nigeria',
        'senegal': 'Senegal',
        'mali': 'Mali',
        'niger': 'Niger',
        'chad': 'Chad',
        'ghana': 'Ghana',
        'ivory-coast': 'Ivory Coast',
        'burkina-faso': 'Burkina Faso',
        'guinea': 'Guinea',
        'sierra-leone': 'Sierra Leone',
        'liberia': 'Liberia',
        'gambia': 'Gambia',
        'guinea-bissau': 'Guinea-Bissau',
        'cape-verde': 'Cape Verde',
        'south-africa': 'South Africa',
        'kenya': 'Kenya',
        'tanzania': 'Tanzania',
        'uganda': 'Uganda',
        'ethiopia': 'Ethiopia',
        'eritrea': 'Eritrea',
        'djibouti': 'Djibouti',
        'comoros': 'Comoros',
        'madagascar': 'Madagascar',
        'mauritius': 'Mauritius',
        'seychelles': 'Seychelles',
        'malawi': 'Malawi',
        'zambia': 'Zambia',
        'zimbabwe': 'Zimbabwe',
        'botswana': 'Botswana',
        'namibia': 'Namibia',
        'lesotho': 'Lesotho',
        'swaziland': 'Eswatini',
        'russia': 'Russia',
        'china': 'China',
        'japan': 'Japan',
        'south-korea': 'South Korea',
        'north-korea': 'North Korea',
        'mongolia': 'Mongolia',
        'kazakhstan': 'Kazakhstan',
        'uzbekistan': 'Uzbekistan',
        'turkmenistan': 'Turkmenistan',
        'kyrgyzstan': 'Kyrgyzstan',
        'tajikistan': 'Tajikistan',
        'australia': 'Australia',
        'new-zealand': 'New Zealand',
        'canada': 'Canada',
        'mexico': 'Mexico',
        'argentina': 'Argentina',
        'chile': 'Chile',
        'colombia': 'Colombia',
        'venezuela': 'Venezuela',
        'peru': 'Peru',
        'ecuador': 'Ecuador',
        'bolivia': 'Bolivia',
        'uruguay': 'Uruguay',
        'paraguay': 'Paraguay',
        'guyana': 'Guyana',
        'suriname': 'Suriname',
        'netherlands': 'Netherlands',
        'belgium': 'Belgium',
        'luxembourg': 'Luxembourg',
        'switzerland': 'Switzerland',
        'austria': 'Austria',
        'poland': 'Poland',
        'czech-republic': 'Czech Republic',
        'slovakia': 'Slovakia',
        'hungary': 'Hungary',
        'romania': 'Romania',
        'bulgaria': 'Bulgaria',
        'albania': 'Albania',
        'macedonia': 'North Macedonia',
        'montenegro': 'Montenegro',
        'bosnia-and-herzegovina': 'Bosnia and Herzegovina',
        'croatia': 'Croatia',
        'slovenia': 'Slovenia',
        'serbia': 'Serbia',
        'kosovo': 'Kosovo',
        'greece': 'Greece',
        'cyprus': 'Cyprus',
        'malta': 'Malta',
        'denmark': 'Denmark',
        'sweden': 'Sweden',
        'norway': 'Norway',
        'finland': 'Finland',
        'iceland': 'Iceland',
        'ireland': 'Ireland',
        'estonia': 'Estonia',
        'latvia': 'Latvia',
        'lithuania': 'Lithuania',
        'belarus': 'Belarus',
        'ukraine': 'Ukraine',
        'moldova': 'Moldova',
    }
    
    # Normalize the input (use clean_flag_value without .png extension)
    normalized_flag = clean_flag_value.lower().strip()
    
    # Look up in mapping
    return flag_mapping.get(normalized_flag, clean_flag_value.title())

# ===== IMAGE PROCESSING =====
def generate_participant_id(first_name: str, last_name: str) -> str:
    """Generate a participant ID from name."""
    # Remove special characters and spaces, convert to lowercase
    clean_first = ''.join(c.lower() for c in first_name if c.isalnum())
    clean_last = ''.join(c.lower() for c in last_name if c.isalnum())
    return f"{clean_first}_{clean_last}"

def convert_image_to_base64(image_path: str) -> Optional[str]:
    """Convert an image file to base64 string."""
    try:
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return f"data:image/png;base64,{encoded_string}"
    except Exception as e:
        logging.error(f"Error converting image to base64: {e}")
        return None

def get_available_flag_files() -> List[str]:
    """Get list of available flag files (without extension and underscore files)."""
    try:
        if not os.path.exists(Config.FLAGS_DIR):
            logging.error(f"Flags directory not found: {Config.FLAGS_DIR}")
            return []
            
        available_flags = os.listdir(Config.FLAGS_DIR)
        flag_names = []
        
        for flag_file in available_flags:
            name_part, ext_part = os.path.splitext(flag_file)
            if ext_part.lower() == ".png" and not name_part.startswith("_"):
                flag_names.append(name_part.lower())
        
        return flag_names
    
    except Exception as e:
        logging.error(f"Error getting available flag files: {e}")
        return []

def calculate_string_similarity(str1: str, str2: str) -> float:
    """Calculate similarity between two strings using a simple algorithm."""
    if not str1 or not str2:
        return 0.0
    
    # Convert to lowercase for comparison
    s1, s2 = str1.lower(), str2.lower()
    
    # If strings are identical
    if s1 == s2:
        return 1.0
    
    # Check if one string contains the other
    if s1 in s2 or s2 in s1:
        return 0.8
    
    # Check for partial matches (split by common separators)
    words1 = set(s1.replace("-", " ").replace("_", " ").split())
    words2 = set(s2.replace("-", " ").replace("_", " ").split())
    
    if words1 and words2:
        common_words = words1.intersection(words2)
        if common_words:
            return len(common_words) / max(len(words1), len(words2)) * 0.7
    
    # Simple character overlap
    common_chars = set(s1).intersection(set(s2))
    if common_chars:
        return len(common_chars) / max(len(s1), len(s2)) * 0.3
    
    return 0.0

def find_closest_flag_match(country_name: str, available_flags: List[str]) -> Optional[str]:
    """Find the closest matching flag using similarity scoring."""
    if not country_name or not available_flags:
        return None
    
    normalized_country = country_name.strip().lower().replace(" ", "-")
    
    best_match = None
    best_score = 0.0
    min_similarity_threshold = 0.5  # Minimum similarity score to consider a match
    
    for flag_name in available_flags:
        similarity = calculate_string_similarity(normalized_country, flag_name)
        
        if similarity > best_score and similarity >= min_similarity_threshold:
            best_score = similarity
            best_match = flag_name
    
    if best_match:
        logging.info(f"Found closest flag match for '{country_name}': '{best_match}' (similarity: {best_score:.2f})")
        return best_match
    
    return None

def find_flag_file(country_name: str) -> Optional[str]:
    """Find the flag file for a given country name with fallback to closest match."""
    if not country_name:
        return None
    
    normalized_country = country_name.strip().lower().replace(" ", "-")
    
    try:
        if not os.path.exists(Config.FLAGS_DIR):
            logging.error(f"Flags directory not found: {Config.FLAGS_DIR}")
            return None
        
        available_flags = get_available_flag_files()
        if not available_flags:
            logging.error("No flag files found in flags directory")
            return None
        
        # First, try exact match
        for flag_name in available_flags:
            if flag_name == normalized_country:
                flag_path = os.path.join(Config.FLAGS_DIR, f"{flag_name}.png")
                logging.info(f"Found exact flag match for '{country_name}': '{flag_name}.png'")
                return flag_path
        
        # If no exact match, try to find closest match
        closest_match = find_closest_flag_match(country_name, available_flags)
        if closest_match:
            flag_path = os.path.join(Config.FLAGS_DIR, f"{closest_match}.png")
            logging.info(f"Using closest flag match for '{country_name}': '{closest_match}.png'")
            return flag_path
        
        logging.warning(f"No suitable flag found for country '{country_name}' (searched for '{normalized_country}.png')")
        return None
    
    except Exception as e:
        logging.error(f"Error searching for flag file: {e}")
        return None

def get_default_flag_base64() -> Optional[str]:
    """Get the default global flag as base64."""
    global_flag_path = os.path.join(Config.FLAGS_DIR, "_global.png")
    if os.path.exists(global_flag_path):
        return convert_image_to_base64(global_flag_path)
    return None

def process_flag_for_participant(country: str) -> str:
    """Process and return the flag base64 for a participant based on their country."""
    flag_base64 = ""
    
    if country and country.strip():
        # Find the corresponding flag file
        flag_file_path = find_flag_file(country)
        if flag_file_path:
            # Convert flag image to base64
            flag_base64 = convert_image_to_base64(flag_file_path)
            if flag_base64:
                logging.info(f"Successfully processed flag for country '{country}'")
                return flag_base64
            else:
                logging.error(f"Failed to convert flag image to base64 for country '{country}'")
    
    # Fallback to default flag
    default_flag_base64 = get_default_flag_base64()
    if default_flag_base64:
        logging.info(f"Using default flag for country '{country or 'unknown'}'")
        return default_flag_base64
    else:
        logging.warning(f"No flag data available for country '{country or 'unknown'}' and no default flag found")
        return ""

# ===== CSV PROCESSING =====
def extract_csv_data(row: Dict[str, str]) -> Dict[str, Any]:
    """Extract and clean data from CSV row."""
    return {
        'first_name': row.get('FIRST NAME', '').strip(),
        'last_name': row.get('LAST NAME', '').strip(),
        'full_name': row.get('🔒_FIRST_AND_LAST_NAME', '').strip(),
        'age_str': row.get('AGE ON EVENT', '0').strip(),
        'flag_value': row.get('🔒_FLAG_IMAGE', '').strip(),
        'category': row.get('CATEGORY', '').strip(),
        'scheduled': row.get('SLOT SCHEDULE', '').strip(),
        'participant_photo': row.get('🔒_PARTICIPANT_PHOTO', '').strip(),
    }

def process_participant_name(csv_data: Dict[str, Any]) -> str:
    """Process and return the full participant name."""
    if csv_data['full_name']:
        return csv_data['full_name']
    return f"{csv_data['first_name']} {csv_data['last_name']}".strip()

def process_participant_age(age_str: str, participant_name: str) -> int:
    """Process and return the participant age as integer."""
    try:
        return int(age_str) if age_str.isdigit() else 0
    except ValueError:
        logging.warning(f"Invalid age '{age_str}' for participant {participant_name}. Using 0.")
        return 0

def process_participant_photo(participant_photo: str, category: str) -> str:
    """Process and return the participant photo path."""
    if not participant_photo:
        return ''
    
    if category:
        return f"{category}/{participant_photo}"
    return participant_photo

def create_participant_document(csv_data: Dict[str, Any], row_index: int) -> Dict[str, Any]:
    """Create a participant document from processed CSV data."""
    full_name = process_participant_name(csv_data)
    age = process_participant_age(csv_data['age_str'], full_name)
    country = normalize_country_name(csv_data['flag_value'])
    photo_path = process_participant_photo(csv_data['participant_photo'], csv_data['category'])
    flag_base64 = process_flag_for_participant(country)
    
    return {
        'name': full_name,
        'age': age,
        'country': country,
        'category': csv_data['category'],
        'school': '',  # Default empty - can be filled manually later
        'scheduled': csv_data['scheduled'],
        'isDone': False,
        'isActive': row_index == 1,  # First participant is active, others are not
        'flag': flag_base64,  # Base64 encoded flag image
        'parentsName': '',  # Default empty - can be filled manually later
        'phoneNum': '',  # Default empty - can be filled manually later
        'email': '',  # Default empty - can be filled manually later
        'photo': photo_path,  # Category concatenated with participant photo filename
        'assignedQuestions': [],  # Default empty array
        'activeQuestion': 0,  # Default to 0
    }

def csv_row_to_participant(row: Dict[str, str], row_index: int) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    """Convert a CSV row to a Participant document structure."""
    try:
        # Extract data from CSV columns
        csv_data = extract_csv_data(row)
        
        # Generate participant ID
        participant_id = generate_participant_id(csv_data['first_name'], csv_data['last_name'])
        
        # Create participant document
        participant_doc = create_participant_document(csv_data, row_index)
        
        logging.info(f"Converted row {row_index}: {participant_doc['name']} -> {participant_id} (photo: {participant_doc['photo']}, flag: {'processed' if participant_doc['flag'] else 'none'})")
        return participant_id, participant_doc
        
    except Exception as e:
        logging.error(f"Error converting CSV row {row_index} to participant: {e}")
        logging.error(f"Row data: {row}")
        return None, None

def read_csv_file(csv_file_path: str) -> List[Dict[str, str]]:
    """Read and parse the CSV file."""
    if not os.path.exists(csv_file_path):
        logging.error(f"CSV file not found: {csv_file_path}")
        return []
    
    try:
        rows = []
        with open(csv_file_path, 'r', encoding='utf-8') as file:
            csv_reader = csv.DictReader(file)
            for row in csv_reader:
                rows.append(row)
        
        logging.info(f"Successfully read {len(rows)} rows from CSV file")
        return rows
        
    except Exception as e:
        logging.error(f"Error reading CSV file: {e}")
        return []

# ===== FILE OPERATIONS =====
def get_csv_file_path() -> str:
    """Get the path to the CSV file."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, "participants.csv")

# ===== MAIN IMPORT FUNCTION =====
def import_participants_from_csv():
    """Main function to import participants from CSV with integrated flag processing."""
    # Get CSV file path
    csv_file_path = get_csv_file_path()
    
    # Initialize Firebase
    db_client = initialize_firebase()
    if not db_client:
        logging.critical("Firebase initialization failed. Exiting.")
        sys.exit(1)
    
    # Read CSV file
    csv_rows = read_csv_file(csv_file_path)
    if not csv_rows:
        logging.critical("No data found in CSV file. Exiting.")
        sys.exit(1)
    
    try:
        collection_ref = db_client.collection(Config.COLLECTION_NAME)
        
        created_count = 0
        skipped_count = 0
        error_count = 0
        
        for index, row in enumerate(csv_rows, 1):
            participant_id, participant_doc = csv_row_to_participant(row, index)
            
            if participant_id and participant_doc:
                try:
                    # Check if participant already exists
                    existing_doc = collection_ref.document(participant_id).get()
                    if existing_doc.exists:
                        logging.warning(f"Participant {participant_id} already exists. Skipping.")
                        skipped_count += 1
                        continue
                    
                    # Create the participant document
                    collection_ref.document(participant_id).set(participant_doc)
                    logging.info(f"Created participant: {participant_id} - {participant_doc['name']}")
                    created_count += 1
                    
                except Exception as e:
                    logging.error(f"Failed to create participant {participant_id}: {e}")
                    error_count += 1
            else:
                logging.error(f"Failed to process CSV row {index}")
                error_count += 1
        
        # Summary
        logging.info("="*50)
        logging.info("IMPORT SUMMARY")
        logging.info("="*50)
        logging.info(f"CSV file: {csv_file_path}")
        logging.info(f"Total rows processed: {len(csv_rows)}")
        logging.info(f"Participants created: {created_count}")
        logging.info(f"Participants skipped (already exist): {skipped_count}")
        logging.info(f"Errors: {error_count}")
        logging.info("Import completed!")
        
        if created_count > 0:
            logging.info("\nNext steps:")
            logging.info("1. Manually update any missing fields (school, parentsName, phoneNum, etc.)")
            logging.info("2. Assign questions to participants")
            logging.info("3. Upload participant photos to obs/assets/participants/ directory")
        
    except Exception as e:
        logging.error(f"Error importing participants: {e}")
        sys.exit(1)

# ===== MAIN EXECUTION =====
if __name__ == "__main__":
    logging.info("="*60)
    logging.info("PARTICIPANTS CSV IMPORT SCRIPT")
    logging.info("="*60)
    logging.info("This script will:")
    logging.info("• Read participant data from 'participants.csv'")
    logging.info("• Create participant documents in Firestore")
    logging.info("• Process and assign country flags automatically")
    logging.info("• Set up photo paths based on category")
    logging.info("="*60)
    
    # Ask for confirmation
    response = input("\nDo you want to import participants from CSV? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        logging.info("Script cancelled by user.")
        sys.exit(0)
    
    import_participants_from_csv()
    logging.info("Participants import with integrated flag processing completed.") 