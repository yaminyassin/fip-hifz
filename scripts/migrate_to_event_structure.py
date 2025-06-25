#!/usr/bin/env python3
"""
Migration script to move existing Firestore data to event-based structure.
Migrates from root collections to /events/lisbon-2025/

Usage: python scripts/migrate_to_event_structure.py
"""

import os
import sys
import json
import time
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.base_query import FieldFilter

# Configuration
EVENT_NAME = "lisbon-2025"
BATCH_SIZE = 500  # Default Firestore batch limit
DRY_RUN = False  # Set to False to actually perform migration

# Collections to migrate with their specific batch sizes
COLLECTIONS_TO_MIGRATE = {
    "app_config": 100,
    "jury": 100, 
    "overallBonuses": 200,
    "participants": 100,
    "quran": 5,  # Very small batch for large documents (images)
    "scores": 200
}

# Retry configuration
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds between retries
BATCH_DELAY = 1  # seconds between batches

class FirestoreMigration:
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
    
    def backup_collection(self, collection_name: str) -> List[Dict[str, Any]]:
        """Backup a collection to memory."""
        print(f"📦 Backing up collection: {collection_name}")
        documents = []
        
        try:
            collection_ref = self.db.collection(collection_name)
            docs = collection_ref.stream()
            
            for doc in docs:
                doc_data = doc.to_dict()
                doc_data['__id__'] = doc.id  # Store document ID
                documents.append(doc_data)
            
            print(f"  ✅ Backed up {len(documents)} documents from {collection_name}")
            return documents
            
        except Exception as e:
            print(f"  ❌ Error backing up {collection_name}: {e}")
            return []
    
    def create_backup_file(self, backup_data: Dict[str, List[Dict[str, Any]]]):
        """Create a backup JSON file."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = f"backup_before_migration_{timestamp}.json"
        
        try:
            with open(backup_path, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False, default=str)
            print(f"💾 Backup saved to: {backup_path}")
            return backup_path
        except Exception as e:
            print(f"❌ Failed to save backup: {e}")
            return None
    
    def migrate_collection(self, collection_name: str, documents: List[Dict[str, Any]]):
        """Migrate a collection to event structure."""
        if not documents:
            print(f"⏭️  Skipping {collection_name} (no documents)")
            return
        
        # Get collection-specific batch size
        batch_size = COLLECTIONS_TO_MIGRATE.get(collection_name, BATCH_SIZE)
        print(f"\n🚀 Migrating {collection_name} ({len(documents)} documents, batch size: {batch_size})")
        
        if DRY_RUN:
            print("  🔍 DRY RUN - No actual changes will be made")
            print(f"  Would migrate to: /events/{EVENT_NAME}/{collection_name}/")
            return
        
        # New collection reference under event
        new_collection_ref = self.db.collection('events').document(EVENT_NAME).collection(collection_name)
        
        # Process in batches
        for i in range(0, len(documents), batch_size):
            batch_docs = documents[i:i + batch_size]
            batch_number = i // batch_size + 1
            total_batches = (len(documents) + batch_size - 1) // batch_size
            
            # Retry logic for each batch
            for attempt in range(MAX_RETRIES):
                try:
                    batch = self.db.batch()
                    
                    for doc_data in batch_docs:
                        doc_id = doc_data['__id__']  # Don't pop, keep for retries
                        doc_data_clean = {k: v for k, v in doc_data.items() if k != '__id__'}
                        doc_ref = new_collection_ref.document(doc_id)
                        batch.set(doc_ref, doc_data_clean)
                    
                    batch.commit()
                    print(f"  ✅ Migrated batch {batch_number}/{total_batches} ({len(batch_docs)} documents)")
                    
                    # Small delay between successful batches
                    if batch_number < total_batches:
                        time.sleep(BATCH_DELAY)
                    
                    break  # Success, break retry loop
                    
                except Exception as e:
                    error_msg = str(e)
                    if "deadline exceeded" in error_msg.lower() or "timeout" in error_msg.lower():
                        if attempt < MAX_RETRIES - 1:
                            print(f"  ⏳ Timeout on batch {batch_number}/{total_batches}, retry {attempt + 1}/{MAX_RETRIES}")
                            time.sleep(RETRY_DELAY * (attempt + 1))  # Exponential backoff
                            continue
                        else:
                            print(f"  ❌ Final timeout on batch {batch_number}/{total_batches} after {MAX_RETRIES} attempts")
                            print(f"     Batch range: documents {i} to {i + len(batch_docs) - 1}")
                            raise Exception(f"Failed to migrate batch {batch_number} after {MAX_RETRIES} attempts: {error_msg}")
                    else:
                        print(f"  ❌ Error migrating batch {batch_number}/{total_batches}: {e}")
                        raise
    
    def verify_migration(self, collection_name: str, original_count: int):
        """Verify that migration was successful."""
        if DRY_RUN:
            return True
        
        try:
            new_collection_ref = self.db.collection('events').document(EVENT_NAME).collection(collection_name)
            migrated_count = len(list(new_collection_ref.limit(original_count + 1).stream()))
            
            if migrated_count == original_count:
                print(f"  ✅ Verified: {migrated_count} documents in new location")
                return True
            else:
                print(f"  ⚠️  Warning: Expected {original_count} documents, found {migrated_count}")
                return False
        except Exception as e:
            print(f"  ❌ Error verifying migration: {e}")
            return False
    
    def delete_original_collection(self, collection_name: str):
        """Delete original collection after successful migration."""
        if DRY_RUN:
            print(f"  🔍 DRY RUN - Would delete original collection: {collection_name}")
            return
        
        print(f"  🗑️  Deleting original collection: {collection_name}")
        try:
            collection_ref = self.db.collection(collection_name)
            
            # Delete in batches
            while True:
                docs = collection_ref.limit(BATCH_SIZE).stream()
                batch = self.db.batch()
                doc_count = 0
                
                for doc in docs:
                    batch.delete(doc.reference)
                    doc_count += 1
                
                if doc_count == 0:
                    break
                
                batch.commit()
                print(f"    Deleted batch of {doc_count} documents")
            
            print(f"  ✅ Original collection deleted")
        except Exception as e:
            print(f"  ❌ Error deleting collection: {e}")
            raise
    
    def run_migration(self):
        """Run the complete migration process."""
        print(f"\n🎯 Starting migration to event structure: /events/{EVENT_NAME}/")
        print(f"{'🔍 DRY RUN MODE' if DRY_RUN else '⚡ LIVE MODE'}")
        print("=" * 60)
        
        # Step 1: Backup all collections
        print("\n📋 Step 1: Backing up all collections...")
        backup_data = {}
        collection_counts = {}
        
        for collection in COLLECTIONS_TO_MIGRATE.keys():
            documents = self.backup_collection(collection)
            backup_data[collection] = documents
            collection_counts[collection] = len(documents)
        
        # Step 2: Save backup to file
        print("\n📋 Step 2: Saving backup file...")
        backup_path = self.create_backup_file(backup_data)
        if not backup_path and not DRY_RUN:
            print("❌ Failed to create backup. Aborting migration.")
            return
        
        # Step 3: Migrate collections
        print("\n📋 Step 3: Migrating collections to event structure...")
        for collection, documents in backup_data.items():
            self.migrate_collection(collection, documents)
        
        # Step 4: Verify migration
        if not DRY_RUN:
            print("\n📋 Step 4: Verifying migration...")
            all_verified = True
            for collection in COLLECTIONS_TO_MIGRATE.keys():
                if not self.verify_migration(collection, collection_counts[collection]):
                    all_verified = False
            
            if not all_verified:
                print("\n⚠️  Some collections were not fully verified. Please check manually.")
                print("Original collections have NOT been deleted.")
                return
        
        # Step 5: Delete original collections (only if verified)
        if not DRY_RUN:
            print("\n📋 Step 5: Cleaning up original collections...")
            response = input("\n⚠️  Delete original collections? This cannot be undone! (yes/no): ")
            if response.lower() == 'yes':
                for collection in COLLECTIONS_TO_MIGRATE.keys():
                    self.delete_original_collection(collection)
            else:
                print("Original collections preserved.")
        
        print("\n✅ Migration completed successfully!")
        print(f"📍 New data location: /events/{EVENT_NAME}/")
        if backup_path:
            print(f"💾 Backup saved at: {backup_path}")


def main():
    """Main entry point."""
    print("🔄 Firestore Event Structure Migration Tool")
    print("=" * 60)
    
    if DRY_RUN:
        print("ℹ️  Running in DRY RUN mode - no changes will be made")
        print("   Set DRY_RUN = False in the script to perform actual migration")
    else:
        print("⚠️  WARNING: This will restructure your Firestore database!")
        print("   Make sure you have a backup before proceeding.")
        response = input("\nContinue with migration? (yes/no): ")
        if response.lower() != 'yes':
            print("Migration cancelled.")
            return
    
    migration = FirestoreMigration()
    migration.run_migration()


if __name__ == "__main__":
    main() 