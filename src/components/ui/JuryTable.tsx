import { useQuery } from "@tanstack/react-query";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/shadcn/table";
import { Jury } from "@/models/models";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/main";

export const JuryTable = () => {
    const { data: juryMembers, isLoading } = useQuery({
        queryKey: ["jury"],
        queryFn: async () => {
            const juryRef = collection(firestore, "jury");
            const snapshot = await getDocs(juryRef);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Jury));
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <p className="text-muted-foreground">Loading jury members...</p>
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Current Question</TableHead>
                        <TableHead>Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {juryMembers?.map((jury) => (
                        <TableRow key={jury.id}>
                            <TableCell className="font-medium">{jury.name}</TableCell>
                            <TableCell>Question {jury.currentQuestion}</TableCell>
                            <TableCell>
                                <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${jury.hasFinishedEvaluating
                                        ? "bg-green-100 text-green-800"
                                        : "bg-yellow-100 text-yellow-800"
                                        }`}
                                >
                                    {jury.hasFinishedEvaluating ? "Completed" : "In Progress"}
                                </span>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}; 