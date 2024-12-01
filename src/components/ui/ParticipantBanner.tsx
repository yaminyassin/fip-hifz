import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../shadcn/table";

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
    <div className="rounded-md border bg-black shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-black hover:bg-black">
            <TableHead className="font-semibold text-white">Name</TableHead>
            <TableHead className="font-semibold text-white">Age</TableHead>
            <TableHead className="font-semibold text-white">Country</TableHead>
            <TableHead className="font-semibold text-white">Category</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => (
            <TableRow
              key={participant.name}
              className="bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <TableCell className="font-medium p-4 text-white">
                {participant.name}
              </TableCell>
              <TableCell className="p-4 text-white">
                {participant.age}
              </TableCell>
              <TableCell className="p-4 text-white">
                {participant.country}
              </TableCell>
              <TableCell className="p-4 text-white">
                {participant.category}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
