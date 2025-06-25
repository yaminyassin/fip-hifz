#!/usr/bin/env python3
"""
Resume script to migrate just the quran collection with optimized settings.
This script is specifically designed for handling large documents with timeouts.

Usage: python scripts/resume_quran_migration.py
"""

import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, List, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore

# Configuration
EVENT_NAME = "lisbon-2025"
COLLECTION_NAME = "quran"
BATCH_SIZE = 2  # Very small batch size for large documents
MAX_RETRIES = 5
RETRY_DELAY = 3  # seconds between retries
BATCH_DELAY = 2  # seconds between batches

class QuranMigration:
    def __init__(self):
        """Initialize Firebase Admin SDK."""
        try:
            # Initialize Firebase Admin SDK
            service_account_path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                'firebase-service-account.json'
            )
            
            if not os.path.exists(service_account_path):
                print(f"❌ Service account file not found at: {service_account_path}")
                print("Please ensure firebase-service-account.json is in the project root.")
                sys.exit(1)
            
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred)
            self.db = firestore.client()
            print("✅ Firebase initialized successfully")
            
        except Exception as e:
            print(f"❌ Failed to initialize Firebase: {e}")
            sys.exit(1)
    
    def get_quran_documents(self) -> List[Dict[str, Any]]:
        """Get all documents from the quran collection."""
        print(f"📦 Fetching documents from {COLLECTION_NAME} collection...")
        documents = []
        
        try:
            collection_ref = self.db.collection(COLLECTION_NAME)
            docs = collection_ref.stream()
            
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['__id__'] = doc.id
                documents.append(doc_data)
            
            print(f"  ✅ Found {len(documents)} documents")
            return documents
            
        except Exception as e:
            print(f"  ❌ Error fetching documents: {e}")
            return []
    
    def check_existing_migration(self) -> List[str]:
        """Check which documents have already been migrated."""
        print("🔍 Checking for existing migrated documents...")
        migrated_ids = []
        
        try:
            new_collection_ref = self.db.collection('events').document(EVENT_NAME).collection(COLLECTION_NAME)
            docs = new_collection_ref.stream()
            
            for doc in docs:
                migrated_ids.append(doc.id)
            
            print(f"  ✅ Found {len(migrated_ids)} already migrated documents")
            return migrated_ids
            
        except Exception as e:
            print(f"  ❌ Error checking existing migration: {e}")
            return []
    
    def migrate_quran_documents(self, documents: List[Dict[str, Any]], skip_ids: List[str]):
        """Migrate quran documents with special handling for large files."""
        # Filter out already migrated documents
        documents_to_migrate = [doc for doc in documents if doc['__id__'] not in skip_ids]
        
        if not documents_to_migrate:
            print("✅ All documents have already been migrated!")
            return
        
        print(f"\n🚀 Migrating {len(documents_to_migrate)} remaining documents (batch size: {BATCH_SIZE})")
        print(f"   Skipping {len(skip_ids)} already migrated documents")
        
        # New collection reference under event
        new_collection_ref = self.db.collection('events').document(EVENT_NAME).collection(COLLECTION_NAME)
        
        # Process in very small batches
        for i in range(0, len(documents_to_migrate), BATCH_SIZE):
            batch_docs = documents_to_migrate[i:i + BATCH_SIZE]
            batch_number = i // BATCH_SIZE + 1
            total_batches = (len(documents_to_migrate) + BATCH_SIZE - 1) // BATCH_SIZE
            
            print(f"\n📝 Processing batch {batch_number}/{total_batches} ({len(batch_docs)} documents)")
            
            # Retry logic for each batch
            for attempt in range(MAX_RETRIES):
                try:
                    batch = self.db.batch()
                    
                    for doc_data in batch_docs:
                        doc_id = doc_data['__id__']
                        doc_data_clean = {k: v for k, v in doc_data.items() if k != '__id__'}
                        doc_ref = new_collection_ref.document(doc_id)
                        batch.set(doc_ref, doc_data_clean)
                        print(f"   📄 Queued: {doc_id}")
                    
                    print(f"   💾 Committing batch...")
                    batch.commit()
                    print(f"  ✅ Successfully migrated batch {batch_number}/{total_batches}")
                    
                    # Longer delay between batches for large documents
                    if batch_number < total_batches:
                        print(f"   ⏳ Waiting {BATCH_DELAY}s before next batch...")
                        time.sleep(BATCH_DELAY)
                    
                    break  # Success, break retry loop
                    
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
                            print(f"     Documents in this batch:")
                            for doc in batch_docs:
                                print(f"       - {doc['__id__']}")
                            raise Exception(f"Failed to migrate batch {batch_number} after {MAX_RETRIES} attempts: {error_msg}")
                    else:
                        print(f"  ❌ Error migrating batch {batch_number}: {e}")
                        raise
    
    def verify_migration(self, total_expected: int):
        """Verify that migration was successful."""
        try:
            new_collection_ref = self.db.collection('events').document(EVENT_NAME).collection(COLLECTION_NAME)
            migrated_docs = list(new_collection_ref.stream())
            migrated_count = len(migrated_docs)
            
            if migrated_count == total_expected:
                print(f"✅ Migration verified: {migrated_count}/{total_expected} documents")
                return True
            else:
                print(f"⚠️  Partial migration: {migrated_count}/{total_expected} documents")
                return False
        except Exception as e:
            print(f"❌ Error verifying migration: {e}")
            return False
    
    def run_migration(self):
        """Run the quran collection migration."""
        print("🔄 Quran Collection Migration Tool")
        print("=" * 50)
        print(f"Event: {EVENT_NAME}")
        print(f"Collection: {COLLECTION_NAME}")
        print(f"Batch size: {BATCH_SIZE}")
        print(f"Max retries: {MAX_RETRIES}")
        print("=" * 50)
        
        # Step 1: Get all quran documents
        documents = self.get_quran_documents()
        if not documents:
            print("❌ No documents found to migrate")
            return
        
        # Step 2: Check what's already migrated
        migrated_ids = self.check_existing_migration()
        
        # Step 3: Migrate remaining documents
        self.migrate_quran_documents(documents, migrated_ids)
        
        # Step 4: Verify migration
        print("\n📋 Verifying migration...")
        if self.verify_migration(len(documents)):
            print("\n🎉 Quran collection migration completed successfully!")
        else:
            print("\n⚠️  Migration may be incomplete. Check the logs above.")

def main():
    """Main entry point."""
    print("⚠️  This script will migrate the quran collection to the new event structure.")
    response = input("Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Migration cancelled.")
        return
    
    migration = QuranMigration()
    migration.run_migration()

if __name__ == "__main__":
    main() 