import { doc, getDoc } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { firestore } from "@/main";

async function fetchQuranPage(pageNumber: number) {
  // Use the page number directly as the document ID without padding
  const pageDoc = await getDoc(doc(firestore, "quran", pageNumber.toString()));
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
