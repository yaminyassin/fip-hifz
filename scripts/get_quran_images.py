import base64
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os

def main():
    """
    Fetches documents from the 'quran' collection in Firestore,
    decodes a base64 string from the 'page' field, and saves it as a PNG
    image using the 'filename' field for the name.
    """
    try:
        # Initialize Firebase Admin SDK
        # Option 1: Use a service account key file (e.g., serviceAccountKey.json)
        # Make sure 'serviceAccountKey.json' is in the same directory as this script,
        # or provide the correct path.
        # cred = credentials.Certificate("path/to/your/serviceAccountKey.json") # Replace with your actual path

        # Option 2: If GOOGLE_APPLICATION_CREDENTIALS environment variable is set,
        # Firebase Admin SDK will automatically use it.
        # If neither is set, this will raise an error.
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
        elif os.path.exists("serviceAccountKey.json"):
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using serviceAccountKey.json.")
        else:
            print("Error: Firebase credentials not found.")
            print("Please either set the GOOGLE_APPLICATION_CREDENTIALS environment variable")
            print("or place 'serviceAccountKey.json' in the script's directory.")
            return

    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        print("Ensure you have set up your credentials correctly.")
        print("For local development, you might need to download a service account key JSON file from your Firebase project settings.")
        print("And either place it as 'serviceAccountKey.json' in the script directory or set the GOOGLE_APPLICATION_CREDENTIALS environment variable to its path.")
        return

    db = firestore.client()
    quran_collection_ref = db.collection('quran')

    # Create a directory to save images if it doesn't exist
    output_dir = "quran_images"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created directory: {output_dir}")

    print(f"Fetching documents from '{quran_collection_ref.id}' collection...")

    try:
        docs = quran_collection_ref.stream()
        doc_count = 0
        processed_count = 0

        for doc in docs:
            doc_count += 1
            doc_data = doc.to_dict()
            doc_id = doc.id

            page_base64 = doc_data.get('page')
            filename = doc_data.get('filename')

            if not page_base64:
                print(f"Warning: Document '{doc_id}' is missing 'page' field or it's empty. Skipping.")
                continue

            if not filename:
                print(f"Warning: Document '{doc_id}' is missing 'filename' field or it's empty. Skipping.")
                continue

            # Ensure filename has a .png extension, add if missing
            if not filename.lower().endswith(".png"):
                filename_with_ext = filename + ".png"
                print(f"Info: Document '{doc_id}' filename '{filename}' does not end with .png. Appending .png to get '{filename_with_ext}'.")
            else:
                filename_with_ext = filename
            
            # Sanitize filename to prevent directory traversal or invalid characters
            # Basic sanitization: remove path components and replace invalid chars
            sanitized_filename = os.path.basename(filename_with_ext)
            sanitized_filename = "".join(c if c.isalnum() or c in ('.', '_', '-') else '_' for c in sanitized_filename)


            if not sanitized_filename:
                print(f"Warning: Document '{doc_id}' resulted in an empty sanitized filename for original '{filename}'. Skipping.")
                continue


            image_path = os.path.join(output_dir, sanitized_filename)

            try:
                # Remove the "data:image/png;base64," prefix if it exists
                if page_base64.startswith("data:image/png;base64,"):
                    page_base64 = page_base64.split(",", 1)[1]
                
                image_data = base64.b64decode(page_base64)
                
                with open(image_path, "wb") as image_file:
                    image_file.write(image_data)
                
                print(f"Successfully saved '{sanitized_filename}' from document '{doc_id}' to '{image_path}'")
                processed_count += 1

            except base64.binascii.Error as b64_error:
                print(f"Error decoding base64 for document '{doc_id}', filename '{filename}': {b64_error}. Skipping.")
            except IOError as io_error:
                print(f"Error saving image for document '{doc_id}', filename '{filename}' to '{image_path}': {io_error}. Skipping.")
            except Exception as e:
                print(f"An unexpected error occurred while processing document '{doc_id}', filename '{filename}': {e}. Skipping.")
        
        if doc_count == 0:
            print(f"No documents found in the '{quran_collection_ref.id}' collection.")
        else:
            print(f"Processed {processed_count} out of {doc_count} documents from '{quran_collection_ref.id}'.")


    except Exception as e:
        print(f"Error fetching documents from Firestore: {e}")

if __name__ == "__main__":
    main()
