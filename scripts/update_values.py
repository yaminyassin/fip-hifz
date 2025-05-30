import logging
import sys
import os
import firebase_admin
from firebase_admin import credentials, firestore
# Use require_version for better compatibility checks if needed, requires obswebsocket module update maybe
from obswebsocket import obsws, requests, exceptions
import traceback # Import traceback for logging
import threading # Added for background listener and graceful shutdown
import time      # Added for the main loop and graceful shutdown

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Global Variables for Shared Access ---
obs_controller_global = None
firestore_watch_global = None
shutdown_event = threading.Event() # Used for graceful shutdown

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
        if new_text is None:
            logging.warning(f"Received None for text source '{obs_source_name}'. Using empty string to clear.")
            new_text = ""
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
            logging.warning(f"New image filename for source '{obs_source_name}' is empty. OBS source might show last image or error.")
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

# --- Data Processing and OBS Updates ---
def process_participant_updates(obs_ctrl: OBSController, participant_data: dict | None):
    """Processes participant data and updates relevant OBS sources.
       If participant_data is None, it clears relevant OBS sources or sets defaults.
    """
    if not obs_ctrl:
        logging.error("OBSController not available for processing updates.")
        return

    if not participant_data:
        logging.info("No active participant data. Clearing/resetting OBS sources.")
        obs_ctrl.update_image_file_source(Config.SOURCE_QURAN_IMAGE, Config.QURAN_IMAGES_DIR, "") # Or a default "no question" image
        obs_ctrl.update_text_source(Config.SOURCE_NAME_1, "")
        obs_ctrl.update_text_source(Config.SOURCE_AGE, "")
        obs_ctrl.update_text_source(Config.SOURCE_COUNTRY_TEXT, "")
        obs_ctrl.update_image_file_source(Config.SOURCE_FLAG, Config.FLAG_IMAGES_DIR, "_global.png") # Default flag
        obs_ctrl.update_image_file_source(Config.SOURCE_CATEGORY, Config.CATEGORY_IMAGES_DIR, "") # Or a default "no category" image
        return

    # Update Quran Image
    active_q_num = participant_data.get('activeQuestion')
    if active_q_num is not None:
        try:
            q_num = int(active_q_num)
            if 0 <= q_num <= 999:
                img_file = f"{q_num:03d}.png"
                obs_ctrl.update_image_file_source(Config.SOURCE_QURAN_IMAGE, Config.QURAN_IMAGES_DIR, img_file)
            else:
                logging.warning(f"'activeQuestion' {q_num} out of range (0-999). Quran image not updated.")
                obs_ctrl.update_image_file_source(Config.SOURCE_QURAN_IMAGE, Config.QURAN_IMAGES_DIR, "") # Clear if out of range
        except ValueError:
            logging.warning(f"Invalid 'activeQuestion' value: {active_q_num}. Quran image not updated.")
            obs_ctrl.update_image_file_source(Config.SOURCE_QURAN_IMAGE, Config.QURAN_IMAGES_DIR, "") # Clear if invalid
    else:
        logging.warning("No 'activeQuestion' field. Clearing Quran image.")
        obs_ctrl.update_image_file_source(Config.SOURCE_QURAN_IMAGE, Config.QURAN_IMAGES_DIR, "")

    # Update Name (full name in SOURCE_NAME_1)
    full_name = participant_data.get('name')
    if full_name and full_name.strip():
        obs_ctrl.update_text_source(Config.SOURCE_NAME_1, full_name.strip())
        obs_ctrl.update_text_source(Config.SOURCE_NAME_2, full_name.strip())
        logging.info(f"Updated name source: '{Config.SOURCE_NAME_1}'='{full_name.strip()}'.")
    else:
        logging.warning(f"No 'name' field or name is empty. Clearing source '{Config.SOURCE_NAME_1}'.")
        obs_ctrl.update_text_source(Config.SOURCE_NAME_1, "")

    # Update Age
    age = participant_data.get('age')
    if age is not None: # Handles 0 as a valid age
        obs_ctrl.update_text_source(Config.SOURCE_AGE, str(age))
    else:
        logging.warning(f"No 'age' field. Clearing source '{Config.SOURCE_AGE}'.")
        obs_ctrl.update_text_source(Config.SOURCE_AGE, "")

    # Update Country Text and Flag Image
    country_name_from_firestore = participant_data.get('country')
    default_flag_filename = "_global.png"
    actual_flag_to_set = default_flag_filename
    country_text_to_set = ""

    if country_name_from_firestore and isinstance(country_name_from_firestore, str) and country_name_from_firestore.strip():
        country_name_str = country_name_from_firestore.strip()
        country_text_to_set = country_name_str # Set text source to this

        normalized_search_name = country_name_str.lower().replace(" ", "-")
        found_specific_flag = False
        try:
            if os.path.exists(Config.FLAG_IMAGES_DIR):
                available_flags = os.listdir(Config.FLAG_IMAGES_DIR)
                for flag_file_in_dir in available_flags:
                    name_part, ext_part = os.path.splitext(flag_file_in_dir)
                    if ext_part.lower() == ".png":
                        normalized_file_name_stem = name_part.lower().replace(" ", "-")
                        if normalized_file_name_stem == normalized_search_name:
                            actual_flag_to_set = flag_file_in_dir
                            found_specific_flag = True
                            logging.info(f"Found matching flag for '{country_name_str}': '{actual_flag_to_set}'.")
                            break
            else:
                logging.error(f"Flag directory not found: {Config.FLAG_IMAGES_DIR}. Cannot search for specific flags.")
        except FileNotFoundError: # Should be caught by os.path.exists, but good to have
            logging.error(f"Flag directory not found during listdir: {Config.FLAG_IMAGES_DIR}. Cannot update flag.")
        
        if not found_specific_flag:
             logging.warning(f"No specific flag found for country '{country_name_str}' (searched for '{normalized_search_name}.png'). Using default: '{default_flag_filename}'.")
    else:
        logging.warning(f"No 'country' field or country name is empty. Using default flag and clearing country text.")
        # actual_flag_to_set is already default_flag_filename
        # country_text_to_set is already ""

    obs_ctrl.update_text_source(Config.SOURCE_COUNTRY_TEXT, country_text_to_set)
    if not os.path.exists(os.path.join(Config.FLAG_IMAGES_DIR, actual_flag_to_set)):
        logging.error(f"Flag file '{actual_flag_to_set}' not found in '{Config.FLAG_IMAGES_DIR}'. Cannot update flag source '{Config.SOURCE_FLAG}'.")
        # Fallback to ensure we don't try to set a non-existent default if _global.png is also missing
        if actual_flag_to_set == default_flag_filename and not os.path.exists(os.path.join(Config.FLAG_IMAGES_DIR, default_flag_filename)):
            logging.error(f"Default flag '{default_flag_filename}' also not found. Flag source will not be updated reliably.")
        # else, if it was a specific flag that was not found, we already logged a warning.
        # Consider clearing the image source or setting to a known "empty" image if preferred.
    else:
        obs_ctrl.update_image_file_source(Config.SOURCE_FLAG, Config.FLAG_IMAGES_DIR, actual_flag_to_set)

    # Update Category Image
    category_base_name = participant_data.get('category')
    category_image_to_set = "" # Default to empty if no category
    if category_base_name:
        category_image_filename = f"{category_base_name}.png"
        if os.path.exists(os.path.join(Config.CATEGORY_IMAGES_DIR, category_image_filename)):
            category_image_to_set = category_image_filename
            logging.info(f"Updating category image source '{Config.SOURCE_CATEGORY}' with '{category_image_filename}'.")
        else:
            logging.warning(f"Category image file '{category_image_filename}' not found in '{Config.CATEGORY_IMAGES_DIR}'. Clearing category image.")
    else:
        logging.warning(f"No 'category' field found. Clearing category image source '{Config.SOURCE_CATEGORY}'.")
    
    obs_ctrl.update_image_file_source(Config.SOURCE_CATEGORY, Config.CATEGORY_IMAGES_DIR, category_image_to_set)

