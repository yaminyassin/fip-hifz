import logging
import sys
import os
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

def delete_collection_documents(db_client, collection_name, batch_size=100):
    """Delete all documents in a collection in batches."""
    collection_ref = db_client.collection(collection_name)
    deleted_count = 0
    
    while True:
        # Get a batch of documents
        docs = collection_ref.limit(batch_size).stream()
        doc_list = list(docs)
        
        if not doc_list:
            break
        
        # Delete documents in batch
        batch = db_client.batch()
        for doc in doc_list:
            batch.delete(doc.reference)
            deleted_count += 1
            logging.info(f"Queued for deletion: {doc.id}")
        
        # Commit the batch
        batch.commit()
        logging.info(f"Deleted batch of {len(doc_list)} documents")
    
    return deleted_count

def reset_scores_collection():
    """Main function to reset the scores collection."""
    COLLECTION_NAME = "scores"
    
    # Initialize Firebase
    db_client = initialize_firebase()
    if not db_client:
        logging.critical("Firebase initialization failed. Exiting.")
        sys.exit(1)
    
    try:
        logging.info(f"Starting to reset '{COLLECTION_NAME}' collection...")
        
        # Check if collection exists and has documents
        collection_ref = db_client.collection(COLLECTION_NAME)
        sample_docs = list(collection_ref.limit(1).stream())
        
        if not sample_docs:
            logging.info(f"Collection '{COLLECTION_NAME}' is already empty or doesn't exist.")
            return
        
        # Delete all documents
        deleted_count = delete_collection_documents(db_client, COLLECTION_NAME)
        
        # Summary
        logging.info("="*50)
        logging.info("RESET SUMMARY")
        logging.info("="*50)
        logging.info(f"Collection: {COLLECTION_NAME}")
        logging.info(f"Documents deleted: {deleted_count}")
        logging.info("Reset completed successfully!")
        
    except Exception as e:
        logging.error(f"Error resetting scores collection: {e}")
        sys.exit(1)

if __name__ == "__main__":
    logging.info("Starting scores collection reset script...")
    logging.info("This script will DELETE ALL DOCUMENTS from the 'scores' collection.")
    
    # Ask for confirmation
    response = input("Are you sure you want to delete ALL scores? This action cannot be undone. (y/N): ")
    if response.lower() not in ['y', 'yes']:
        logging.info("Script cancelled by user.")
        sys.exit(0)
    
    # Double confirmation for safety
    response2 = input("Please confirm again. Type 'DELETE' to proceed: ")
    if response2 != 'DELETE':
        logging.info("Script cancelled. Confirmation not received.")
        sys.exit(0)
    
    reset_scores_collection()
    logging.info("Scores collection reset completed.") 