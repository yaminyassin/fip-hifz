import logging
import sys
import os
import firebase_admin
from firebase_admin import credentials, firestore
# Use require_version for better compatibility checks if needed, requires obswebsocket module update maybe
from obswebsocket import obsws, requests, exceptions

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
OBS_HOST = "localhost"
OBS_PORT = 4455
OBS_PASSWORD = "password"  # Your OBS WebSocket password
SOURCE_QURAN_IMAGE = "quran_image"
SOURCE_NAME = "name"
SOURCE_AGE = "age"
SOURCE_CATEGORY = "category"
SOURCE_FLAG = "flag"
# ---------------------

# --- Firebase Configuration ---
FIRESTORE_PARTICIPANTS_COLLECTION = "participants" # Firestore collection for participants
# ----------------------------

# --- Local File Paths ---
# Directory where Quran page images are stored (e.g., downloaded by a separate script)
QURAN_IMAGES_DIR = "/Users/yaminyassin/Work/fip-hifz/quran_images" # Updated to absolute path
# Directory where flag images are stored
FLAG_IMAGES_DIR = "flags" # Assumes this is relative to the script's location or CWD
# ------------------------

def initialize_firebase():
    """Initializes the Firebase Admin SDK."""
    try:
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            logging.info("Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
        elif os.path.exists("serviceAccountKey.json"): # Assumes key is in the same dir as script
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
            logging.info("Initialized Firebase Admin SDK using serviceAccountKey.json.")
        else:
            logging.error("Firebase credentials not found. "
                          "Set GOOGLE_APPLICATION_CREDENTIALS or place serviceAccountKey.json in script directory.")
            return None
        return firestore.client()
    except Exception as e:
        logging.error(f"Error initializing Firebase Admin SDK: {e}")
        return None

def get_active_participant_data(db):
    """
    Fetches the first active participant's data from Firestore.
    An active participant is expected to have a field 'isActive' set to True.
    """
    if not db:
        return None
    try:
        participants_ref = db.collection(FIRESTORE_PARTICIPANTS_COLLECTION)
        query = participants_ref.where(filter=firestore.FieldFilter("isActive", "==", True)).limit(1)
        active_participants = list(query.stream())

        if active_participants:
            participant_data = active_participants[0].to_dict()
            participant_id = active_participants[0].id
            logging.info(f"Found active participant: {participant_id} - {participant_data.get('name', 'N/A')}")
            return participant_data
        else:
            logging.warning(f"No active participant found in '{FIRESTORE_PARTICIPANTS_COLLECTION}' collection.")
            return None
    except Exception as e:
        logging.error(f"Error fetching active participant data from Firestore: {e}")
        return None

def update_text_source(ws: obsws, obs_source_name: str, new_text: str):
    """
    Updates the text of a specified text source in OBS.

    Args:
        ws: The OBS WebSocket client instance.
        obs_source_name: The name of the text source in OBS.
        new_text: The new text to set for the source.
    """
    if not new_text: # Don't try to set empty text if that's not desired, or handle as needed
        logging.warning(f"New text for source '{obs_source_name}' is empty. Skipping update.")
        return
    try:
        # For GDI text sources, the setting is 'text'. For Freetype 2, it might be different.
        # This assumes a common 'text' property.
        new_settings = {'text': str(new_text)} # Ensure text is string
        ws.call(requests.SetInputSettings(inputName=obs_source_name, inputSettings=new_settings, overlay=True))
        logging.info(f"Successfully requested OBS to update text source '{obs_source_name}' to '{new_text}'.")
    except exceptions.ConnectionFailure:
        logging.error(f"Connection to OBS failed during text update for '{obs_source_name}'.")
    except Exception as e:
        logging.error(f"An error occurred while updating text source '{obs_source_name}': {e}")
        import traceback
        logging.debug(traceback.format_exc())

def update_image_file_source(ws: obsws, obs_source_name: str, image_base_dir: str, new_image_filename: str):
    """
    Changes the file path of an image source in OBS.

    Args:
        ws: The OBS WebSocket client instance.
        obs_source_name: The name of the image source in OBS.
        image_base_dir: The base directory where the image is located.
        new_image_filename: The filename of the new image to set.
    """
    if not new_image_filename:
        logging.warning(f"New image filename for source '{obs_source_name}' is empty. Skipping update.")
        return

    try:
        new_file_path = os.path.join(image_base_dir, new_image_filename)

        if not os.path.exists(new_file_path):
            logging.error(f"New image file not found locally at path: {new_file_path} for source '{obs_source_name}'. Cannot update.")
            return

        # For image sources, the setting is typically 'file'.
        new_settings = {'file': new_file_path}
        ws.call(requests.SetInputSettings(inputName=obs_source_name, inputSettings=new_settings, overlay=True))
        logging.info(f"Successfully requested OBS to change source '{obs_source_name}' image to '{new_image_filename}' (path: {new_file_path}).")

    except exceptions.ConnectionFailure:
        logging.error(f"Connection to OBS failed during image update for '{obs_source_name}'.")
    except Exception as e:
        logging.error(f"An unexpected error occurred while changing source '{obs_source_name}': {e}")
        import traceback
        logging.debug(traceback.format_exc())

def main():
    obs_ws = None
    db = None

    try:
        # Initialize Firebase
        db = initialize_firebase()
        if not db:
            sys.exit(1) # Exit if Firebase init fails

        # Fetch active participant data
        participant_data = get_active_participant_data(db)
        if not participant_data:
            logging.info("No active participant data to process. Exiting.")
            sys.exit(0) # Graceful exit if no active participant

        # Connect to OBS
        obs_ws = obsws(OBS_HOST, OBS_PORT, OBS_PASSWORD)
        logging.info(f"Connecting to OBS WebSocket at {OBS_HOST}:{OBS_PORT}...")
        obs_ws.connect()
        logging.info("Successfully connected to OBS.")

        # Update OBS sources based on participant data
        # --- Quran Image (based on activeQuestion number) ---
        active_question_number = participant_data.get('activeQuestion')
        if active_question_number is not None:
            try:
                # Ensure it's an integer before formatting
                question_num = int(active_question_number)
                if 0 <= question_num <= 999: # Assuming page numbers are within 0-999 range for XXX.png format
                    # Format the number to be three digits with leading zeros, e.g., 50 -> "050.png"
                    quran_image_filename = f"{question_num:03d}.png"
                    update_image_file_source(obs_ws, SOURCE_QURAN_IMAGE, QURAN_IMAGES_DIR, quran_image_filename)
                else:
                    logging.warning(f"'activeQuestion' number {question_num} is out of the expected range (0-999). Source '{SOURCE_QURAN_IMAGE}' not updated.")
            except ValueError:
                logging.warning(f"'activeQuestion' field ('{active_question_number}') is not a valid number. Source '{SOURCE_QURAN_IMAGE}' not updated.")
        else:
            logging.warning(f"No 'activeQuestion' field found for active participant. Source '{SOURCE_QURAN_IMAGE}' not updated.")

        # --- Name (Text) ---
        name_text = participant_data.get('name')
        if name_text:
            update_text_source(obs_ws, SOURCE_NAME, name_text)
        else:
            logging.warning(f"No 'name' found for active participant. Source '{SOURCE_NAME}' not updated.")

        # --- Age (Text) ---
        age_text = participant_data.get('age') # Assuming age might be number or string
        if age_text is not None: # Check for None as age could be 0
            update_text_source(obs_ws, SOURCE_AGE, str(age_text)) # Convert to string
        else:
            logging.warning(f"No 'age' found for active participant. Source '{SOURCE_AGE}' not updated.")

        # --- Category (Text) ---
        category_text = participant_data.get('category')
        if category_text:
            update_text_source(obs_ws, SOURCE_CATEGORY, category_text)
        else:
            logging.warning(f"No 'category' found for active participant. Source '{SOURCE_CATEGORY}' not updated.")

        # --- Flag (Image or Text) ---
        flag_filename = participant_data.get('flagFilename')
        flag_text = participant_data.get('flagText')

        if flag_filename:
            update_image_file_source(obs_ws, SOURCE_FLAG, FLAG_IMAGES_DIR, flag_filename)
        elif flag_text:
            update_text_source(obs_ws, SOURCE_FLAG, flag_text)
        else:
            logging.warning(f"No 'flagFilename' or 'flagText' found for active participant. Source '{SOURCE_FLAG}' not updated.")

    except exceptions.ConnectionFailure as e:
        logging.error(f"Could not connect to OBS: {e}")
        logging.error("Please ensure OBS is running, the WebSocket server is enabled, and the host/port/password are correct.")
        sys.exit(1)
    except Exception as e:
         logging.error(f"An unexpected error occurred in main: {e}")
         import traceback
         logging.error(traceback.format_exc()) # More detailed error for debugging
         sys.exit(1)
    finally:
        if obs_ws and hasattr(obs_ws, 'ws') and obs_ws.ws and obs_ws.ws.connected: # More robust check for active connection
            logging.info("Disconnecting from OBS.")
            obs_ws.disconnect()

if __name__ == "__main__":
    # Create image directories if they don't exist, so the script doesn't fail if they are missing
    # and an image needs to be loaded. The actual images should be placed here by another process.
    if not os.path.exists(QURAN_IMAGES_DIR):
        os.makedirs(QURAN_IMAGES_DIR)
        logging.info(f"Created directory: {QURAN_IMAGES_DIR}")
    if not os.path.exists(FLAG_IMAGES_DIR):
        os.makedirs(FLAG_IMAGES_DIR)
        logging.info(f"Created directory: {FLAG_IMAGES_DIR}")
        
    main()
    # Consider adding logging level configuration via command-line arguments for flexibility
    # Example: logging.basicConfig(level=logging.DEBUG) for more verbose output