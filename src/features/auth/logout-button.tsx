"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { apiRequest } from "./client";
import { navigateAfterSessionChange } from "./navigation";
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="logout-control">
      <button
        className="logout-button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await apiRequest("/api/auth/logout", "POST");
            navigateAfterSessionChange("/login");
          } catch {
            setError("Não foi possível sair. Tente novamente.");
            setBusy(false);
          }
        }}
      >
        <LogOut size={15} />
        {busy ? "Saindo..." : "Sair"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
