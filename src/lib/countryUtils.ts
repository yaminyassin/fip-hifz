// Country and flag mapping utility
// Uses country names with flag emoji for efficient storage
// No need to store base64 flag data for each participant

// Available countries with their corresponding flag emoji
export const AVAILABLE_COUNTRIES = [
    { name: "Albania", flag: "🇦🇱" },
    { name: "Algeria", flag: "🇩🇿" },
    { name: "Angola", flag: "🇦🇴" },
    { name: "Armenia", flag: "🇦🇲" },
    { name: "Australia", flag: "🇦🇺" },
    { name: "Azerbaijan", flag: "🇦🇿" },
    { name: "Bangladesh", flag: "🇧🇩" },
    { name: "Belgium", flag: "🇧🇪" },
    { name: "Bosnia and Herzegovina", flag: "🇧🇦" },
    { name: "Botswana", flag: "🇧🇼" },
    { name: "Brazil", flag: "🇧🇷" },
    { name: "Cape Verde", flag: "🇨🇻" },
    { name: "Croatia", flag: "🇭🇷" },
    { name: "Czech Republic", flag: "🇨🇿" },
    { name: "Denmark", flag: "🇩🇰" },
    { name: "Egypt", flag: "🇪🇬" },
    { name: "Ethiopia", flag: "🇪🇹" },
    { name: "Finland", flag: "🇫🇮" },
    { name: "France", flag: "🇫🇷" },
    { name: "Germany", flag: "🇩🇪" },
    { name: "Ghana", flag: "🇬🇭" },
    { name: "Greece", flag: "🇬🇷" },
    { name: "Guinea-Bissau", flag: "🇬🇼" },
    { name: "Guinea", flag: "🇬🇳" },
    { name: "Equatorial Guinea", flag: "🇬🇶" },
    { name: "Iceland", flag: "🇮🇸" },
    { name: "India", flag: "🇮🇳" },
    { name: "Indonesia", flag: "🇮🇩" },
    { name: "Iraq", flag: "🇮🇶" },
    { name: "Ireland", flag: "🇮🇪" },
    { name: "Italy", flag: "🇮🇹" },
    { name: "Kazakhstan", flag: "🇰🇿" },
    { name: "Kenya", flag: "🇰🇪" },
    { name: "Kosovo", flag: "🇽🇰" },
    { name: "Kuwait", flag: "🇰🇼" },
    { name: "Libya", flag: "🇱🇾" },
    { name: "Malawi", flag: "🇲🇼" },
    { name: "Malaysia", flag: "🇲🇾" },
    { name: "Mauritius", flag: "🇲🇺" },
    { name: "Moldova", flag: "🇲🇩" },
    { name: "Morocco", flag: "🇲🇦" },
    { name: "Mozambique", flag: "🇲🇿" },
    { name: "Netherlands", flag: "🇳🇱" },
    { name: "Nigeria", flag: "🇳🇬" },
    { name: "Norway", flag: "🇳🇴" },
    { name: "Oman", flag: "🇴🇲" },
    { name: "Pakistan", flag: "🇵🇰" },
    { name: "Poland", flag: "🇵🇱" },
    { name: "Portugal", flag: "🇵🇹" },
    { name: "Republic of the Congo", flag: "🇨🇬" },
    { name: "Réunion", flag: "🇷🇪" },
    { name: "Romania", flag: "🇷🇴" },
    { name: "Russia", flag: "🇷🇺" },
    { name: "Rwanda", flag: "🇷🇼" },
    { name: "Saudi Arabia", flag: "🇸🇦" },
    { name: "Senegal", flag: "🇸🇳" },
    { name: "Serbia", flag: "🇷🇸" },
    { name: "Slovakia", flag: "🇸🇰" },
    { name: "Somalia", flag: "🇸🇴" },
    { name: "South Africa", flag: "🇿🇦" },
    { name: "Spain", flag: "🇪🇸" },
    { name: "Eswatini", flag: "🇸🇿" },
    { name: "Sweden", flag: "🇸🇪" },
    { name: "Syria", flag: "🇸🇾" },
    { name: "Tanzania", flag: "🇹🇿" },
    { name: "Tunisia", flag: "🇹🇳" },
    { name: "Turkey", flag: "🇹🇷" },
    { name: "Ukraine", flag: "🇺🇦" },
    { name: "United Arab Emirates", flag: "🇦🇪" },
    { name: "United Kingdom", flag: "🇬🇧" },
    { name: "United States", flag: "🇺🇸" },
    { name: "Uzbekistan", flag: "🇺🇿" },
    { name: "Zambia", flag: "🇿🇲" },
    { name: "Zimbabwe", flag: "🇿🇼" },
] as const;

export type Country = {
    name: string;
    flag: string;
};

/**
 * Get flag emoji for a country name
 * @param countryName - The country name to find flag for
 * @returns Flag emoji or null if not found
 */
export const getFlagForCountry = (countryName: string): string | null => {
    if (!countryName) return null;

    const normalizedCountryName = countryName.trim().toLowerCase();

    // First try exact match
    const exactMatch = AVAILABLE_COUNTRIES.find(
        country => country.name.toLowerCase() === normalizedCountryName
    );

    if (exactMatch) {
        return exactMatch.flag;
    }

    // Try partial matches for common variations
    const partialMatch = AVAILABLE_COUNTRIES.find(country => {
        const countryLower = country.name.toLowerCase();
        return countryLower.includes(normalizedCountryName) ||
            normalizedCountryName.includes(countryLower);
    });

    if (partialMatch) {
        return partialMatch.flag;
    }

    return null;
};

/**
 * Check if a country has a flag available in the system
 * @param countryName - The country name to check
 * @returns True if flag exists, false otherwise
 */
export const hasFlag = (countryName: string): boolean => {
    return getFlagForCountry(countryName) !== null;
};

/**
 * Get all available countries sorted alphabetically
 * @returns Array of country objects sorted by name
 */
export const getAvailableCountries = (): Country[] => {
    return [...AVAILABLE_COUNTRIES].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * Normalize country name to match flag filename format
 * @param countryName - The country name to normalize
 * @returns Normalized country name
 */
export const normalizeCountryName = (countryName: string): string => {
    if (!countryName) return "";
    return countryName.trim().toLowerCase().replace(/\s+/g, "-");
}; 