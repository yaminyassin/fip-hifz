import { Button } from "../shadcn/button";
import { useTranslation } from "react-i18next";
import { Jury } from "../../models/models";

interface Participant {
  id: string;
  name: string;
  age: number;
  category: string;
  assignedQuestions?: number[];
  isActive?: boolean;
  flag?: string;
}

interface JuryHeaderProps {
  participant: Participant | null;
  juryMember: Jury | null;
  onLogout: () => void;
}

export const JuryHeader = ({
  participant,
  juryMember,
  onLogout,
}: JuryHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white shadow-md p-4">
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        {/* Left: Title */}
        <div className="flex items-center">
          <h1 className="text-xl font-bold">{t("jury.title")}</h1>
        </div>

        {/* Center: Participant Info */}
        {participant && (
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-2">
            {/* Participant Flag */}
            <div className="w-8 h-8 rounded-md overflow-hidden flex items-center justify-center bg-gray-100">
              {participant.flag ? (
                <span className="text-2xl" aria-hidden="true">
                  {participant.flag}
                </span>
              ) : (
                <span className="text-gray-400 text-xs">🏳️</span>
              )}
            </div>

            {/* Participant Details */}
            <div className="flex items-center gap-4">
              <span className="font-semibold text-gray-900">
                {participant.name}
              </span>
              <span className="text-gray-600">|</span>
              <span className="text-gray-600">{participant.age} years old</span>
              <span className="text-gray-600">|</span>
              {/* Category Badge */}
              <div className="bg-blue-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                {participant.category}
                {participant.assignedQuestions &&
                  participant.assignedQuestions.length > 0 && (
                    <span className="ml-1">
                      ({participant.assignedQuestions[0]} -{" "}
                      {
                        participant.assignedQuestions[
                        participant.assignedQuestions.length - 1
                        ]
                      }
                      )
                    </span>
                  )}
              </div>
            </div>
          </div>
        )}

        {/* Right: User Info and Logout */}
        <div className="flex items-center gap-4">
          {juryMember && (
            <div className="flex items-center gap-3 text-gray-600">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className="font-medium">{juryMember.name}</span>
              </div>

              {/* Active Status Indicator */}
              <div className="flex items-center gap-1">
                <div
                  className={`w-2 h-2 rounded-full ${juryMember.isActive
                    ? 'bg-green-500'
                    : 'bg-gray-400'
                    }`}
                />
                <span
                  className={`text-xs font-medium ${juryMember.isActive
                    ? 'text-green-600'
                    : 'text-gray-500'
                    }`}
                >
                  {juryMember.isActive
                    ? t("common.active", "Active")
                    : t("common.inactive", "Inactive")
                  }
                </span>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            onClick={onLogout}
            className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
          >
            {t("jury.actions.logout")}
          </Button>
        </div>
      </div>
    </div>
  );
};
