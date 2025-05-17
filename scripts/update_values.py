import logging
import sys
import os
import firebase_admin
from firebase_admin import credentials, firestore
# Use require_version for better compatibility checks if needed, requires obswebsocket module update maybe
from obswebsocket import obsws, requests, exceptions
import traceback # Import traceback for logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
class Config:
    OBS_HOST = "localhost"
    OBS_PORT = 4455
    OBS_PASSWORD = "password"  # Your OBS WebSocket password
    SOURCE_QURAN_IMAGE = "quran_image"
    SOURCE_NAME_1 = "name1"  # Updated from SOURCE_NAME
    SOURCE_NAME_2 = "name2"  # New source for the second part of the name
    SOURCE_AGE = "age"
    SOURCE_COUNTRY_TEXT = "country"  # New text source for country name
    SOURCE_FLAG = "flag"
    SOURCE_CATEGORY = "category" # Renamed from "Category" to "category"

    FIRESTORE_PARTICIPANTS_COLLECTION = "participants"

    # Absolute paths for image directories
    QURAN_IMAGES_DIR = "/Users/yaminyassin/Work/fip-hifz/obs/assets/quran"
    FLAG_IMAGES_DIR = "/Users/yaminyassin/Work/fip-hifz/obs/assets/flags"
    CATEGORY_IMAGES_DIR = "/Users/yaminyassin/Work/fip-hifz/obs/assets/categories" # New directory for category images

# ---------------------

class OBSController:
    """Handles all interactions with OBS via WebSocket."""
    def __init__(self, host: str, port: int, password: str):
        self.host = host
        self.port = port
        self.password = password
        self.ws = None

    def connect(self):
        """Connects to the OBS WebSocket server."""
        if self.ws and self.is_connected():
            logging.info("Already connected to OBS.")
            return
        try:
            self.ws = obsws(self.host, self.port, self.password)
            self.ws.connect()
            logging.info(f"Successfully connected to OBS WebSocket at {self.host}:{self.port}.")
        except exceptions.ConnectionFailure as e:
            logging.error(f"Could not connect to OBS: {e}")
            logging.error("Ensure OBS is running, WebSocket server enabled, and host/port/password are correct.")
            self.ws = None
            raise

    def disconnect(self):
        """Disconnects from the OBS WebSocket server."""
        if self.ws and self.is_connected():
            logging.info("Disconnecting from OBS.")
            self.ws.disconnect()
            self.ws = None
        else:
            logging.info("Not connected to OBS or already disconnected.")

    def is_connected(self) -> bool:
        """Checks if the WebSocket connection is active."""
        return self.ws and hasattr(self.ws, 'ws') and self.ws.ws and self.ws.ws.connected

    def update_text_source(self, obs_source_name: str, new_text: str):
        """Updates the text of a specified text source in OBS."""
        if not self.is_connected():
            logging.error(f"Not connected to OBS. Cannot update text source '{obs_source_name}'.")
            return
        if not new_text:
            logging.warning(f"New text for source '{obs_source_name}' is empty. Skipping update.")
            return
        try:
            new_settings = {'text': str(new_text)}
            self.ws.call(requests.SetInputSettings(inputName=obs_source_name, inputSettings=new_settings, overlay=True))
            logging.info(f"Successfully updated text source '{obs_source_name}' to '{new_text}'.")
        except exceptions.ConnectionFailure:
            logging.error(f"Connection to OBS failed during text update for '{obs_source_name}'.")
        except Exception as e:
            logging.error(f"Error updating text source '{obs_source_name}': {e}")
            logging.debug(traceback.format_exc())

    def update_image_file_source(self, obs_source_name: str, image_base_dir: str, new_image_filename: str):
        """Changes the file path of an image source in OBS."""
        if not self.is_connected():
            logging.error(f"Not connected to OBS. Cannot update image source '{obs_source_name}'.")
            return
        if not new_image_filename:
            logging.warning(f"New image filename for source '{obs_source_name}' is empty. Skipping update.")
            return

        new_file_path = os.path.join(image_base_dir, new_image_filename)
        if not os.path.exists(new_file_path):
            logging.error(f"Image file not found: {new_file_path} for source '{obs_source_name}'.")
            return

        try:
            new_settings = {'file': new_file_path}
            self.ws.call(requests.SetInputSettings(inputName=obs_source_name, inputSettings=new_settings, overlay=True))
            logging.info(f"Successfully changed source '{obs_source_name}' image to '{new_file_path}'.")
        except exceptions.ConnectionFailure:
            logging.error(f"Connection to OBS failed during image update for '{obs_source_name}'.")
        except Exception as e:
            logging.error(f"Error changing source '{obs_source_name}': {e}")
            logging.debug(traceback.format_exc())

# --- Firebase Functions ---
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
                
                logging.info(f"Attempting to load Firebase key from: {absolute_key_path}") # Log the absolute path

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

