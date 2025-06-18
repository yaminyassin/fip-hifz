# Quran Page Viewer

A Python application that listens to Firebase for active participant changes and displays the corresponding Quran page image in a resizable window.

## Features

- **Real-time Firebase Integration**: Listens to Firebase Firestore for active participant changes
- **Automatic Page Display**: Shows the current page being recited by the active participant
- **Resizable Window**: Fully resizable interface with proper image scaling
- **Error Handling**: Comprehensive error handling and status reporting
- **Image Scaling**: Automatically scales images to fit the window while maintaining aspect ratio
- **Scrollable View**: Includes scrollbars for large images

## Prerequisites

1. **Python 3.7+** installed on your system
2. **Firebase credentials** file (`google-services-key.json`) in the project root
3. **Quran images** in the `obs/assets/quran/` directory

## Installation

1. Install the required Python packages:

```bash
pip install -r requirements-viewer.txt
```

Or install manually:

```bash
pip install firebase-admin pillow
```

2. Ensure you have the Firebase credentials file (`google-services-key.json`) in the project root directory.

3. Make sure the Quran page images are available in `obs/assets/quran/` directory with filenames like `504.png`, `505.png`, etc.

## Usage

1. **Run from the project root directory**:

```bash
python quran_page_viewer.py
```

2. **The application will**:
   - Connect to Firebase using the credentials file
   - Listen for active participant changes in real-time
   - Display the current participant's name and active page
   - Show the corresponding Quran page image
   - Update automatically when the active participant or page changes

## Interface

The application window contains three main sections:

### 1. Connection Status

- Shows the current Firebase connection status
- Displays any errors or connection issues

### 2. Active Participant Info

- **Participant Name**: Shows the name of the currently active participant
- **Page Number**: Displays the current page being recited

### 3. Quran Page Display

- Shows the actual Quran page image
- Automatically scales to fit the window
- Includes scrollbars for navigation if needed
- Updates in real-time when the page changes

## How It Works

1. **Firebase Listener**: The script sets up a real-time listener on the `participants` collection
2. **Active Participant Query**: Filters for participants where `isActive == true`
3. **Page Detection**: Reads the `activeQuestion` field to get the current page number
4. **Image Loading**: Loads the corresponding PNG file from `obs/assets/quran/{pageNumber}.png`
5. **Display Update**: Updates the UI with the new participant info and page image

## Data Structure

The script expects participants in Firebase to have this structure:

```json
{
  "name": "Participant Name",
  "isActive": true,
  "activeQuestion": 504
  // ... other fields
}
```

## Troubleshooting

### Common Issues

1. **"Firebase credentials file not found"**

   - Ensure `google-services-key.json` is in the project root directory
   - Check that the file has the correct permissions

2. **"Quran assets folder not found"**

   - Run the script from the project root directory
   - Ensure the `obs/assets/quran/` directory exists with PNG files

3. **"Image not found"**

   - Check that the PNG file exists for the specific page number
   - Verify the filename format matches `{pageNumber}.png`

4. **Connection issues**
   - Verify your internet connection
   - Check Firebase project permissions
   - Ensure the credentials file is valid

### Error Messages

- **Green status**: Everything is working correctly
- **Orange status**: Warnings (e.g., image not found)
- **Red status**: Errors that need attention

## Window Controls

- **Resize**: Drag window edges to resize; image will scale automatically
- **Scroll**: Use scrollbars if the image is larger than the display area
- **Close**: Click the X button or use Alt+F4 to close the application

## Performance Notes

- Images are cached in memory for better performance
- The application uses minimal system resources
- Real-time updates are efficient and don't poll the database

## Requirements

- Python 3.7+
- firebase-admin >= 6.0.0
- Pillow >= 9.0.0
- tkinter (usually included with Python)

## License

This script is part of the FIP Hifz project.
