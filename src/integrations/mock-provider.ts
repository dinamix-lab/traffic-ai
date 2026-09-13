import type { DemoAccountsProvider } from "./contracts";
import type { IntegrationProvider } from "../workspaces/types";
export const integrationCatalog: {
  provider: IntegrationProvider;
  name: string;
  description: string;
  available: boolean;
}[] = [
  {
    provider: "meta",
    name: "Meta Ads",
    description:
      "Conecte suas contas do Meta Ads para sincronizar campanhas, conjuntos, anúncios, criativos e resultados.",
    available: true,
  },
  {
    provider: "crm",
    name: "CRM",
    description:
      "Una a origem dos leads à qualificação, vendas e receita do seu negócio.",
    available: false,
  },
  {
    provider: "google-ads",
    name: "Google Ads",
    description:
      "Acompanhe suas campanhas de pesquisa e performance em um só lugar.",
    available: false,
  },
  {
    provider: "whatsapp",
    name: "WhatsApp",
    description: "Conecte conversas e oportunidades à jornada dos seus leads.",
    available: false,
  },
  {
    provider: "analytics",
    name: "Google Analytics",
    description:
      "Entenda o comportamento dos visitantes e a jornada de conversão.",
    available: false,
  },
];
export const demoAccountsProvider: DemoAccountsProvider = {
  discover(workspace, integrationId, now) {
    const base =
      workspace.id === "ws-scale"
        ? 100000
        : 200000 +
          [...workspace.id].reduce(
            (n, c) => (n * 31 + c.charCodeAt(0)) % 800000,
            0,
          ) *
            10;
    return [
      workspace.id === "ws-scale" ? "Loca Easy" : workspace.name,
      workspace.id === "ws-scale"
        ? "Dinamix"
        : `${workspace.name} • Performance`,
      "Conta Teste",
    ].map((name, index) => ({
      id: `${workspace.id}-account-${index + 1}`,
      externalId: `act_${base + index + 1}`,
      workspaceId: workspace.id,
      integrationId,
      name,
      active: index < 2,
      syncEnabled: index < 2,
      lastSyncAt: now - 3 * 60 * 1000,
      managerIds: [],
    }));
  },
};
