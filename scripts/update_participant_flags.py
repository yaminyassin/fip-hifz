import logging
import sys
import os
import base64
import firebase_admin
from firebase_admin import credentials, firestore

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

def normalize_country_name(country_name):
    """Normalize country name to match flag filename format."""
    if not country_name:
        return None
    return country_name.strip().lower().replace(" ", "-")

def find_flag_file(country_name, flags_dir):
    """Find the flag file for a given country name."""
    if not country_name:
        return None
    
    normalized_country = normalize_country_name(country_name)
    
    try:
        if not os.path.exists(flags_dir):
            logging.error(f"Flags directory not found: {flags_dir}")
            return None
            
        available_flags = os.listdir(flags_dir)
        for flag_file in available_flags:
            name_part, ext_part = os.path.splitext(flag_file)
            if ext_part.lower() == ".png" and not name_part.startswith("_"):
                normalized_file_name = name_part.lower().replace(" ", "-")
                if normalized_file_name == normalized_country:
                    flag_path = os.path.join(flags_dir, flag_file)
                    logging.info(f"Found matching flag for '{country_name}': '{flag_file}'")
                    return flag_path
        
        logging.warning(f"No flag found for country '{country_name}' (searched for '{normalized_country}.png')")
        return None
    
    except Exception as e:
        logging.error(f"Error searching for flag file: {e}")
        return None

def convert_image_to_base64(image_path):
    """Convert an image file to base64 string."""
    try:
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return f"data:image/png;base64,{encoded_string}"
    except Exception as e:
        logging.error(f"Error converting image to base64: {e}")
        return None

def get_default_flag_base64(flags_dir):
    """Get the default global flag as base64."""
    global_flag_path = os.path.join(flags_dir, "_global.png")
    if os.path.exists(global_flag_path):
        return convert_image_to_base64(global_flag_path)
    return None

def update_participant_flags():
    """Main function to update all participant flags."""
    # Configuration
    FIRESTORE_PARTICIPANTS_COLLECTION = "participants"
    FLAGS_DIR = "/Users/yaminyassin/Work/fip-hifz/obs/assets/flags"
    
    # Initialize Firebase
    db_client = initialize_firebase()
    if not db_client:
        logging.critical("Firebase initialization failed. Exiting.")
        sys.exit(1)
    
    # Get default flag for fallback
    default_flag_base64 = get_default_flag_base64(FLAGS_DIR)
    if not default_flag_base64:
        logging.warning("Default global flag not found. Participants without matching flags will not get a fallback.")
    
    try:
        # Get all participants
        participants_ref = db_client.collection(FIRESTORE_PARTICIPANTS_COLLECTION)
        participants = participants_ref.stream()
        
        updated_count = 0
        skipped_count = 0
        error_count = 0
        default_flag_count = 0
        
        for participant_doc in participants:
            participant_id = participant_doc.id
            participant_data = participant_doc.to_dict()
            
            logging.info(f"Processing participant: {participant_id}")
            
            # Get country from participant data
            country = participant_data.get('country')
            flag_base64 = None
            
            if country and country.strip():
                # Find the corresponding flag file
                flag_file_path = find_flag_file(country, FLAGS_DIR)
                if flag_file_path:
                    # Convert flag image to base64
                    flag_base64 = convert_image_to_base64(flag_file_path)
                    if not flag_base64:
                        logging.error(f"Failed to convert flag image to base64 for participant {participant_id}")
                
                if not flag_base64 and default_flag_base64:
                    logging.info(f"Using default flag for participant {participant_id} with country '{country}'")
                    flag_base64 = default_flag_base64
                    default_flag_count += 1
            else:
                logging.warning(f"Participant {participant_id} has no country field or empty country")
                if default_flag_base64:
                    logging.info(f"Using default flag for participant {participant_id}")
                    flag_base64 = default_flag_base64
                    default_flag_count += 1
            
            # Update the participant document with the flag base64
            if flag_base64:
                try:
                    participant_doc.reference.update({'flag': flag_base64})
                    logging.info(f"Successfully updated flag for participant {participant_id}")
                    updated_count += 1
                except Exception as e:
                    logging.error(f"Failed to update participant {participant_id}: {e}")
                    error_count += 1
            else:
                logging.warning(f"No flag data available for participant {participant_id}. Skipping.")
                skipped_count += 1
        
        # Summary
        logging.info("="*50)
        logging.info("UPDATE SUMMARY")
        logging.info("="*50)
        logging.info(f"Participants updated: {updated_count}")
        logging.info(f"Participants with default flag: {default_flag_count}")
        logging.info(f"Participants skipped: {skipped_count}")
        logging.info(f"Participants with errors: {error_count}")
        logging.info(f"Total processed: {updated_count + skipped_count + error_count}")
        
    except Exception as e:
        logging.error(f"Error processing participants: {e}")
        sys.exit(1)

if __name__ == "__main__":
    logging.info("Starting flag update script...")
    logging.info("This script will update the 'flag' field for all participants with base64-encoded flag images.")
    
    # Ask for confirmation
    response = input("Do you want to continue? This will update ALL participant documents. (y/N): ")
    if response.lower() not in ['y', 'yes']:
        logging.info("Script cancelled by user.")
        sys.exit(0)
    
    update_participant_flags()
    logging.info("Flag update script completed.") 