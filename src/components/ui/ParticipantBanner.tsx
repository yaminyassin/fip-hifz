import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../shadcn/table";
import { Card } from "../shadcn/card";

interface Participant {
  name: string;
  age: number;
  country: string;
  category: string;
}

const participants: Participant[] = [
  {
    name: "YAMIN",
    age: 25,
    country: "Pakistan",
    category: "Hifz",
  },
];

export const ParticipantBanner = () => {
  return (
    <Card className="w-full shadow-lg bg-card/50 backdrop-blur-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-semibold">Name</TableHead>
            <TableHead className="font-semibold">Age</TableHead>
            <TableHead className="font-semibold">Country</TableHead>
            <TableHead className="font-semibold">Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => (
            <TableRow
              key={participant.name}
              className="hover:bg-muted/50 transition-colors"
            >
              <TableCell className="font-medium">{participant.name}</TableCell>
              <TableCell>{participant.age}</TableCell>
              <TableCell>{participant.country}</TableCell>
              <TableCell>{participant.category}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
};
