import { PropsWithChildren } from "react";
import { createActorContext } from "@xstate/react";
import { machine } from "./index";

export const MachineContext = createActorContext(machine);

export const MachineProvider = ({ children }: PropsWithChildren) => {
  return <MachineContext.Provider>{children}</MachineContext.Provider>;
};
