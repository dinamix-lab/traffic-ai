/* eslint-disable @next/next/no-location-assign-relative-destination -- A full document navigation clears prefetched data from the previous workspace. */
"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useDemo } from "./providers";
import { apiRequest } from "../features/auth/client";
export function WorkspaceSelector() {
  const { workspace, workspaces } = useDemo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pathname = usePathname();
  return (
    <div className="workspace-switcher">
      <label className="workspace">
        <span className="workspace-avatar">{workspace?.name[0] || "W"}</span>
        <div>
          <span className="sr-only">Workspace atual</span>
          <select
            aria-label="Workspace atual"
            disabled={busy || !workspaces.length}
            value={workspace?.id || ""}
            onChange={async (e) => {
              const id = e.target.value;
              setBusy(true);
              setError("");
              try {
                await apiRequest("/api/workspaces/select", "POST", {
                  workspaceId: id,
                });
                const path = pathname.startsWith("/workspaces/")
                  ? "/"
                  : pathname;
                // Reload the document to discard the previous workspace's prefetched state.
                const destination = `${path}?workspace=${encodeURIComponent(id)}`;
                window.location.assign(destination);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Não foi possível trocar de workspace.",
                );
                setBusy(false);
              }
            }}
          >
            {!workspaces.length && <option value="">Sem workspace</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
                {w.active ? "" : " (inativo)"}
              </option>
            ))}
          </select>
          <span>{busy ? "Carregando..." : "Workspace selecionado"}</span>
        </div>
      </label>
      {error && (
        <p role="alert" className="workspace-error">
          {error}
        </p>
      )}
    </div>
  );
}
