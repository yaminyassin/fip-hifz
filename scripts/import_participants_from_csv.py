import logging
import sys
import os
import csv
import firebase_admin
from firebase_admin import credentials, firestore
from typing import Dict, Any, List

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

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

def normalize_country_name(flag_value: str) -> str:
    """Convert flag value to proper country name."""
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
    
    if not flag_value:
        return ""
    
    # Normalize the input
    normalized_flag = flag_value.lower().strip()
    
    # Look up in mapping
    return flag_mapping.get(normalized_flag, flag_value.title())

def generate_participant_id(first_name: str, last_name: str) -> str:
    """Generate a participant ID from name."""
    # Remove special characters and spaces, convert to lowercase
    clean_first = ''.join(c.lower() for c in first_name if c.isalnum())
    clean_last = ''.join(c.lower() for c in last_name if c.isalnum())
    return f"{clean_first}_{clean_last}"

def csv_row_to_participant(row: Dict[str, str], row_index: int) -> Dict[str, Any]:
    """Convert a CSV row to a Participant document structure."""
    try:
        # Extract data from CSV columns
        first_name = row.get('FIRST NAME', '').strip()
        last_name = row.get('LAST NAME', '').strip()
        full_name = row.get('🔒_FIRST_AND_LAST_NAME', f"{first_name} {last_name}").strip()
        age_str = row.get('AGE ON EVENT', '0').strip()
        flag_value = row.get('🔒_FLAG_IMAGE', '').strip()
        category = row.get('CATEGORY', '').strip()
        scheduled = row.get('SLOT SCHEDULE', '').strip()
        participant_photo = row.get('🔒_PARTICIPANT_PHOTO', '').strip()

        logging.info(f'participant photo: {participant_photo}')
        
        # Generate participant ID
        participant_id = generate_participant_id(first_name, last_name)
        
        # Convert age to integer
        try:
            age = int(age_str) if age_str.isdigit() else 0
        except ValueError:
            logging.warning(f"Invalid age '{age_str}' for participant {full_name}. Using 0.")
            age = 0
        
        # Convert flag value to country name
        country = normalize_country_name(flag_value)
        
        # Create photo path by concatenating category with participant photo
        photo_path = ''
        if participant_photo and category:
            photo_path = f"{category}/{participant_photo}"
        elif participant_photo:
            photo_path = participant_photo
        
        # Create participant document following the Participant model
        participant_doc = {
            'name': full_name,
            'age': age,
            'country': country,
            'category': category,
            'school': '',  # Default empty - can be filled manually later
            'scheduled': scheduled,
            'isDone': False,
            'isActive': row_index == 1,  # First participant is active, others are not
            'flag': '',  # Will be filled by the flag update script
            'parentsName': '',  # Default empty - can be filled manually later
            'phoneNum': '',  # Default empty - can be filled manually later
            'email': '',  # Default empty - can be filled manually later
            'photo': photo_path,  # Category concatenated with participant photo filename
            'assignedQuestions': [],  # Default empty array
            'activeQuestion': 0,  # Default to 0
        }
        
        logging.info(f"Converted row {row_index}: {full_name} -> {participant_id} (photo: {photo_path})")
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

def import_participants_from_csv():
    """Main function to import participants from CSV."""
    COLLECTION_NAME = "participants"
    
    # Get CSV file path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    csv_file_path = os.path.join(script_dir, "participants.csv")
    
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
        collection_ref = db_client.collection(COLLECTION_NAME)
        
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
            logging.info("1. Run 'python update_participant_flags.py' to add flag images")
            logging.info("2. Manually update any missing fields (school, parentsName, phoneNum, etc.)")
            logging.info("3. Assign questions to participants")
        
    except Exception as e:
        logging.error(f"Error importing participants: {e}")
        sys.exit(1)

if __name__ == "__main__":
    logging.info("Starting participants CSV import script...")
    
    # Ask for confirmation
    response = input("Do you want to import participants from CSV? (y/N): ")
    if response.lower() not in ['y', 'yes']:
        logging.info("Script cancelled by user.")
        sys.exit(0)
    
    import_participants_from_csv()
    logging.info("Participants import completed.") 