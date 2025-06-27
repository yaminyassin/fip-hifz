#!/usr/bin/env python3
"""
Script to generate participant CSV data from provided names organized by categories.
Outputs data in the same format as participants.csv
"""

import csv
import sys

# Participant data organized by categories
participants_data = {
    "X": [
        "Aamir Madonda",
        "Hamdaan Khan", 
        "TameemHansa",
        "Iqra Inga",
        "Usama Shatta",
        "Ismaeel Omar",
        "Muhammad Moola",
        "Abubakar Holmes",
        "Musab Eshak",
        "Hamza Arbee",
        "Muhammad Geduilt"
    ],
    "A1": [
        "Moosa Ngcobo",
        "Hisham Sherman",
        "Umar Kulesi",
        "M.Uzair Dawood",
        "Hakiba Suallah",
        "Jafar Adam",
        "Mahmood Jasat",
        "Huzeifa Mansoor",
        "Faheem Francis"
    ],
    "B1": [
        "Umar Abdul Aziz",
        "Zayyan Ismail",
        "Muhammad Sillah",
        "Muaaz Khan",
        "Hanzalah Kajee",
        "Shuaib Yacoob",
        "Yusuf Desai"
    ],
    "Y": [
        "Hamza Barber",
        "Muhammed Zungu",
        "Hassan Mia",
        "Sayed Nkosi",
        "Hashim Abubakr",
        "Miraaj Aamaan Qaasim",
        "Abdul Khaaliq Sadien",
        "Muhammad Saad Taraj"
    ],
    "D1": [
        "Muhammad Variawa",
        "Harith Khan",
        "Muhammed Yusuf Diallo",
        "Tahsine Amod",
        "Usayd Kara",
        "Abdul Wahid Khan",
        "Uwais Ameen",
        "Khaleel ur Rahman Tadia"
    ],
    "W1": [
        "Cassim Piri",
        "Shahmeer Rahman",
        "Hamzah Mia",
        "Muneer Umar",
        "Ahmed Loonat",
        "Norman Ghanty"
    ],
    "W2": [
        "Shuaib Hamza",
        "Muhammed Zaheer Akoo"
    ]
}

def parse_name(full_name):
    """
    Parse full name into first name(s) and last name.
    Assumes the last word is the last name, everything else is first name(s).
    """
    # Clean up the name (remove extra spaces, handle special cases)
    full_name = full_name.strip()
    
    # Handle special case like "TameemHansa" (no space)
    if " " not in full_name:
        # If there's no space, treat the whole thing as first name and add empty last name
        return full_name.upper(), ""
    
    # Split by spaces
    name_parts = full_name.split()
    
    if len(name_parts) == 1:
        return name_parts[0].upper(), ""
    elif len(name_parts) == 2:
        return name_parts[0].upper(), name_parts[1].upper()
    else:
        # Multiple parts - last part is last name, rest are first names
        first_names = " ".join(name_parts[:-1]).upper()
        last_name = name_parts[-1].upper()
        return first_names, last_name

def generate_csv_data():
    """Generate CSV data for all participants."""
    
    # CSV header
    header = [
        "SLOT SCHEDULE",
        "CATEGORY", 
        "🔒_FIRST_AND_LAST_NAME",
        "FIRST NAME",
        "LAST NAME",
        "AGE ON EVENT",
        "FLAG",
        "🔒_PARTICIPANT_PHOTO",
        "🔒_CATEGORY_IMAGE",
        "🔒_FLAG_IMAGE"
    ]
    
    rows = [header]
    
    for category, names in participants_data.items():
        for name in names:
            first_name, last_name = parse_name(name)
            
            # Create the locked first and last name (uppercase with underscores)
            locked_name = name.upper().replace(" ", "_")
            
            # Create the photo filename
            photo_filename = f"{locked_name}.jpg"
            
            row = [
                "S0",  # SLOT SCHEDULE
                category,  # CATEGORY
                locked_name,  # 🔒_FIRST_AND_LAST_NAME
                first_name,  # FIRST NAME
                last_name,  # LAST NAME
                "0",  # AGE ON EVENT (0 as specified for unspecified)
                "",  # FLAG (empty string as specified)
                photo_filename,  # 🔒_PARTICIPANT_PHOTO
                "",  # 🔒_CATEGORY_IMAGE (empty string as specified)
                ""   # 🔒_FLAG_IMAGE (empty string as specified)
            ]
            
            rows.append(row)
    
    return rows

def main():
    """Main function to generate and output CSV data."""
    
    # Generate the CSV data
    csv_data = generate_csv_data()
    
    # Determine output method
    output_file = None
    if len(sys.argv) > 1:
        output_file = sys.argv[1]
    
    if output_file:
        # Write to file
        with open(output_file, 'w', newline='', encoding='utf-8') as file:
            writer = csv.writer(file)
            writer.writerows(csv_data)
        print(f"CSV data written to {output_file}")
    else:
        # Write to stdout
        writer = csv.writer(sys.stdout)
        writer.writerows(csv_data)

if __name__ == "__main__":
    main() 