#!/usr/bin/env python3
"""
Script to rename Quran page PNG files by adding +1 to each page number.
Uses a two-step process to avoid naming conflicts.
"""

import os
import re
import argparse
import tempfile
from pathlib import Path
from typing import List, Tuple

def scan_and_rename_quran_pages(folder_path: str, dry_run: bool = False) -> None:
    """
    Scan PNG files in the specified folder and rename them by adding +1 to the page number.
    Uses a two-step process to avoid naming conflicts.
    
    Args:
        folder_path: Path to the folder containing Quran page PNG files
        dry_run: If True, only show what would be renamed without actually doing it
    """
    # Convert to Path object for easier manipulation
    folder = Path(folder_path)
    
    if not folder.exists():
        print(f"Error: Folder '{folder_path}' does not exist.")
        return
    
    if not folder.is_dir():
        print(f"Error: '{folder_path}' is not a directory.")
        return
    
    # Find all PNG files and extract page numbers
    png_files: List[Tuple[int, Path]] = []
    pattern = re.compile(r'^(\d+)\.png$')
    
    for file_path in folder.glob('*.png'):
        match = pattern.match(file_path.name)
        if match:
            page_number = int(match.group(1))
            png_files.append((page_number, file_path))
        else:
            print(f"Warning: Skipping file '{file_path.name}' - doesn't match expected pattern 'number.png'")
    
    if not png_files:
        print("No PNG files with numeric names found in the folder.")
        return
    
    # Sort by page number in descending order (largest first)
    png_files.sort(key=lambda x: x[0], reverse=True)
    
    print(f"Found {len(png_files)} PNG files to {'preview' if dry_run else 'rename'}.")
    
    if dry_run:
        print("\n=== DRY RUN - Preview of changes ===")
        for page_number, file_path in png_files:
            new_page_number = page_number + 1
            new_filename = f"{new_page_number}.png"
            print(f"WOULD RENAME: '{file_path.name}' -> '{new_filename}'")
        
        print(f"\n=== DRY RUN COMPLETE ===")
        print(f"Would process {len(png_files)} files using a two-step renaming process.")
        print("Run without --dry-run to actually rename the files.")
        return
    
    print("Using two-step renaming process to avoid conflicts...")
    print("\nStep 1: Renaming files to temporary names...")
    
    # Step 1: Rename all files to temporary names
    temp_mappings: List[Tuple[Path, Path, int]] = []  # (temp_path, original_path, new_page_number)
    failed_step1 = []
    
    for page_number, file_path in png_files:
        new_page_number = page_number + 1
        # Create temporary filename with a unique suffix
        temp_filename = f"temp_{page_number}_{new_page_number}.png"
        temp_path = file_path.parent / temp_filename
        
        try:
            file_path.rename(temp_path)
            temp_mappings.append((temp_path, file_path, new_page_number))
            print(f"  '{file_path.name}' -> '{temp_filename}' (temporary)")
        except OSError as e:
            print(f"  Error creating temporary file for '{file_path.name}': {e}")
            failed_step1.append((page_number, file_path))
    
    print(f"\nStep 1 completed: {len(temp_mappings)} files renamed to temporary names.")
    
    if failed_step1:
        print(f"Step 1 failures: {len(failed_step1)} files could not be renamed to temporary names.")
    
    print("\nStep 2: Renaming temporary files to final names...")
    
    # Step 2: Rename temporary files to final names
    success_count = 0
    failed_step2 = []
    
    for temp_path, original_path, new_page_number in temp_mappings:
        final_filename = f"{new_page_number}.png"
        final_path = temp_path.parent / final_filename
        
        try:
            temp_path.rename(final_path)
            print(f"  '{temp_path.name}' -> '{final_filename}'")
            success_count += 1
        except OSError as e:
            print(f"  Error renaming '{temp_path.name}' to '{final_filename}': {e}")
            failed_step2.append((temp_path, original_path, new_page_number))
    
    print(f"\nStep 2 completed: {success_count} files successfully renamed to final names.")
    
    # Handle any failures in step 2 by reverting to original names
    if failed_step2:
        print(f"\nStep 2 failures: {len(failed_step2)} files could not be renamed to final names.")
        print("Reverting failed files to original names...")
        
        for temp_path, original_path, new_page_number in failed_step2:
            try:
                temp_path.rename(original_path)
                print(f"  Reverted: '{temp_path.name}' -> '{original_path.name}'")
            except OSError as e:
                print(f"  Error reverting '{temp_path.name}': {e}")
    
    total_success = success_count
    total_failures = len(failed_step1) + len(failed_step2)
    
    print(f"\n=== RENAMING COMPLETE ===")
    print(f"Successfully renamed: {total_success} files")
    print(f"Failed to rename: {total_failures} files")
    print(f"Total files processed: {len(png_files)}")

def main():
    """Main function to execute the script."""
    parser = argparse.ArgumentParser(
        description="Rename Quran page PNG files by adding +1 to each page number"
    )
    parser.add_argument(
        "folder_path",
        nargs="?",
        default="../obs/assets/quran",
        help="Path to the folder containing Quran page PNG files (default: ../obs/assets/quran)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview changes without actually renaming files"
    )
    
    args = parser.parse_args()
    
    print(f"Scanning folder: {args.folder_path}")
    if args.dry_run:
        print("DRY RUN MODE: No files will be renamed")
    
    scan_and_rename_quran_pages(args.folder_path, args.dry_run)

if __name__ == "__main__":
    main() 