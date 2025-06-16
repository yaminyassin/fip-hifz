#!/usr/bin/env python3
"""
Cleanup Old Scores Script

This script deletes documents from the 'scores' collection where the 'updatedAt' field 
is older than today's date.

DANGER: This script performs permanent deletions. Use with caution!

Usage:
    export GOOGLE_APPLICATION_CREDENTIALS=google-services-key.json
    python scripts/cleanup_old_scores.py [--dry-run] [--confirm]
"""

import os
import sys
import argparse
from datetime import datetime, timezone
from typing import List, Dict, Any
import firebase_admin
from firebase_admin import credentials, firestore


def initialize_firebase():
    """Initialize Firebase Admin SDK"""
    try:
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
        elif os.path.exists("google-services-key.json"):
            cred = credentials.Certificate("google-services-key.json")
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using google-services-key.json.")
        else:
            print("Error: Firebase credentials not found.")
            print("Please either set the GOOGLE_APPLICATION_CREDENTIALS environment variable")
            print("or place 'google-services-key.json' in the script's directory.")
            return None
    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return None
    
    return firestore.client()


def get_todays_date():
    """Get today's date at midnight UTC"""
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return today


def find_old_scores(db, cutoff_date):
    """Find score documents with updatedAt older than cutoff_date"""
    print(f"\n🔍 Searching for score documents updated before {cutoff_date.strftime('%Y-%m-%d %H:%M:%S UTC')}...")
    
    old_documents = []
    total_docs = 0
    docs_without_updated_at = 0
    
    try:
        # Get all documents from scores collection
        docs = db.collection('scores').stream()
        
        for doc in docs:
            total_docs += 1
            data = doc.to_dict()
            doc_id = doc.id
            
            updated_at = data.get('updatedAt')
            
            if updated_at is None:
                docs_without_updated_at += 1
                print(f"⚠️  Document '{doc_id}' has no 'updatedAt' field")
                continue
            
            # Convert Firestore timestamp to datetime
            if hasattr(updated_at, 'seconds'):
                # Firestore Timestamp object
                updated_at_datetime = datetime.fromtimestamp(updated_at.seconds, tz=timezone.utc)
            elif isinstance(updated_at, datetime):
                # Already a datetime object
                updated_at_datetime = updated_at.replace(tzinfo=timezone.utc) if updated_at.tzinfo is None else updated_at
            else:
                print(f"⚠️  Document '{doc_id}' has invalid 'updatedAt' format: {type(updated_at)}")
                continue
            
            # Check if this document is older than cutoff
            if updated_at_datetime < cutoff_date:
                participant_id = data.get('participantId', 'Unknown')
                jury_id = data.get('juryId', 'Unknown')
                question_number = data.get('questionNumber', 'Unknown')
                
                old_documents.append({
                    'id': doc_id,
                    'participantId': participant_id,
                    'juryId': jury_id,
                    'questionNumber': question_number,
                    'updatedAt': updated_at_datetime,
                    'ref': doc.reference
                })
        
        print(f"\n📊 Search Results:")
        print(f"   Total documents in scores collection: {total_docs}")
        print(f"   Documents without 'updatedAt' field: {docs_without_updated_at}")
        print(f"   Documents older than cutoff date: {len(old_documents)}")
        
        return old_documents
        
    except Exception as e:
        print(f"❌ Error searching for old documents: {e}")
        return []


def show_deletion_preview(old_documents: List[Dict[str, Any]], limit: int = 10):
    """Show a preview of documents that will be deleted"""
    if not old_documents:
        print("✅ No documents found for deletion.")
        return
    
    print(f"\n📋 Documents to be deleted ({len(old_documents)} total):")
    print("-" * 80)
    print(f"{'Document ID':<30} {'Participant':<15} {'Jury':<15} {'Question':<8} {'Updated At'}")
    print("-" * 80)
    
    for i, doc in enumerate(old_documents[:limit]):
        updated_str = doc['updatedAt'].strftime('%Y-%m-%d %H:%M')
        print(f"{doc['id']:<30} {doc['participantId']:<15} {doc['juryId']:<15} {doc['questionNumber']:<8} {updated_str}")
    
    if len(old_documents) > limit:
        print(f"... and {len(old_documents) - limit} more documents")
    print("-" * 80)


