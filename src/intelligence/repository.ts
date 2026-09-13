import type { IntelligenceConfig } from "./config";
import type {
  Recommendation,
  Decision,
  Creative,
  ReelTest,
  JournalEntry,
  Notification,
  Audit,
} from "./types";
export interface Collections {
  recommendations: Recommendation;
  decisions: Decision;
  creatives: Creative;
  tests: ReelTest;
  journal: JournalEntry;
  notifications: Notification;
  audit: Audit;
}
export interface IntelligenceRepository {
  transaction<T>(fn: () => T): T;
  list<K extends keyof Collections>(
    kind: K,
    workspaceId: string,
  ): Collections[K][];
  get<K extends keyof Collections>(
    kind: K,
    workspaceId: string,
    id: string,
  ): Collections[K] | null;
  save<K extends keyof Collections>(kind: K, value: Collections[K]): void;
  config(workspaceId: string): IntelligenceConfig;
  saveConfig(workspaceId: string, config: IntelligenceConfig): void;
}
