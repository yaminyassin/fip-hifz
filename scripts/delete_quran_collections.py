#!/usr/bin/env python3
"""
Delete Quran collections from Firestore with batch processing and safety checks.
This script deletes documents from:
1. Root "quran" collection
2. "events/lisbon-2025/quran" subcollection

Usage: python scripts/delete_quran_collections.py
"""

import os
import sys
import time
from datetime import datetime
from typing import List, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore

# Configuration
EVENT_NAME = "lisbon-2025"
ROOT_COLLECTION = "quran"
BATCH_SIZE = 10  # Number of documents to delete per batch
MAX_RETRIES = 3  # Maximum retry attempts for failed batches
RETRY_DELAY = 2  # seconds between retries
BATCH_DELAY = 1  # seconds between batches

class QuranCollectionDeleter:
    def __init__(self):
        """Initialize Firebase Admin SDK."""
        self.db = None
        self._initialize_firebase()
    
    def _initialize_firebase(self):
        """Initialize Firebase Admin SDK with multiple credential options."""
        try:
            # Try different credential sources in order of preference
            if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
                cred = credentials.ApplicationDefault()
                firebase_admin.initialize_app(cred)
                print("✅ Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
            elif os.path.exists("serviceAccountKey.json"):
                cred = credentials.Certificate("serviceAccountKey.json")
                firebase_admin.initialize_app(cred)
                print("✅ Initialized Firebase Admin SDK using serviceAccountKey.json.")
            elif os.path.exists("google-services-key.json"):
                cred = credentials.Certificate("google-services-key.json")
                firebase_admin.initialize_app(cred)
                print("✅ Initialized Firebase Admin SDK using google-services-key.json.")
            elif os.path.exists("firebase-service-account.json"):
                cred = credentials.Certificate("firebase-service-account.json")
                firebase_admin.initialize_app(cred)
                print("✅ Initialized Firebase Admin SDK using firebase-service-account.json.")
            else:
                print("❌ Error: Firebase credentials not found.")
                print("Please either set the GOOGLE_APPLICATION_CREDENTIALS environment variable")
                print("or place one of these files in the script's directory:")
                print("  - serviceAccountKey.json")
                print("  - google-services-key.json") 
                print("  - firebase-service-account.json")
                sys.exit(1)

            self.db = firestore.client()
            print("✅ Firebase client initialized successfully")
            
        except Exception as e:
            print(f"❌ Error initializing Firebase Admin SDK: {e}")
            sys.exit(1)

    def count_documents(self, collection_ref) -> int:
        """Count documents in a collection."""
        try:
            docs = list(collection_ref.stream())
            return len(docs)
        except Exception as e:
            print(f"❌ Error counting documents: {e}")
            return 0

    def get_document_ids(self, collection_ref, limit: int = None) -> List[str]:
        """Get document IDs from a collection."""
        try:
            query = collection_ref
            if limit:
                query = collection_ref.limit(limit)
            
            docs = query.stream()
            return [doc.id for doc in docs]
        except Exception as e:
            print(f"❌ Error fetching document IDs: {e}")
            return []

    def delete_batch(self, collection_ref, doc_ids: List[str], collection_name: str, batch_number: int, total_batches: int) -> bool:
        """Delete a batch of documents with retry logic."""
        print(f"\n📝 Deleting batch {batch_number}/{total_batches} from {collection_name} ({len(doc_ids)} documents)")
        
        # Retry logic for each batch
        for attempt in range(MAX_RETRIES):
            try:
                batch = self.db.batch()
                
                # Add delete operations to batch
                for doc_id in doc_ids:
                    doc_ref = collection_ref.document(doc_id)
                    batch.delete(doc_ref)
                    print(f"   🗑️  Queued for deletion: {doc_id}")
                
                print(f"   💾 Committing batch deletion...")
                batch.commit()
                print(f"  ✅ Successfully deleted batch {batch_number}/{total_batches} from {collection_name}")
                
                # Delay between batches
                if batch_number < total_batches:
                    print(f"   ⏳ Waiting {BATCH_DELAY}s before next batch...")
                    time.sleep(BATCH_DELAY)
                
                return True  # Success
                
            except Exception as e:
                error_msg = str(e)
                if "deadline exceeded" in error_msg.lower() or "timeout" in error_msg.lower():
                    if attempt < MAX_RETRIES - 1:
                        wait_time = RETRY_DELAY * (attempt + 1)
                        print(f"  ⏳ Timeout on batch {batch_number}, retry {attempt + 1}/{MAX_RETRIES} in {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    else:
                        print(f"  ❌ Final timeout on batch {batch_number} after {MAX_RETRIES} attempts")
                        return False
                else:
                    print(f"  ❌ Error deleting batch {batch_number}: {e}")
                    if attempt < MAX_RETRIES - 1:
                        wait_time = RETRY_DELAY * (attempt + 1)
                        print(f"  ⏳ Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    return False
        
        return False

    def delete_collection(self, collection_ref, collection_name: str) -> bool:
        """Delete all documents from a collection."""
        print(f"\n🔍 Analyzing {collection_name} collection...")
        
        # Count total documents
        total_docs = self.count_documents(collection_ref)
        
        if total_docs == 0:
            print(f"  ✅ {collection_name} collection is already empty")
            return True
        
        print(f"  📊 Found {total_docs} documents to delete")
        
        # Confirm deletion
        print(f"\n⚠️  About to delete {total_docs} documents from {collection_name}")
        response = input(f"Are you sure you want to delete ALL documents from {collection_name}? (yes/no): ")
        if response.lower() != 'yes':
            print(f"❌ Deletion of {collection_name} cancelled.")
            return False
        
        deleted_count = 0
        total_batches = (total_docs + BATCH_SIZE - 1) // BATCH_SIZE
        
        print(f"\n🚀 Starting deletion of {collection_name} (batch size: {BATCH_SIZE})")
        
        # Keep deleting until collection is empty
        batch_number = 0
        while True:
            # Get next batch of document IDs
            doc_ids = self.get_document_ids(collection_ref, BATCH_SIZE)
            
            if not doc_ids:
                break  # No more documents
            
            batch_number += 1
            
            # Delete batch
            if self.delete_batch(collection_ref, doc_ids, collection_name, batch_number, total_batches):
                deleted_count += len(doc_ids)
            else:
                print(f"❌ Failed to delete batch {batch_number} from {collection_name}")
                return False
        
        print(f"\n✅ Completed deletion of {collection_name}")
        print(f"   📊 Deleted {deleted_count} documents")
        
        return True

    def verify_deletion(self, collection_ref, collection_name: str) -> bool:
        """Verify that collection is empty."""
        try:
            remaining_docs = self.count_documents(collection_ref)
            if remaining_docs == 0:
                print(f"✅ Verification successful: {collection_name} is empty")
                return True
            else:
                print(f"⚠️  Verification failed: {remaining_docs} documents remain in {collection_name}")
                return False
        except Exception as e:
            print(f"❌ Error verifying deletion of {collection_name}: {e}")
            return False

    def run_deletion(self):
        """Run the complete deletion process."""
        print("🗑️  Quran Collections Deletion Tool")
        print("=" * 60)
        print(f"Target collections:")
        print(f"  1. Root collection: {ROOT_COLLECTION}")
        print(f"  2. Event subcollection: events/{EVENT_NAME}/{ROOT_COLLECTION}")
        print(f"Batch size: {BATCH_SIZE}")
        print(f"Max retries: {MAX_RETRIES}")
        print("=" * 60)
        
        # Final confirmation
        print("\n⚠️  WARNING: This will permanently delete ALL documents from BOTH quran collections!")
        print("This action cannot be undone.")
        final_response = input("\nType 'DELETE ALL QURAN DATA' to confirm: ")
        if final_response != 'DELETE ALL QURAN DATA':
            print("❌ Deletion cancelled. No data was deleted.")
            return
        
        success_count = 0
        
        # Delete root quran collection
        print(f"\n{'='*20} DELETING ROOT COLLECTION {'='*20}")
        root_collection_ref = self.db.collection(ROOT_COLLECTION)
        if self.delete_collection(root_collection_ref, f"root '{ROOT_COLLECTION}'"):
            success_count += 1
        
        # Delete event subcollection
        print(f"\n{'='*20} DELETING EVENT SUBCOLLECTION {'='*20}")
        event_collection_ref = (self.db.collection('events')
                               .document(EVENT_NAME)
                               .collection(ROOT_COLLECTION))
        if self.delete_collection(event_collection_ref, f"events/{EVENT_NAME}/{ROOT_COLLECTION}"):
            success_count += 1
        
        # Verification phase
        print(f"\n{'='*20} VERIFICATION {'='*20}")
        
        verification_success = 0
        
        print("\n🔍 Verifying deletions...")
        if self.verify_deletion(root_collection_ref, f"root '{ROOT_COLLECTION}'"):
            verification_success += 1
        
        if self.verify_deletion(event_collection_ref, f"events/{EVENT_NAME}/{ROOT_COLLECTION}"):
            verification_success += 1
        
        # Final summary
        print(f"\n{'='*20} SUMMARY {'='*20}")
        print(f"✅ Successfully deleted: {success_count}/2 collections")
        print(f"✅ Verified deletions: {verification_success}/2 collections")
        
        if success_count == 2 and verification_success == 2:
            print("\n🎉 All quran collections have been successfully deleted!")
        else:
            print("\n⚠️  Some deletions may have failed. Check the logs above.")

def main():
    """Main entry point."""
    print("⚠️  This script will PERMANENTLY DELETE all quran collections!")
    print("   Collections to be deleted:")
    print(f"   1. Root collection: {ROOT_COLLECTION}")
    print(f"   2. Event subcollection: events/{EVENT_NAME}/{ROOT_COLLECTION}")
    print("\n   This action CANNOT be undone!")
    
    response = input("\nDo you want to proceed? (yes/no): ")
    if response.lower() != 'yes':
        print("❌ Deletion cancelled.")
        return
    
    deleter = QuranCollectionDeleter()
    deleter.run_deletion()

if __name__ == "__main__":
    main() 