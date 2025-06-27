#!/usr/bin/env python3
"""
Upload Quran images to Firestore with batch processing and robust error handling.
This script processes PNG images in batches with retry logic to prevent overloading.

Usage: python scripts/upload_quran_images.py
"""

import base64
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os
import sys
import time
from pathlib import Path
from typing import List, Dict, Any, Tuple

# Configuration
BATCH_SIZE = 5  # Number of images to process in each batch
MAX_RETRIES = 5  # Maximum retry attempts for failed batches
RETRY_DELAY = 3  # seconds between retries
BATCH_DELAY = 2  # seconds between batches to prevent overloading
COLLECTION_NAME = 'quran'

class QuranImageUploader:
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

    def find_quran_images_directory(self) -> Path:
        """Find the quran images directory, trying multiple common locations."""
        script_dir = Path(__file__).parent
        workspace_root = script_dir.parent
        
        # Possible locations for quran images
        possible_locations = [
            Path("~/Downloads/small").expanduser(),
            workspace_root / "obs" / "assets" / "quran",
            workspace_root / "assets" / "quran",
            workspace_root / "quran_images",
            script_dir / "quran_images",
        ]
        
        for location in possible_locations:
            if location.exists() and list(location.glob("*.png")):
                print(f"✅ Found quran images directory: {location}")
                return location
        
        # If not found, prompt user
        print("❌ Quran images directory not found in common locations:")
        for loc in possible_locations:
            print(f"  - {loc}")
        
        custom_path = input("\nPlease enter the full path to the quran images directory: ").strip()
        custom_path = Path(custom_path).expanduser()
        
        if not custom_path.exists():
            print(f"❌ Directory not found: {custom_path}")
            sys.exit(1)
        
        return custom_path

    def get_png_files(self, directory: Path) -> List[Path]:
        """Get all PNG files from directory and sort them numerically."""
        png_files = list(directory.glob("*.png"))
        
        if not png_files:
            print("❌ No PNG files found in the directory.")
            sys.exit(1)
        
        # Sort files by numeric value in filename
        def get_page_number(filename):
            try:
                return int(filename.stem)
            except ValueError:
                return float('inf')  # Put non-numeric files at the end
        
        png_files.sort(key=get_page_number)
        return png_files

    def check_existing_uploads(self) -> List[str]:
        """Check which documents have already been uploaded."""
        print("🔍 Checking for existing uploaded documents...")
        existing_ids = []
        
        try:
            collection_ref = self.db.collection(COLLECTION_NAME)
            docs = collection_ref.stream()
            
            for doc in docs:
                existing_ids.append(doc.id)
            
            print(f"  ✅ Found {len(existing_ids)} existing documents")
            return existing_ids
            
        except Exception as e:
            print(f"  ❌ Error checking existing uploads: {e}")
            return []

    def prepare_image_data(self, png_file: Path) -> Dict[str, Any]:
        """Convert image file to base64 and prepare document data."""
        try:
            # Read the image file
            with open(png_file, "rb") as image_file:
                image_data = image_file.read()
            
            # Convert to base64
            base64_data = base64.b64encode(image_data).decode('utf-8')
            
            # Add data URL prefix for consistency
            page_data = f"data:image/png;base64,{base64_data}"
            
            # Get page number for sorting
            def get_page_number(filename):
                try:
                    return int(filename.stem)
                except ValueError:
                    return 0
            
            # Create document data
            doc_data = {
                'filename': png_file.name,
                'page': page_data,
                'pageNumber': get_page_number(png_file),
                'uploadedAt': firestore.SERVER_TIMESTAMP
            }
            
            return doc_data
            
        except Exception as e:
            print(f"❌ Error preparing data for {png_file.name}: {e}")
            return None

    def upload_batch(self, batch_files: List[Path], batch_number: int, total_batches: int) -> Tuple[List[str], List[str]]:
        """Upload a batch of images with retry logic."""
        print(f"\n📝 Processing batch {batch_number}/{total_batches} ({len(batch_files)} images)")
        
        collection_ref = self.db.collection(COLLECTION_NAME)
        uploaded = []
        failed = []
        
        # Retry logic for each batch
        for attempt in range(MAX_RETRIES):
            try:
                batch = self.db.batch()
                batch_data = []
                
                # Prepare all documents in the batch
                for png_file in batch_files:
                    doc_data = self.prepare_image_data(png_file)
                    if doc_data:
                        doc_id = png_file.stem
                        doc_ref = collection_ref.document(doc_id)
                        batch.set(doc_ref, doc_data)
                        batch_data.append((doc_id, png_file.name))
                        print(f"   📄 Queued: {png_file.name} -> Document ID: {doc_id}")
                    else:
                        failed.append(png_file.name)
                
                if batch_data:
                    print(f"   💾 Committing batch...")
                    batch.commit()
                    print(f"  ✅ Successfully uploaded batch {batch_number}/{total_batches}")
                    
                    for doc_id, filename in batch_data:
                        uploaded.append(filename)
                    
                    # Delay between batches to prevent overloading
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
                        print(f"     Images in this batch:")
                        for png_file in batch_files:
                            print(f"       - {png_file.name}")
                            failed.append(png_file.name)
                        break
                else:
                    print(f"  ❌ Error uploading batch {batch_number}: {e}")
                    for png_file in batch_files:
                        failed.append(png_file.name)
                    break
        
        return uploaded, failed

    def verify_uploads(self, expected_files: List[Path]) -> bool:
        """Verify that all files were uploaded successfully."""
        print("\n📋 Verifying uploads...")
        try:
            collection_ref = self.db.collection(COLLECTION_NAME)
            uploaded_docs = list(collection_ref.stream())
            uploaded_count = len(uploaded_docs)
            expected_count = len(expected_files)
            
            if uploaded_count >= expected_count:
                print(f"✅ Upload verification successful: {uploaded_count} documents in Firestore")
                return True
            else:
                print(f"⚠️  Partial upload detected: {uploaded_count}/{expected_count} documents")
                
                # Find missing files
                uploaded_ids = {doc.id for doc in uploaded_docs}
                missing_files = [f for f in expected_files if f.stem not in uploaded_ids]
                
                if missing_files:
                    print("❌ Missing files:")
                    for missing_file in missing_files[:10]:  # Show first 10 missing files
                        print(f"   - {missing_file.name}")
                    if len(missing_files) > 10:
                        print(f"   ... and {len(missing_files) - 10} more")
                
                return False
                
        except Exception as e:
            print(f"❌ Error verifying uploads: {e}")
            return False

    def run_upload(self):
        """Run the complete upload process."""
        print("🔄 Quran Images Upload Tool")
        print("=" * 50)
        print(f"Collection: {COLLECTION_NAME}")
        print(f"Batch size: {BATCH_SIZE}")
        print(f"Max retries: {MAX_RETRIES}")
        print("=" * 50)
        
        # Step 1: Find quran images directory
        quran_images_dir = self.find_quran_images_directory()
        
        # Step 2: Get all PNG files
        png_files = self.get_png_files(quran_images_dir)
        print(f"✅ Found {len(png_files)} PNG files to process")
        
        # Step 3: Check existing uploads
        existing_ids = self.check_existing_uploads()
        
        # Step 4: Filter out already uploaded files
        files_to_upload = [f for f in png_files if f.stem not in existing_ids]
        
        if not files_to_upload:
            print("✅ All images have already been uploaded!")
            return
        
        print(f"\n🚀 Uploading {len(files_to_upload)} remaining images (batch size: {BATCH_SIZE})")
        print(f"   Skipping {len(existing_ids)} already uploaded images")
        
        # Step 5: Process in batches
        uploaded_files = []
        failed_files = []
        
        for i in range(0, len(files_to_upload), BATCH_SIZE):
            batch_files = files_to_upload[i:i + BATCH_SIZE]
            batch_number = i // BATCH_SIZE + 1
            total_batches = (len(files_to_upload) + BATCH_SIZE - 1) // BATCH_SIZE
            
            batch_uploaded, batch_failed = self.upload_batch(batch_files, batch_number, total_batches)
            uploaded_files.extend(batch_uploaded)
            failed_files.extend(batch_failed)
        
        # Step 6: Print summary
        print(f"\n🎉 Upload process completed!")
        print(f"✅ Successfully uploaded: {len(uploaded_files)} files")
        print(f"❌ Failed uploads: {len(failed_files)} files")
        print(f"📁 Total PNG files processed: {len(files_to_upload)}")
        
        if failed_files:
            print("\n❌ Failed files:")
            for failed_file in failed_files:
                print(f"   - {failed_file}")
        
        # Step 7: Verify uploads
        if self.verify_uploads(png_files):
            print("\n🎉 All images uploaded successfully!")
        else:
            print("\n⚠️  Some images may not have been uploaded. You can re-run the script to retry.")

def main():
    """Main entry point."""
    print("⚠️  This script will upload PNG images to the Firestore quran collection.")
    print("   Existing documents will be overwritten if they have the same ID.")
    response = input("Continue? (yes/no): ")
    if response.lower() != 'yes':
        print("Upload cancelled.")
        return
    
    uploader = QuranImageUploader()
    uploader.run_upload()

if __name__ == "__main__":
    main() 