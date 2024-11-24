import "./App.css";
import { Button } from "./components/ui/button";
import { Label } from "./components/ui/label";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { firestore } from "./main";
import { useEffect, useState } from "react";

function App() {
  const [count, setCount] = useState(0);
  const docId = "counterDoc"; // Define a constant document ID

  useEffect(() => {
    const fetchData = async () => {
      try {
        const docRef = doc(firestore, "count", docId);
        await setDoc(docRef, { counter: count });
        console.log("Document written with ID: ", docRef.id);
      } catch (e) {
        console.error("Error adding document: ", e);
      }
    };
    fetchData();
  }, [count]);

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

  return (
    <div className="flex justify-center">
      <div className="flex gap-8 flex-col">
        <Button size="lg" onClick={handleIncrement}>
          press to increment
        </Button>
        <div className="flex text-center justify-center">
          <Label>{count}</Label>
        </div>
      </div>
    </div>
  );
}

export default App;