# --- Firestore Snapshot Listener Callback ---
def on_firestore_snapshot(doc_snapshot, changes, read_time):
    """Callback for Firestore snapshot listener."""
    logging.info(f"Received Firestore snapshot. Number of documents: {len(doc_snapshot)}, Changes: {len(changes)}")
    global obs_controller_global # Ensure we're using the global controller

    active_participant_data = None
    if doc_snapshot: # We expect at most one document due to .limit(1)
        participant_doc = doc_snapshot[0] # Get the first document
        if participant_doc.exists:
            data = participant_doc.to_dict()
            if data.get("isActive", False): # Double check isActive, though query should handle it
                active_participant_data = data
                logging.info(f"Processing active participant: {participant_doc.id} - {data.get('name', 'N/A')}")
            else:
                 logging.info(f"Document {participant_doc.id} received in snapshot but is not active. Ignoring.")
        else:
            logging.info("Snapshot received but document does not exist (e.g., previously active participant now deleted/inactive).")

    if not active_participant_data:
        logging.info("No active participant found in current snapshot. Will clear/reset OBS sources.")

    try:
        if obs_controller_global and obs_controller_global.is_connected():
            process_participant_updates(obs_controller_global, active_participant_data)
        elif obs_controller_global:
            logging.warning("OBS controller exists but is not connected. Attempting to reconnect.")
            try:
                obs_controller_global.connect()
                process_participant_updates(obs_controller_global, active_participant_data)
            except Exception as e:
                logging.error(f"Failed to reconnect OBS for snapshot processing: {e}")
        else:
            logging.error("OBS controller not initialized. Cannot process snapshot.")
    except Exception as e:
        logging.error(f"Error processing Firestore snapshot: {e}", exc_info=True)

