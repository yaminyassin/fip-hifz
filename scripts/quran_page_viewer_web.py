#!/usr/bin/env python3
"""
Quran Page Viewer - Web-based viewer for active participant's Quran page
Uses Flask to serve a simple web interface that shows the current page
"""

import os
import sys
from pathlib import Path
from flask import Flask, render_template, jsonify, send_from_directory
import firebase_admin
from firebase_admin import credentials, firestore
import time
from threading import Thread
import json

app = Flask(__name__)

# Global variables
current_participant = None
current_page = None
db = None

def initialize_firebase():
    """Initialize Firebase using the service account credentials"""
    global db
    try:
        # Look for Firebase credentials
        cred_path = "google-services-key.json"
        if not os.path.exists(cred_path):
            print("Error: google-services-key.json not found!")
            return False
        
        # Initialize Firebase Admin SDK
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        
        print("✅ Connected to Firebase successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Firebase Error: {str(e)}")
        return False

def listen_for_participant_changes():
    """Listen for active participant changes"""
    global current_participant, current_page
    
    def on_snapshot(docs, changes, read_time):
        global current_participant, current_page
        
        if not docs:
            current_participant = None
            current_page = None
            print("📝 No active participant")
            return
        
        # Get the first (and should be only) active participant
        participant_doc = docs[0]
        participant_data = participant_doc.to_dict()
        participant_data['id'] = participant_doc.id
        
        current_participant = participant_data
        current_page = participant_data.get('activeQuestion', None)
        
        name = participant_data.get('name', 'Unknown')
        print(f"👤 Active participant: {name}")
        if current_page:
            print(f"📖 Current page: {current_page}")
        else:
            print("📖 No active page set")
    
    try:
        # Set up real-time listener for active participants
        participants_ref = db.collection('participants')
        query = participants_ref.where('isActive', '==', True)
        
        # Start listening
        query.on_snapshot(on_snapshot)
        print("👂 Listening for participant changes...")
        
    except Exception as e:
        print(f"❌ Listener Error: {str(e)}")

@app.route('/')
def index():
    """Serve the main page"""
    return render_template('viewer.html')

@app.route('/api/current')
def get_current_info():
    """API endpoint to get current participant and page info"""
    return jsonify({
        'participant': current_participant,
        'page': current_page
    })

@app.route('/quran/<int:page_number>')
def serve_quran_page(page_number):
    """Serve Quran page images"""
    try:
        quran_dir = Path("obs/assets/quran")
        return send_from_directory(quran_dir, f"{page_number}.png")
    except Exception as e:
        return jsonify({'error': f'Page {page_number} not found'}), 404

@app.route('/api/page_exists/<int:page_number>')
def check_page_exists(page_number):
    """Check if a page image exists"""
    image_path = Path("obs/assets/quran") / f"{page_number}.png"
    return jsonify({'exists': image_path.exists()})

# Create templates directory and HTML template
def create_template():
    """Create the HTML template"""
    template_dir = Path("templates")
    template_dir.mkdir(exist_ok=True)
    
    html_content = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quran Page Viewer</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #000;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        
        .image-container {
            width: 100%;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .quran-image {
            max-width: 95vw;
            max-height: 95vh;
            height: auto;
            width: auto;
            object-fit: contain;
        }
        
        .waiting-message {
            color: #ccc;
            font-size: 1.5em;
            padding: 40px;
        }
        
        .error-message {
            color: #f44336;
            font-size: 1.5em;
            padding: 40px;
        }
        
        .loading {
            color: #2196F3;
            font-size: 1.5em;
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="image-container">
        <div id="image-content" class="loading">
            Loading...
        </div>
    </div>

    <script>
        let currentPage = null;
        
        function updateImage(page) {
            const imageContentEl = document.getElementById('image-content');
            
            if (!page) {
                imageContentEl.innerHTML = '<div class="waiting-message">Waiting for active page...</div>';
                return;
            }
            
            if (currentPage === page) {
                return; // No change needed
            }
            
            currentPage = page;
            
            // Check if page exists first
            fetch(`/api/page_exists/${page}`)
                .then(response => response.json())
                .then(data => {
                    if (data.exists) {
                        imageContentEl.innerHTML = `<img src="/quran/${page}" alt="Quran Page ${page}" class="quran-image" />`;
                    } else {
                        imageContentEl.innerHTML = `<div class="error-message">Page ${page} image not found</div>`;
                    }
                })
                .catch(error => {
                    console.error('Error checking page:', error);
                    imageContentEl.innerHTML = `<div class="error-message">Error loading page ${page}</div>`;
                });
        }
        
        function fetchCurrentInfo() {
            fetch('/api/current')
                .then(response => response.json())
                .then(data => {
                    updateImage(data.page);
                })
                .catch(error => {
                    console.error('Error fetching data:', error);
                    document.getElementById('image-content').innerHTML = `
                        <div class="error-message">Connection Error</div>
                    `;
                });
        }
        
        // Poll for updates every 2 seconds
        setInterval(fetchCurrentInfo, 2000);
        
        // Initial fetch
        fetchCurrentInfo();
    </script>
</body>
</html>'''
    
    template_path = template_dir / "viewer.html"
    with open(template_path, 'w', encoding='utf-8') as f:
        f.write(html_content)

def main():
    """Main function"""
    print("🚀 Starting Quran Page Viewer...")
    
    # Check if we're in the right directory
    if not os.path.exists("obs/assets/quran"):
        print("❌ Error: Quran assets folder not found!")
        print("Please run this script from the project root directory.")
        sys.exit(1)
    
    # Create HTML template
    create_template()
    
    # Initialize Firebase
    if not initialize_firebase():
        sys.exit(1)
    
    # Start listening for changes in a separate thread
    listener_thread = Thread(target=listen_for_participant_changes, daemon=True)
    listener_thread.start()
    
    print("🌐 Starting web server...")
    print("📱 Open your browser and go to: http://localhost:5001")
    print("🔄 The page will automatically update when the active participant changes")
    print("⏹️  Press Ctrl+C to stop")
    
    # Start the web server
    try:
        app.run(host='0.0.0.0', port=5001, debug=False)
    except KeyboardInterrupt:
        print("\n👋 Shutting down...")

if __name__ == "__main__":
    main() 