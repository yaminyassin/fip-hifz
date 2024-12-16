import { Participant } from "@/models/models";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";

interface ParticipantsTableProps {
  participants: Participant[];
}

export const ParticipantsTable = ({ participants }: ParticipantsTableProps) => {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Age</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>School</TableHead>
            <TableHead>Schedule</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>other</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => (
            <TableRow key={participant.id}>
              <TableCell>{participant.name}</TableCell>
              <TableCell>{participant.age}</TableCell>
              <TableCell>{participant.country}</TableCell>
              <TableCell>{participant.category}</TableCell>
              <TableCell>{participant.school}</TableCell>
              <TableCell>{participant.scheduled}</TableCell>
              <TableCell>
                {participant.isDone ? "Complete" : "Pending"}
              </TableCell>
              <TableCell>
                <img
                  src={"https://placeholder.pics/svg/500"}
                  alt={participant.name}
                  className="w-12 h-1 rounded-10"
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
