import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../shadcn/table";
import { Card } from "../shadcn/card";
import { useActiveParticipant } from "@/hooks/useActiveParticipant";
import { useTranslation } from "react-i18next";

export const ParticipantBanner = () => {
  const { data: activeParticipant, isLoading, error } = useActiveParticipant();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Card className="w-full shadow-lg bg-card/50 backdrop-blur-sm p-4">
        <div className="text-center text-muted-foreground">{t("participants.banner.loading")}</div>
      </Card>
    );
  }

  if (error || !activeParticipant) {
    return (
      <Card className="w-full shadow-lg bg-card/50 backdrop-blur-sm p-4">
        <div className="text-center text-muted-foreground">{t("participants.banner.noParticipant")}</div>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-lg bg-card/50 backdrop-blur-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-semibold">{t("participants.banner.name")}</TableHead>
            <TableHead className="font-semibold">{t("participants.banner.age")}</TableHead>
            <TableHead className="font-semibold">{t("participants.banner.country")}</TableHead>
            <TableHead className="font-semibold">{t("participants.banner.category")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="hover:bg-muted/50 transition-colors">
            <TableCell className="font-medium">{activeParticipant.name}</TableCell>
            <TableCell>{activeParticipant.age}</TableCell>
            <TableCell>{activeParticipant.country}</TableCell>
            <TableCell>{activeParticipant.category}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Card>
  );
};
