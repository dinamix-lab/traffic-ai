"use client";
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
  useMemo,
  type ReactNode,
} from "react";
import type { Dataset, Decisions, Goals } from "@/domain/types";
import { readStored, validDecisions, validGoals } from "@/domain/preferences";
import type { Workspace } from "@/workspaces/types";
import { apiRequest } from "@/features/auth/client";
const DemoContext = createContext<{
  source?: "meta" | "demo" | "crm" | "meta-crm";
  lastSyncAt?: number | null;
  data: Dataset;
  userId: string;
  workspace: Workspace | null;
  workspaces: Workspace[];
  initialGoals: Goals;
  days: number;
  setDays: (n: number) => void;
} | null>(null);
export function DemoProvider({
  data,
  source = "demo",
  lastSyncAt = null,
  userId,
  workspace,
  workspaces,
  initialGoals,
  children,
}: {
  source?: "meta" | "demo" | "crm" | "meta-crm";
  lastSyncAt?: number | null;
  data: Dataset;
  userId: string;
  workspace: Workspace | null;
  workspaces: Workspace[];
  initialGoals: Goals;
  children: ReactNode;
}) {
  const [days, setDays] = useState(14);
  return (
    <DemoContext.Provider
      value={{
        data,
        source,
        lastSyncAt,
        userId,
        workspace,
        workspaces,
        initialGoals,
        days,
        setDays,
      }}
    >
      {children}
    </DemoContext.Provider>
  );
}
export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error("Contexto de demonstração indisponível.");
  return context;
}
const subscribe = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener("traffic-storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("traffic-storage", callback);
  };
};
function useLocal<T>(
  key: string,
  fallback: T,
  validator: (value: unknown) => value is T,
  legacyKey?: string,
) {
  const [error, setError] = useState("");
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return (
          localStorage.getItem(key) ??
          (legacyKey ? localStorage.getItem(legacyKey) : null)
        );
      } catch {
        return null;
      }
    },
    () => null,
  );
  const value = useMemo(
    () => readStored(raw, fallback, validator),
    [raw, fallback, validator],
  );
  const save = (next: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("traffic-storage"));
      setError("");
      return true;
    } catch {
      setError(
        "Não foi possível salvar neste navegador. Verifique as permissões de armazenamento e tente novamente.",
      );
      return false;
    }
  };
  return { value, save, error };
}
const emptyDecisions: Decisions = {};
export function useDecisions() {
  const { userId, workspace } = useDemo();
  return useLocal<Decisions>(
    `traffic-ai:${userId}:${workspace?.id || "none"}:decisions:v1`,
    emptyDecisions,
    validDecisions,
    workspace?.id === "ws-scale"
      ? `traffic-ai:${userId}:decisions:v1`
      : undefined,
  );
}
export function useLegacyGoals() {
  const { userId, workspace } = useDemo();
  const legacy = useLocal<Goals | null>(
    `traffic-ai:${userId}:goals:v1`,
    null,
    validGoals,
  );
  return workspace?.id === "ws-scale" ? legacy.value : null;
}
export function useGoals() {
  const { workspace, initialGoals } = useDemo();
  const [value, setValue] = useState(initialGoals);
  const [error, setError] = useState("");
  const save = async (next: Goals) => {
    if (!workspace) return false;
    try {
      const result = await apiRequest<{ goals: Goals }>(
        `/api/workspaces/${workspace.id}/goals`,
        "PUT",
        next,
      );
      setValue(result.goals);
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível salvar as metas.",
      );
      return false;
    }
  };
  return { value, save, error };
}
export function useMoney() {
  const { workspace } = useDemo();
  return (value: number) =>
    value.toLocaleString("pt-BR", {
      style: "currency",
      currency: workspace?.currency || "BRL",
      maximumFractionDigits: 2,
    });
}
