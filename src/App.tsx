import "./App.css";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { firestore } from "./main";
import { useEffect, useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  const docId = "counterDoc"; // Define a constant document ID

  useEffect(() => {
    const docRef = doc(firestore, "count", docId);
    const unsubscribe = onSnapshot(docRef, (doc) => {
      if (doc.exists()) {
        setCount(doc.data().counter);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleIncrement = async () => {
    const newCount = count + 1;
    setCount(newCount);
    try {
      const docRef = doc(firestore, "count", docId);
      await setDoc(docRef, { counter: newCount });
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  return <div className="flex justify-center"></div>;
}

export default App;
