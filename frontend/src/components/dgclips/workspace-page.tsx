import { Workspace } from "./workspace";
import { workspaceConfigured } from "@/lib/dgclips";
export function WorkspacePage({ view }: { view: "dashboard" | "projects" | "clips" | "templates" | "guide" | "setup" }) {
  return <Workspace view={view} configured={workspaceConfigured()} />;
}
