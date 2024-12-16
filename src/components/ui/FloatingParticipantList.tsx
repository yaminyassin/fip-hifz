import { Participant } from "@/models/models";
import { useState } from "react";
import { ChevronUp, ChevronDown, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/shadcn/card";

interface FloatingParticipantListProps {
  participants: Participant[];
}

export const FloatingParticipantList = ({
  participants,
}: FloatingParticipantListProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const nextParticipants = participants.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-4 right-4 z-50"
    >
      <Card className="w-72 bg-white/90 backdrop-blur-sm shadow-lg">
        <CardHeader
          className="flex flex-row items-center justify-between p-4 cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4" />
            <span className="font-semibold">Next Participants</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </CardHeader>
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <CardContent className="p-4">
                {nextParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">{participant.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {participant.category}
                      </p>
                    </div>
                    <span className="text-sm">{participant.scheduled}</span>
                  </div>
                ))}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
};
