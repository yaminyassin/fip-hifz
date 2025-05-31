import base64
import firebase_admin
from firebase_admin import credentials
from firebase_admin import firestore
import os
from pathlib import Path

def main():
    """
    Uploads all PNG images from the obs/assets/quran folder to Firestore.
    Each image is converted to base64 and stored with its filename.
    Existing documents will be overwritten.
    """
    try:
        # Initialize Firebase Admin SDK
        if os.getenv('GOOGLE_APPLICATION_CREDENTIALS'):
            cred = credentials.ApplicationDefault()
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using GOOGLE_APPLICATION_CREDENTIALS.")
        elif os.path.exists("serviceAccountKey.json"):
            cred = credentials.Certificate("serviceAccountKey.json")
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using serviceAccountKey.json.")
        elif os.path.exists("google-services-key.json"):
            cred = credentials.Certificate("google-services-key.json")
            firebase_admin.initialize_app(cred)
            print("Initialized Firebase Admin SDK using google-services-key.json.")
        else:
            print("Error: Firebase credentials not found.")
            print("Please either set the GOOGLE_APPLICATION_CREDENTIALS environment variable")
            print("or place 'serviceAccountKey.json' or 'google-services-key.json' in the script's directory.")
            return

    except Exception as e:
        print(f"Error initializing Firebase Admin SDK: {e}")
        return

    db = firestore.client()
    quran_collection_ref = db.collection('quran')

    # Find the quran images directory
    script_dir = Path(__file__).parent
    workspace_root = script_dir.parent  # Assuming script is in scripts/ folder
    
    quran_images_dir = workspace_root / "obs" / "assets" / "quran"
    
    if not quran_images_dir.exists():
        print(f"Error: Quran images directory not found at: {quran_images_dir}")
        print("Please ensure the obs/assets/quran directory exists and contains PNG files.")
        return

    print(f"Found quran images directory: {quran_images_dir}")

    # Get all PNG files and sort them numerically
    png_files = list(quran_images_dir.glob("*.png"))
    
    if not png_files:
        print("No PNG files found in the quran images directory.")
        return
    
    # Sort files by numeric value in filename
    def get_page_number(filename):
        try:
            return int(filename.stem)
        except ValueError:
            return float('inf')  # Put non-numeric files at the end
    
    png_files.sort(key=get_page_number)
    
    print(f"Found {len(png_files)} PNG files to upload. Starting upload...")
    
    uploaded_count = 0
    failed_count = 0
    
    for png_file in png_files:
        try:
            # Read the image file
            with open(png_file, "rb") as image_file:
                image_data = image_file.read()
            
            # Convert to base64
            base64_data = base64.b64encode(image_data).decode('utf-8')
            
            # Add data URL prefix for consistency
            page_data = f"data:image/png;base64,{base64_data}"
            
            # Create document data
            doc_data = {
                'filename': png_file.name,
                'page': page_data,
                'pageNumber': get_page_number(png_file),
                'uploadedAt': firestore.SERVER_TIMESTAMP
            }
            
            # Use the filename (without extension) as the document ID
            doc_id = png_file.stem
            
            # Upload to Firestore (this will overwrite existing documents)
            quran_collection_ref.document(doc_id).set(doc_data)
            
            print(f"✓ Uploaded: {png_file.name} -> Document ID: {doc_id}")
            uploaded_count += 1
            
        except Exception as e:
            print(f"✗ Error uploading {png_file.name}: {e}")
            failed_count += 1
    
    print(f"\n🎉 Upload completed!")
    print(f"✅ Successfully uploaded: {uploaded_count} files")
    print(f"❌ Failed uploads: {failed_count} files")
    print(f"📁 Total PNG files processed: {len(png_files)}")

if __name__ == "__main__":
    main() 