def get_active_participant_data(db_client):
    """Fetches the first active participant's data from Firestore."""
    if not db_client:
        return None
    try:
        participants_ref = db_client.collection(Config.FIRESTORE_PARTICIPANTS_COLLECTION)
        query = participants_ref.where(filter=firestore.FieldFilter("isActive", "==", True)).limit(1)
        active_participants = list(query.stream())

        if active_participants:
            participant = active_participants[0]
            logging.info(f"Found active participant: {participant.id} - {participant.to_dict().get('name', 'N/A')}")
            return participant.to_dict()
        else:
            logging.warning(f"No active participant found in '{Config.FIRESTORE_PARTICIPANTS_COLLECTION}'.")
            return None
    except Exception as e:
        logging.error(f"Error fetching active participant from Firestore: {e}")
        return None

# --- Data Processing and OBS Updates ---
def process_participant_updates(obs_controller: OBSController, participant_data: dict):
    """Processes participant data and updates relevant OBS sources."""
    if not participant_data:
        logging.info("No participant data provided for OBS update.")
        return

    # Update Quran Image
    active_q_num = participant_data.get('activeQuestion')
    if active_q_num is not None:
        try:
            q_num = int(active_q_num)
            if 0 <= q_num <= 999:
                img_file = f"{q_num:03d}.png"
                obs_controller.update_image_file_source(Config.SOURCE_QURAN_IMAGE, Config.QURAN_IMAGES_DIR, img_file)
            else:
                logging.warning(f"'activeQuestion' {q_num} out of range (0-999). Quran image not updated.")
        except ValueError:
            logging.warning(f"Invalid 'activeQuestion' value: {active_q_num}. Quran image not updated.")
    else:
        logging.warning("No 'activeQuestion' field. Quran image not updated.")

    # Update Name (split into Name1 and Name2)
    full_name = participant_data.get('name')
    if full_name and full_name.strip():
        words = full_name.strip().split()
        num_words = len(words)
        
        if num_words > 0:
            midpoint = num_words // 2
            name1_text = " ".join(words[:midpoint])
            name2_text = " ".join(words[midpoint:])
            
            # If only one word, name1 gets it, name2 is empty, unless midpoint logic already handles it.
            # For 1 word: midpoint = 0. words[:0] is []. words[0:] is [the_word]. This is reverse of what's intuitive.
            # Let's adjust for single word case specifically for clarity, or ensure the general logic is correct.
            # If num_words = 1, midpoint = 0. name1_text = "".join(words[:0]) -> "". name2_text = " ".join(words[0:]) -> "word1"
            # The rule was: "if the word lenght is odd then add extra name words to name2"
            # Example: "John Doe Smith" (3 words). Midpoint = 1. name1 = words[:1] ("John"). name2 = words[1:] ("Doe Smith"). Correct.
            # Example: "Jane" (1 word). Midpoint = 0. name1 = words[:0] (""). name2 = words[0:] ("Jane"). This needs adjustment.

            if num_words == 1:
                name1_text = words[0]
                name2_text = ""
            # For more than 1 word, the midpoint logic should be correct as per the rule.
            # For 2 words: midpoint=1. name1_text=words[0]. name2_text=words[1]. Correct.
            # For 3 words: midpoint=1. name1_text=words[0]. name2_text=words[1:]. Correct.
            # For 4 words: midpoint=2. name1_text=words[0:2]. name2_text=words[2:]. Correct.
        else: # Empty string after strip
            name1_text = ""
            name2_text = ""

        obs_controller.update_text_source(Config.SOURCE_NAME_1, name1_text)
        obs_controller.update_text_source(Config.SOURCE_NAME_2, name2_text)
        logging.info(f"Updated name sources: '{Config.SOURCE_NAME_1}'='{name1_text}', '{Config.SOURCE_NAME_2}'='{name2_text}'.")
    else:
        logging.warning(f"No 'name' field or name is empty. Clearing sources '{Config.SOURCE_NAME_1}' and '{Config.SOURCE_NAME_2}'.")
        obs_controller.update_text_source(Config.SOURCE_NAME_1, "")
        obs_controller.update_text_source(Config.SOURCE_NAME_2, "")

    # Update Age
    age = participant_data.get('age')
    if age is not None:
        obs_controller.update_text_source(Config.SOURCE_AGE, str(age))
    else:
        logging.warning(f"No 'age' field. Source '{Config.SOURCE_AGE}' not updated. Clearing if preferred.")
        # obs_controller.update_text_source(Config.SOURCE_AGE, "") # Optional: Clear if missing

    # Update Country Text and Flag Image
    country_name_from_firestore = participant_data.get('country')
    default_flag_filename = "_global.png" # Default flag
    actual_flag_to_set = default_flag_filename

    if country_name_from_firestore and isinstance(country_name_from_firestore, str) and country_name_from_firestore.strip():
        country_name_str = country_name_from_firestore.strip()
        obs_controller.update_text_source(Config.SOURCE_COUNTRY_TEXT, country_name_str)
        logging.info(f"Updated country text source '{Config.SOURCE_COUNTRY_TEXT}' to '{country_name_str}'.")

        # Normalize country name for flag file search (e.g., "Guinea Bissau" -> "guinea-bissau")
        normalized_search_name = country_name_str.lower().replace(" ", "-")
        
        found_specific_flag = False
        try:
            available_flags = os.listdir(Config.FLAG_IMAGES_DIR)
            for flag_file_in_dir in available_flags:
                # Normalize actual filename for comparison (e.g., "Guinea-Bissau.png" -> "guinea-bissau")
                name_part, ext_part = os.path.splitext(flag_file_in_dir)
                if ext_part.lower() == ".png": # Ensure it's a png file
                    normalized_file_name_stem = name_part.lower().replace(" ", "-") # Also normalize spaces in filename just in case
                    if normalized_file_name_stem == normalized_search_name:
                        actual_flag_to_set = flag_file_in_dir
                        found_specific_flag = True
                        logging.info(f"Found matching flag for '{country_name_str}': '{actual_flag_to_set}'.")
                        break
        except FileNotFoundError:
            logging.error(f"Flag directory not found: {Config.FLAG_IMAGES_DIR}. Cannot update flag.")
            # In this case, actual_flag_to_set remains default_flag_filename, but we might not be able to load it
        
        if not found_specific_flag and actual_flag_to_set == default_flag_filename: # only log if we didn't find a specific one
             logging.warning(f"No specific flag found for country '{country_name_str}' (searched for '{normalized_search_name}.png'). Using default: '{default_flag_filename}'.")
    else:
        logging.warning(f"No 'country' field or country name is empty. Clearing source '{Config.SOURCE_COUNTRY_TEXT}' and using default flag.")
        obs_controller.update_text_source(Config.SOURCE_COUNTRY_TEXT, "")
        # actual_flag_to_set is already default_flag_filename

    # Update the flag image source
    # Check if the default flag itself exists if we are falling back to it, or if any selected flag exists
    if not os.path.exists(os.path.join(Config.FLAG_IMAGES_DIR, actual_flag_to_set)):
        logging.error(f"Flag file '{actual_flag_to_set}' not found in '{Config.FLAG_IMAGES_DIR}'. Cannot update flag source '{Config.SOURCE_FLAG}'.")
    else:
        obs_controller.update_image_file_source(Config.SOURCE_FLAG, Config.FLAG_IMAGES_DIR, actual_flag_to_set)

    # Update Category Image
    category_base_name = participant_data.get('category') # Get the base name like "B1"
    if category_base_name:
        category_image_filename = f"{category_base_name}.png" # Construct filename e.g., "B1.png"
        obs_controller.update_image_file_source(
            Config.SOURCE_CATEGORY, # This is "category"
            Config.CATEGORY_IMAGES_DIR,
            category_image_filename
        )
        logging.info(f"Updated category image source '{Config.SOURCE_CATEGORY}' with '{category_image_filename}'.")
    else:
        logging.warning(f"No 'category' field found in participant data. Source '{Config.SOURCE_CATEGORY}' (image) not updated.")