def confirm_deletion(old_documents: List[Dict[str, Any]]) -> bool:
    """Ask user to confirm deletion"""
    if not old_documents:
        return False
    
    print(f"\n⚠️  WARNING: You are about to delete {len(old_documents)} documents permanently!")
    print("This action cannot be undone.")
    
    response = input("\nType 'DELETE' to confirm deletion (case-sensitive): ")
    return response == "DELETE"


def delete_documents(db, old_documents: List[Dict[str, Any]], dry_run: bool = False):
    """Delete the old documents"""
    if not old_documents:
        print("✅ No documents to delete.")
        return True
    
    if dry_run:
        print(f"\n🔍 DRY RUN: Would delete {len(old_documents)} documents")
        return True
    
    print(f"\n🗑️  Deleting {len(old_documents)} documents...")
    
    deleted_count = 0
    failed_count = 0
    
    try:
        # Delete in batches to avoid timeouts
        batch_size = 100
        
        for i in range(0, len(old_documents), batch_size):
            batch = old_documents[i:i + batch_size]
            batch_num = (i // batch_size) + 1
            total_batches = (len(old_documents) + batch_size - 1) // batch_size
            
            print(f"   Processing batch {batch_num}/{total_batches} ({len(batch)} documents)...")
            
            # Create a batch operation
            firestore_batch = db.batch()
            
            for doc in batch:
                firestore_batch.delete(doc['ref'])
            
            # Commit the batch
            try:
                firestore_batch.commit()
                deleted_count += len(batch)
                print(f"   ✅ Batch {batch_num} completed ({len(batch)} documents deleted)")
            except Exception as e:
                failed_count += len(batch)
                print(f"   ❌ Batch {batch_num} failed: {e}")
        
        print(f"\n📊 Deletion Summary:")
        print(f"   Successfully deleted: {deleted_count}")
        print(f"   Failed to delete: {failed_count}")
        print(f"   Total processed: {deleted_count + failed_count}")
        
        return failed_count == 0
        
    except Exception as e:
        print(f"❌ Error during deletion: {e}")
        return False


def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Delete old score documents from Firestore')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be deleted without actually deleting')
    parser.add_argument('--confirm', action='store_true', help='Skip confirmation prompt (use with caution!)')
    parser.add_argument('--cutoff-days', type=int, default=0, help='Delete documents older than N days ago (default: 0 = today)')
    
    args = parser.parse_args()
    
    print("🧹 Cleanup Old Scores Script")
    print("=" * 50)
    
    if args.dry_run:
        print("🔍 Running in DRY RUN mode - no deletions will be performed")
    
    # Initialize Firebase
    db = initialize_firebase()
    if db is None:
        sys.exit(1)
    
    # Calculate cutoff date
    today = get_todays_date()
    if args.cutoff_days > 0:
        from datetime import timedelta
        cutoff_date = today - timedelta(days=args.cutoff_days)
    else:
        cutoff_date = today
    
    print(f"🗓️  Cutoff date: {cutoff_date.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"   (Documents updated before this date will be deleted)")
    
    # Find old documents
    old_documents = find_old_scores(db, cutoff_date)
    
    # Show preview
    show_deletion_preview(old_documents)
    
    if not old_documents:
        print("✅ No old documents found. Nothing to delete.")
        return
    
    # Confirm deletion (unless --confirm flag is used)
    if not args.dry_run and not args.confirm:
        if not confirm_deletion(old_documents):
            print("❌ Deletion cancelled by user.")
            return
    
    # Delete documents
    success = delete_documents(db, old_documents, dry_run=args.dry_run)
    
    if success and not args.dry_run:
        print("\n✅ Cleanup completed successfully!")
    elif args.dry_run:
        print("\n🔍 Dry run completed. Use --confirm to actually delete the documents.")
    else:
        print("\n❌ Cleanup completed with errors. Please check the logs above.")
        sys.exit(1)


if __name__ == "__main__":
    main() 