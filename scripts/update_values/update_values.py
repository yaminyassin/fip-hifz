import logging
import sys
import os
# Use require_version for better compatibility checks if needed, requires obswebsocket module update maybe
from obswebsocket import obsws, requests, exceptions

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
OBS_HOST = "localhost"
OBS_PORT = 4455
OBS_PASSWORD = "6Y5fkrt6h5AWQb5K"  # Your OBS WebSocket password
SOURCE_NAME = "Image"  # The exact name of your image source in OBS
IMAGE_DIR = "/Users/yaminyassin/Desktop" # Absolute path to the directory containing images
OLD_IMAGE_NAME = "indoPak.png" # Optional: Used for verification logging
NEW_IMAGE_NAME = "indoPak2.png"
# ---------------------

def change_image_source(ws: obsws, current_image_name: str, new_image_name: str):
    """
    Changes the file path of an image source in OBS.

    Args:
        ws: The OBS WebSocket client instance.
        current_image_name: The filename of the current image (used for logging).
        new_image_name: The filename of the new image to set.
    """
    try:
        # Get current settings to verify the source and current image
        response = ws.call(requests.GetInputSettings(inputName=SOURCE_NAME))

        settings = None
        # Access settings directly via the 'datain' attribute (based on observed behavior)
        if hasattr(response, 'datain') and isinstance(response.datain, dict) and 'inputSettings' in response.datain:
            settings = response.datain['inputSettings']
        else:
            logging.error(f"Could not extract 'inputSettings' from GetInputSettings response for '{SOURCE_NAME}'.")
            logging.error(f"Raw response (for debugging): {response}") # Keep raw response log on failure
            return # Exit if settings cannot be retrieved

        # Optional: Verify the current image is the expected one
        current_file_path = settings.get('file')
        expected_current_path = os.path.join(IMAGE_DIR, current_image_name)
        if current_file_path != expected_current_path:
            logging.warning(
                f"Source '{SOURCE_NAME}' current file ('{os.path.basename(current_file_path) if current_file_path else 'None'}') "
                f"does not match expected old image ('{current_image_name}'). Proceeding anyway."
            )

        # Construct the full path for the new image
        new_file_path = os.path.join(IMAGE_DIR, new_image_name)

        # Check if the new image file exists locally before telling OBS to use it
        if not os.path.exists(new_file_path):
            logging.error(f"New image file not found locally at path: {new_file_path}")
            return

        # Set the new image file path in OBS
        new_settings = {'file': new_file_path}
        ws.call(requests.SetInputSettings(inputName=SOURCE_NAME, inputSettings=new_settings, overlay=True))
        logging.info(f"Successfully requested OBS to change source '{SOURCE_NAME}' image to '{new_image_name}'.")

    except exceptions.ConnectionFailure:
        # This might occur if connection drops mid-operation
        logging.error("Connection to OBS failed during operation.")
    except Exception as e:
        # Catch-all for other potential errors during the process
        logging.error(f"An unexpected error occurred while changing source '{SOURCE_NAME}': {e}")
        import traceback
        logging.debug(traceback.format_exc()) # Log traceback only in debug

def main():
    ws = None # Initialize ws to None for finally block
    try:
        ws = obsws(OBS_HOST, OBS_PORT, OBS_PASSWORD)
        logging.info(f"Connecting to OBS WebSocket at {OBS_HOST}:{OBS_PORT}...")
        ws.connect()
        logging.info("Successfully connected to OBS.")

        # Perform the image change
        change_image_source(ws, OLD_IMAGE_NAME, NEW_IMAGE_NAME)

    except exceptions.ConnectionFailure as e:
        logging.error(f"Could not connect to OBS: {e}")
        logging.error("Please ensure OBS is running, the WebSocket server is enabled, and the host/port/password are correct.")
        sys.exit(1) # Exit if connection fails
    except Exception as e:
         # Catch other unexpected errors during connection/setup
         logging.error(f"An error occurred during connection or initial setup: {e}")
         import traceback
         logging.debug(traceback.format_exc()) # Log traceback only in debug
         sys.exit(1)
    finally:
        # Ensure disconnection even if errors occurred
        if ws and hasattr(ws, 'disconnect'): # Check if ws was initialized and has disconnect
            logging.info("Disconnecting from OBS.")
            ws.disconnect()

if __name__ == "__main__":
    main()
    # Consider adding logging level configuration via command-line arguments for flexibility
    # Example: logging.basicConfig(level=logging.DEBUG) for more verbose output