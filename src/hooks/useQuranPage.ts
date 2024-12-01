import { doc, getDoc } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { firestore } from "@/main";

async function fetchQuranPage(pageNumber: number) {
  const pageDoc = await getDoc(doc(firestore, "quran", pageNumber.toString()));
  if (!pageDoc.exists()) {
    return null;
  }
  return { page: pageDoc.data().page };
}

export function useQuranPage(pageNumber?: number) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["quranPage", pageNumber],
    queryFn: () => fetchQuranPage(pageNumber!),
    enabled: !!pageNumber,
  });

  return { data, isLoading, error };
}