# --- Utility Functions ---
def ensure_directories_exist():
    """Creates necessary image directories if they don't exist."""
    dirs_to_create = [
        Config.QURAN_IMAGES_DIR,
        Config.FLAG_IMAGES_DIR,
        Config.CATEGORY_IMAGES_DIR
    ]
    for directory in dirs_to_create:
        if not os.path.exists(directory):
            try:
                os.makedirs(directory)
                logging.info(f"Created directory: {directory}")
            except OSError as e:
                logging.error(f"Failed to create directory {directory}: {e}. Check permissions/path.")

# --- Main Execution ---
def main():
    global obs_controller_global, firestore_watch_global, shutdown_event

    try:
        ensure_directories_exist()

        db_client = initialize_firebase()
        if not db_client:
            logging.critical("Firebase initialization failed. Exiting application.")
            sys.exit(1)

        obs_controller_global = OBSController(Config.OBS_HOST, Config.OBS_PORT, Config.OBS_PASSWORD)
        try:
            obs_controller_global.connect()
        except exceptions.ConnectionFailure:
            logging.critical("Failed to connect to OBS on startup. Ensure OBS is running and configured correctly. Exiting.")
            sys.exit(1)
        
        # Initial fetch to set OBS state before listener starts (optional, but good for immediate UI)
        logging.info("Performing initial data fetch and OBS update before starting listener...")
        try:
            participants_ref_initial = db_client.collection(Config.FIRESTORE_PARTICIPANTS_COLLECTION)
            query_initial = participants_ref_initial.where(filter=firestore.FieldFilter("isActive", "==", True)).limit(1)
            active_docs_initial = list(query_initial.stream())
            initial_data = None
            if active_docs_initial:
                initial_data = active_docs_initial[0].to_dict()
                logging.info(f"Initial active participant: {active_docs_initial[0].id}")
            else:
                logging.info("No active participant found on initial check.")
            process_participant_updates(obs_controller_global, initial_data)
        except Exception as e:
            logging.error(f"Error during initial data fetch/update: {e}")


        # Set up Firestore listener
        participants_ref = db_client.collection(Config.FIRESTORE_PARTICIPANTS_COLLECTION)
        # Query for the document where 'isActive' is true. Limit to 1 as there should only be one.
        query = participants_ref.where(filter=firestore.FieldFilter("isActive", "==", True)).limit(1)
        
        firestore_watch_global = query.on_snapshot(on_firestore_snapshot)
        logging.info(f"Firestore listener started on '{Config.FIRESTORE_PARTICIPANTS_COLLECTION}' for active participants.")
        logging.info("Script is now running and listening for real-time Firestore updates...")
        logging.info("Press Ctrl+C to stop.")

        # Keep the main thread alive until shutdown_event is set
        while not shutdown_event.is_set():
            time.sleep(1) # Check for shutdown event every second

    except KeyboardInterrupt:
        logging.info("KeyboardInterrupt received. Shutting down gracefully...")
    except exceptions.ConnectionFailure as e: # Catch OBS connection issues that might occur during setup
        logging.critical(f"OBS Connection Failure during main execution: {e}. Exiting.")
        sys.exit(1)
    except Exception as e:
        logging.critical(f"An unexpected error occurred in main execution: {e}", exc_info=True)
        sys.exit(1)
    finally:
        logging.info("Starting final cleanup...")
        shutdown_event.set() # Signal all background threads or loops to stop

        if firestore_watch_global:
            logging.info("Unsubscribing from Firestore listener...")
            try:
                firestore_watch_global.unsubscribe()
                logging.info("Firestore listener unsubscribed.")
            except Exception as e:
                logging.error(f"Error unsubscribing from Firestore: {e}")
        
        if obs_controller_global:
            logging.info("Disconnecting from OBS...")
            obs_controller_global.disconnect() # This method already checks if connected
            logging.info("Disconnected from OBS.")
        
        logging.info("Shutdown complete. Exiting application.")

if __name__ == "__main__":
    main()