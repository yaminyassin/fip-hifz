#!/usr/bin/env python3
"""
Quran Page Viewer - Displays the current active participant's Quran page
Listens to Firebase for active participant changes and shows the corresponding page image
"""

import os
import sys
import json
import tkinter as tk
from tkinter import ttk, messagebox
from PIL import Image, ImageTk
import firebase_admin
from firebase_admin import credentials, firestore
from threading import Thread
import time
from pathlib import Path

class QuranPageViewer:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Quran Page Viewer - Active Participant")
        self.root.geometry("800x1000")
        self.root.minsize(400, 500)
        
        # Initialize Firebase
        self.db = None
        self.listener = None
        self.current_page = None
        self.current_participant = None
        
        # UI Elements
        self.status_label = None
        self.participant_label = None
        self.page_label = None
        self.image_label = None
        self.image_frame = None
        
        # Image handling
        self.current_image = None
        self.photo_image = None
        
        self.setup_ui()
        self.initialize_firebase()
        
    def setup_ui(self):
        """Setup the user interface"""
        # Create main frame
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Configure grid weights for resizing
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(0, weight=1)
        main_frame.rowconfigure(2, weight=1)
        
        # Status section
        status_frame = ttk.LabelFrame(main_frame, text="Connection Status", padding="5")
        status_frame.grid(row=0, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        status_frame.columnconfigure(0, weight=1)
        
        self.status_label = ttk.Label(status_frame, text="Initializing...", foreground="orange")
        self.status_label.grid(row=0, column=0, sticky=tk.W)
        
        # Participant info section
        info_frame = ttk.LabelFrame(main_frame, text="Active Participant", padding="5")
        info_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        info_frame.columnconfigure(0, weight=1)
        
        self.participant_label = ttk.Label(info_frame, text="No active participant", font=("Arial", 12, "bold"))
        self.participant_label.grid(row=0, column=0, sticky=tk.W)
        
        self.page_label = ttk.Label(info_frame, text="Page: -", font=("Arial", 10))
        self.page_label.grid(row=1, column=0, sticky=tk.W)
        
        # Image display section
        self.image_frame = ttk.LabelFrame(main_frame, text="Quran Page", padding="5")
        self.image_frame.grid(row=2, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        self.image_frame.columnconfigure(0, weight=1)
        self.image_frame.rowconfigure(0, weight=1)
        
        # Create a canvas for the image with scrollbars
        canvas_frame = ttk.Frame(self.image_frame)
        canvas_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        canvas_frame.columnconfigure(0, weight=1)
        canvas_frame.rowconfigure(0, weight=1)
        
        self.canvas = tk.Canvas(canvas_frame, bg="white")
        self.canvas.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # Scrollbars
        v_scrollbar = ttk.Scrollbar(canvas_frame, orient="vertical", command=self.canvas.yview)
        v_scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))
        self.canvas.configure(yscrollcommand=v_scrollbar.set)
        
        h_scrollbar = ttk.Scrollbar(canvas_frame, orient="horizontal", command=self.canvas.xview)
        h_scrollbar.grid(row=1, column=0, sticky=(tk.W, tk.E))
        self.canvas.configure(xscrollcommand=h_scrollbar.set)
        
        # Bind canvas resize event
        self.canvas.bind('<Configure>', self.on_canvas_configure)
        
        # Initial message
        self.canvas.create_text(400, 300, text="Waiting for active participant...", 
                               font=("Arial", 16), fill="gray", tags="placeholder")
    
    def initialize_firebase(self):
        """Initialize Firebase connection"""
        try:
            # Look for Firebase credentials
            cred_path = "google-services-key.json"
            if not os.path.exists(cred_path):
                self.update_status("Error: google-services-key.json not found", "red")
                messagebox.showerror("Error", "Firebase credentials file 'google-services-key.json' not found!")
                return
            
            # Initialize Firebase
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            self.db = firestore.client()
            
            self.update_status("Connected to Firebase", "green")
            
            # Start listening for active participant changes
            self.start_listener()
            
        except Exception as e:
            self.update_status(f"Firebase Error: {str(e)}", "red")
            messagebox.showerror("Firebase Error", f"Failed to connect to Firebase:\n{str(e)}")
    
    def start_listener(self):
        """Start listening for active participant changes"""
        def listen_for_changes():
            try:
                # Query for active participant
                participants_ref = self.db.collection('participants')
                query = participants_ref.where('isActive', '==', True)
                
                # Set up real-time listener
                self.listener = query.on_snapshot(self.on_participant_change)
                
            except Exception as e:
                self.root.after(0, lambda: self.update_status(f"Listener Error: {str(e)}", "red"))
        
        # Start listener in a separate thread
        listener_thread = Thread(target=listen_for_changes, daemon=True)
        listener_thread.start()
    
    def on_participant_change(self, docs, changes, read_time):
        """Handle participant changes from Firebase"""
        try:
            if not docs:
                # No active participant
                self.root.after(0, lambda: self.update_participant_info(None))
                return
            
            # Get the first (and should be only) active participant
            participant_doc = docs[0]
            participant_data = participant_doc.to_dict()
            participant_data['id'] = participant_doc.id
            
            # Update UI in main thread
            self.root.after(0, lambda: self.update_participant_info(participant_data))
            
        except Exception as e:
            self.root.after(0, lambda: self.update_status(f"Data Error: {str(e)}", "red"))
    
    def update_participant_info(self, participant):
        """Update the participant information and load the corresponding page"""
        self.current_participant = participant
        
        if not participant:
            self.participant_label.config(text="No active participant")
            self.page_label.config(text="Page: -")
            self.clear_image()
            return
        
        # Update participant info
        name = participant.get('name', 'Unknown')
        active_question = participant.get('activeQuestion', None)
        
        self.participant_label.config(text=f"Participant: {name}")
        
        if active_question:
            self.page_label.config(text=f"Page: {active_question}")
            self.load_page_image(active_question)
        else:
            self.page_label.config(text="Page: Not set")
            self.clear_image()
    
    def load_page_image(self, page_number):
        """Load and display the Quran page image"""
        try:
            # Construct image path
            image_path = Path("obs/assets/quran") / f"{page_number}.png"
            
            if not image_path.exists():
                self.update_status(f"Image not found: {image_path}", "orange")
                self.show_error_message(f"Page {page_number} image not found")
                return
            
            # Load and display image
            self.current_image = Image.open(image_path)
            self.display_image()
            self.current_page = page_number
            
            self.update_status(f"Displaying page {page_number}", "green")
            
        except Exception as e:
            self.update_status(f"Image Error: {str(e)}", "red")
            self.show_error_message(f"Error loading page {page_number}")
    
    def display_image(self):
        """Display the current image on the canvas"""
        if not self.current_image:
            return
        
        # Clear canvas
        self.canvas.delete("all")
        
        # Get canvas size
        canvas_width = self.canvas.winfo_width()
        canvas_height = self.canvas.winfo_height()
        
        if canvas_width <= 1 or canvas_height <= 1:
            # Canvas not ready yet, try again later
            self.root.after(100, self.display_image)
            return
        
        # Calculate scaling to fit image in canvas while maintaining aspect ratio
        img_width, img_height = self.current_image.size
        scale_x = canvas_width / img_width
        scale_y = canvas_height / img_height
        scale = min(scale_x, scale_y, 1.0)  # Don't scale up beyond original size
        
        # Resize image
        new_width = int(img_width * scale)
        new_height = int(img_height * scale)
        resized_image = self.current_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Convert to PhotoImage
        self.photo_image = ImageTk.PhotoImage(resized_image)
        
        # Center the image on canvas
        x = (canvas_width - new_width) // 2
        y = (canvas_height - new_height) // 2
        
        self.canvas.create_image(x, y, anchor=tk.NW, image=self.photo_image)
        
        # Update scroll region
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))
    
    def on_canvas_configure(self, event):
        """Handle canvas resize events"""
        if self.current_image:
            self.display_image()
    
    def clear_image(self):
        """Clear the image display"""
        self.canvas.delete("all")
        self.canvas.create_text(
            self.canvas.winfo_width() // 2, 
            self.canvas.winfo_height() // 2, 
            text="Waiting for active participant...", 
            font=("Arial", 16), 
            fill="gray", 
            tags="placeholder"
        )
        self.current_image = None
        self.photo_image = None
        self.current_page = None
    
    def show_error_message(self, message):
        """Show error message on canvas"""
        self.canvas.delete("all")
        self.canvas.create_text(
            self.canvas.winfo_width() // 2, 
            self.canvas.winfo_height() // 2, 
            text=message, 
            font=("Arial", 14), 
            fill="red", 
            tags="error"
        )
    
    def update_status(self, message, color="black"):
        """Update the status label"""
        if self.status_label:
            self.status_label.config(text=message, foreground=color)
    
    def on_closing(self):
        """Handle application closing"""
        if self.listener:
            self.listener.unsubscribe()
        self.root.destroy()
    
    def run(self):
        """Start the application"""
        self.root.protocol("WM_DELETE_WINDOW", self.on_closing)
        self.root.mainloop()

def main():
    """Main function"""
    # Check if required packages are available
    try:
        import firebase_admin
        from PIL import Image, ImageTk
    except ImportError as e:
        print(f"Missing required package: {e}")
        print("Please install required packages:")
        print("pip install firebase-admin pillow")
        sys.exit(1)
    
    # Check if we're in the right directory
    if not os.path.exists("obs/assets/quran"):
        print("Error: Quran assets folder not found!")
        print("Please run this script from the project root directory.")
        sys.exit(1)
    
    # Create and run the application
    app = QuranPageViewer()
    app.run()

if __name__ == "__main__":
    main() 