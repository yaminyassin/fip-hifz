export const QURAN_EDITION = "mushaf-v1";

/**
 * Static URL for a Quran page image. Pages moved off base64-in-Firestore to
 * immutable WebP assets served from the Hosting public dir
 * (`public/quran/{edition}/{page}.webp`), so this is a pure URL builder.
 */
export function buildQuranPageUrl(pageNumber: number): string {
  return `/quran/${QURAN_EDITION}/${pageNumber}.webp`;
}

/**
 * Resolves a page number to its static image URL. Kept as a hook for call-site
 * compatibility with `QuranViewer`; there is no async fetch anymore.
 */
export function useQuranPage(pageNumber?: number): { url: string | null } {
  return { url: pageNumber ? buildQuranPageUrl(pageNumber) : null };
}
