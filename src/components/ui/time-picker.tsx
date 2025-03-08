"use client";

import * as React from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface TimePickerProps {
  value?: string;
  onChange: (time: string) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0")
);

export function TimePicker({ value = "", onChange }: TimePickerProps) {
  const [selectedTime, setSelectedTime] = React.useState<string>(value);
  const [selectedHour, selectedMinute] =
    selectedTime.split(":").length === 2
      ? selectedTime.split(":")
      : ["00", "00"];

  const hourRef = React.useRef<HTMLDivElement>(null);
  const minuteRef = React.useRef<HTMLDivElement>(null);

  const handleHourChange = (hour: string) => {
    const newTime = `${hour}:${selectedMinute}`;
    setSelectedTime(newTime);
    onChange(newTime);
  };

  const handleMinuteChange = (minute: string) => {
    const newTime = `${selectedHour}:${minute}`;
    setSelectedTime(newTime);
    onChange(newTime);
  };

  React.useEffect(() => {
    if (value) {
      setSelectedTime(value);
    }
  }, [value]);

  // Scroll to selected values when opened
  React.useEffect(() => {
    if (hourRef.current) {
      // const hourIndex = HOURS.indexOf(selectedHour)
      const hourElement = hourRef.current.querySelector(
        `[data-hour="${selectedHour}"]`
      );
      if (hourElement) {
        hourRef.current.scrollTop =
          hourElement.getBoundingClientRect().top -
          hourRef.current.getBoundingClientRect().top -
          hourRef.current.clientHeight / 2 +
          hourElement.clientHeight / 2;
      }
    }

    if (minuteRef.current) {
      // const minuteIndex = MINUTES.indexOf(selectedMinute)
      const minuteElement = minuteRef.current.querySelector(
        `[data-minute="${selectedMinute}"]`
      );
      if (minuteElement) {
        minuteRef.current.scrollTop =
          minuteElement.getBoundingClientRect().top -
          minuteRef.current.getBoundingClientRect().top -
          minuteRef.current.clientHeight / 2 +
          minuteElement.clientHeight / 2;
      }
    }
  }, [selectedHour, selectedMinute]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={"outline"}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selectedTime && "text-muted-foreground"
          )}
        >
          <Clock className="mr-2 h-4 w-4" />
          {selectedTime ? selectedTime : <span>Pick a time</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex space-x-2">
          {/* Hours */}
          <div className="flex flex-col items-center">
            <div className="text-xs font-medium mb-1 text-muted-foreground">
              Hr
            </div>
            <div
              ref={hourRef}
              className="w-14 h-32 overflow-y-auto scrollbar-thin relative"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {/* Shadow overlays for fading effect */}
              <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none"></div>

              {/* Hours list */}
              <div className="pt-6 pb-6">
                {HOURS.map((hour) => (
                  <Button
                    key={hour}
                    data-hour={hour}
                    variant={hour === selectedHour ? "default" : "ghost"}
                    className="h-8 w-full flex justify-center items-center text-sm py-1"
                    onClick={() => handleHourChange(hour)}
                  >
                    {hour}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="flex flex-col items-center justify-center h-32 pt-5">
            <div className="text-lg font-semibold">:</div>
          </div>

          {/* Minutes */}
          <div className="flex flex-col items-center">
            <div className="text-xs font-medium mb-1 text-muted-foreground">
              Min
            </div>
            <div
              ref={minuteRef}
              className="w-14 h-32 overflow-y-auto scrollbar-thin relative"
              style={{
                scrollbarWidth: "none",
                msOverflowStyle: "none",
              }}
            >
              {/* Shadow overlays for fading effect */}
              <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent z-10 pointer-events-none"></div>

              {/* Minutes list */}
              <div className="pt-6 pb-6">
                {MINUTES.map((minute) => (
                  <Button
                    key={minute}
                    data-minute={minute}
                    variant={minute === selectedMinute ? "default" : "ghost"}
                    className="h-8 w-full flex justify-center items-center text-sm py-1"
                    onClick={() => handleMinuteChange(minute)}
                  >
                    {minute}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
