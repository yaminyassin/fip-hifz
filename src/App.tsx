import "./App.css";
import { Button } from "./components/ui/button";
import { Label } from "./components/ui/label";

function App() {
  return (
    <div className="flex">
      <div className="flex gap-4">
        <Button size="lg">heyy</Button>
        <Label>heyy</Label>
      </div>
    </div>
  );
}

export default App;