# --- Utility Functions ---
def ensure_directories_exist():
    """Creates necessary image directories if they don't exist."""
    dirs_to_create = [
        Config.QURAN_IMAGES_DIR,
        Config.FLAG_IMAGES_DIR,
        Config.CATEGORY_IMAGES_DIR # Add new category images directory
    ]
    for directory in dirs_to_create:
        if not os.path.exists(directory):
            try:
                os.makedirs(directory)
                logging.info(f"Created directory: {directory}")
            except OSError as e:
                logging.error(f"Failed to create directory {directory}: {e}. Check permissions/path.")
                # Depending on how critical this is, you might want to sys.exit(1)

# --- Main Execution ---
def main():
    obs_controller = None
    try:
        ensure_directories_exist() # Ensure directories are ready

        db_client = initialize_firebase()
        if not db_client:
            logging.critical("Firebase initialization failed. Exiting application.")
            sys.exit(1)

        participant_data = get_active_participant_data(db_client)
        if not participant_data:
            logging.info("No active participant data found. Nothing to update in OBS. Exiting.")
            sys.exit(0)

        obs_controller = OBSController(Config.OBS_HOST, Config.OBS_PORT, Config.OBS_PASSWORD)
        obs_controller.connect() # Raises ConnectionFailure if unable to connect

        process_participant_updates(obs_controller, participant_data)

        logging.info("OBS sources updated successfully based on active participant data.")

    except exceptions.ConnectionFailure:
        logging.critical("Failed to connect to OBS. Ensure OBS is running and configured correctly. Exiting.")
        sys.exit(1)
    except Exception as e:
        logging.critical(f"An unexpected error occurred in main execution: {e}", exc_info=True)
        sys.exit(1)
    finally:
        if obs_controller:
            obs_controller.disconnect()

if __name__ == "__main__":
    main()