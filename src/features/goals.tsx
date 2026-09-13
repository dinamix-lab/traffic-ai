"use client";
import { useState, type FormEvent } from "react";
import { Save, Target, CheckCircle2 } from "lucide-react";
import { useGoals, useLegacyGoals, useDemo } from "@/components/providers";
import { PageTitle, Panel, Badge } from "@/components/ui";
import { validGoals } from "@/domain/preferences";
import type { Goals } from "@/domain/types";
const fields: {
  key: keyof Goals;
  title: string;
  unit: string;
  description: string;
  max?: number;
}[] = [
  {
    key: "maxCpl",
    title: "CPL máximo",
    unit: "R$",
    description: "Seu limite de custo por lead.",
  },
  {
    key: "targetCpa",
    title: "CPA desejado",
    unit: "R$",
    description: "Quanto você deseja investir por venda.",
  },
  {
    key: "targetRoas",
    title: "ROAS desejado",
    unit: "×",
    description: "Receita esperada para cada unidade monetária investida.",
  },
  {
    key: "dailyBudget",
    title: "Orçamento máximo diário",
    unit: "R$",
    description: "Teto de investimento para a conta.",
  },
  {
    key: "qualificationRate",
    title: "Taxa mínima de qualificação",
    unit: "%",
    description: "Parcela mínima de leads qualificados.",
    max: 100,
  },
  {
    key: "averageTicket",
    title: "Ticket médio",
    unit: "R$",
    description: "Valor médio esperado por venda.",
  },
];
export function GoalsPage() {
  const { value, save, error } = useGoals();
  const legacy = useLegacyGoals();
  const [saved, setSaved] = useState(false);
  const persist = async (next: Goals) => {
    const success = await save(next);
    setSaved(success);
    return success;
  };
  return (
    <>
      <PageTitle
        title="Metas"
        description="Defina o que um bom resultado significa para o seu negócio."
      >
        <Badge tone="purple">Metas do workspace</Badge>
      </PageTitle>
      {legacy && !saved && (
        <p className="info-note">
          Há metas da versão anterior neste navegador.{" "}
          <button
            className="button secondary"
            onClick={() => void persist(legacy)}
          >
            Importar para Scale Digital
          </button>
        </p>
      )}
      <GoalsForm key={JSON.stringify(value)} value={value} save={persist} />
      {saved && (
        <p role="status" className="success-message">
          Metas salvas neste workspace.
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="info-note">
        <Target size={19} />
        <span>
          Estas metas serão usadas pelo futuro motor de análise. Nesta V1,
          salvá-las não altera os diagnósticos simulados nem os orçamentos das
          campanhas.
        </span>
      </div>
    </>
  );
}
function GoalsForm({
  value,
  save,
}: {
  value: Goals;
  save: (next: Goals) => Promise<boolean>;
}) {
  const { workspace } = useDemo();
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const next = Object.fromEntries(
      fields.map((f) => [f.key, Number(form.get(f.key))]),
    );
    if (!validGoals(next)) {
      setInvalid(
        "Preencha todos os campos com valores positivos. A taxa de qualificação deve ser de até 100%.",
      );
      return;
    }
    setBusy(true);
    if (await save(next)) {
      setInvalid("");
    }
    setBusy(false);
  }
  return (
    <Panel
      title="Parâmetros de performance"
      description="Uma referência clara para suas próximas decisões."
    >
      <form onSubmit={submit}>
        <div className="goals-grid">
          {fields.map((f) => (
            <label className="goal-field" key={f.key}>
              <span>{f.title}</span>
              <div className="goal-input">
                <span>
                  {f.unit === "R$" ? workspace?.currency || "BRL" : f.unit}
                </span>
                <input
                  name={f.key}
                  type="number"
                  defaultValue={value[f.key]}
                  min="0.01"
                  max={f.max}
                  step="0.01"
                  required
                />
              </div>
              <small>{f.description}</small>
            </label>
          ))}
        </div>
        <div className="form-footer">
          <span className="muted small">
            <CheckCircle2 size={15} />
            Os valores atuais são carregados ao reabrir a página.
          </span>
          <button type="submit" className="button primary" disabled={busy}>
            <Save size={16} />
            {busy ? "Salvando…" : "Salvar metas"}
          </button>
        </div>
        {invalid && (
          <p role="alert" className="error-message">
            {invalid}
          </p>
        )}
      </form>
    </Panel>
  );
}
