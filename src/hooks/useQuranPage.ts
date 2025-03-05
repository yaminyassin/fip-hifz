import { doc, getDoc } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { firestore } from "@/main";

async function fetchQuranPage(pageNumber: number) {
  // Pad the page number with leading zeros to match the format in the database
  // Ensuring that all page numbers are formatted to 3 digits (e.g., 001, 010, 100)
  const paddedPageNumber = pageNumber.toString().padStart(3, '0');
  
  const pageDoc = await getDoc(doc(firestore, "quran", paddedPageNumber));
  if (!pageDoc.exists()) {
    return null;
  }
  return { page: pageDoc.data().page };
}

export function useQuranPage(pageNumber?: number) {
  return useQuery({
    queryKey: ["quranPage", pageNumber],
    queryFn: () => fetchQuranPage(pageNumber!),
    enabled: !!pageNumber,
  });
}
