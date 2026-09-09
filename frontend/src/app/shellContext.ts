import { createContext, useContext } from "react";
import type { Project, User } from "../shared/api/types";

export type ShellContextValue = {
  user: User;
  projects: Project[];
  projectId?: string;
  setProjectId: (id: string) => void;
};

export const ShellContext = createContext<ShellContextValue>({
  user: {} as User,
  projects: [],
  setProjectId: () => undefined,
});

export const useShell = () => useContext(ShellContext);
