import type {
  Campaign,
  Creative,
  DailyMetric,
  Dataset,
  Lead,
  Recommendation,
  TrafficRepository,
} from "../domain/types";
import { dateOffset } from "../domain/metrics";

const campaigns: Omit<Campaign, "workspaceId">[] = [
  {
    id: "camp-01",
    name: "Captação • Mentoria Scale",
    objective: "Geração de leads",
    status: "Ativa",
    budget: 950,
    score: 92,
    color: "#635bdb",
  },
  {
    id: "camp-02",
    name: "Remarketing • Alta intenção",
    objective: "Vendas",
    status: "Ativa",
    budget: 620,
    score: 88,
    color: "#209a87",
  },
  {
    id: "camp-03",
    name: "Captação • Masterclass",
    objective: "Geração de leads",
    status: "Ativa",
    budget: 780,
    score: 54,
    color: "#e19a41",
  },
  {
    id: "camp-04",
    name: "Conversão • Programa Pro",
    objective: "Vendas",
    status: "Ativa",
    budget: 550,
    score: 83,
    color: "#478cda",
  },
  {
    id: "camp-05",
    name: "Prospecção • Novos públicos",
    objective: "Geração de leads",
    status: "Em aprendizado",
    budget: 380,
    score: 71,
    color: "#b16baf",
  },
  {
    id: "camp-06",
    name: "Reativação • Base de leads",
    objective: "Vendas",
    status: "Pausada",
    budget: 250,
    score: 65,
    color: "#8893a5",
  },
];
const daily: Omit<DailyMetric, "workspaceId">[] = Array.from(
  { length: 60 },
  (_, day) =>
    campaigns.map((campaign, index) => {
      const active = !(index === 5 && day >= 53);
      const spend = active
        ? Math.round(
            campaign.budget *
              (0.79 + Math.sin(day * 0.72 + index) * 0.12) *
              (day >= 30 ? 1 : 0.93) *
              100,
          ) / 100
        : 0;
      const cpm = 18 + index * 1.8 + Math.cos(day * 0.41) * 1.5;
      const impressions = Math.round((spend / cpm) * 1000);
      const ctr =
        (2.5 - index * 0.16) *
        (index === 2 && day >= 55 ? 0.65 : 1) *
        (day >= 30 && index !== 2 ? 1.12 : 1);
      const clicks = Math.round((impressions * ctr) / 100);
      const leads = Math.round(clicks * (0.033 + (index === 0 ? 0.01 : 0)));
      const sales = Math.round(leads * (index === 1 ? 0.15 : 0.085));
      return {
        date: dateOffset(day - 59),
        campaignId: campaign.id,
        spend,
        impressions,
        clicks,
        leads,
        sales,
        reach: Math.round(
          impressions / (index === 2 && day >= 55 ? 3.8 : 1.8 + index * 0.19),
        ),
        revenue: sales * (index === 3 ? 3200 : 2400),
      };
    }),
).flat();
const creatives: Omit<Creative, "workspaceId">[] = campaigns.flatMap((c, i) => [
  {
    id: `cr-${i + 1}-1`,
    name: `Criativo ${String(i * 2 + 1).padStart(2, "0")}`,
    campaignId: c.id,
    adSet: "Interesses • Empreendedores",
    ad: `Anúncio ${i + 1}A • Manifesto`,
    format: "Estático · 1:1",
    headline: [
      "Seu próximo nível começa aqui.",
      "Vamos retomar seu crescimento?",
      "Conhecimento que vira resultado.",
      "Mais estratégia. Mais resultado.",
      "Uma nova forma de crescer.",
      "O próximo passo é seu.",
    ][i]!,
    color: c.color,
    share: 0.58,
    fatigue: i === 2,
    score: c.score - 2,
  },
  {
    id: `cr-${i + 1}-2`,
    name: `Criativo ${String(i * 2 + 2).padStart(2, "0")}`,
    campaignId: c.id,
    adSet: "Semelhante • Clientes 1%",
    ad: `Anúncio ${i + 1}B • Depoimento`,
    format: "Vídeo · 9:16",
    headline: "Histórias reais. Novas possibilidades.",
    color: c.color,
    share: 0.42,
    fatigue: false,
    score: Math.min(c.score + 4, 99),
  },
]);
const recommendations: Omit<Recommendation, "workspaceId">[] = [
  {
    id: "rec-1",
    campaignId: "camp-03",
    title: "Renove o criativo da Masterclass",
    diagnosis:
      "Na janela ilustrativa de 5 dias, o CPL aumentou enquanto a taxa de cliques caiu. A frequência também avançou.",
    cause:
      "Sinais de saturação do público e fadiga da mensagem do Criativo 05.",
    impact: "Risco de perder eficiência na captação de novos leads.",
    action:
      "Substituir o Criativo 05 por uma nova abordagem e comparar por 72 horas.",
    priority: "Alta",
    confidence: 94,
    kind: "Substituir criativo",
  },
  {
    id: "rec-2",
    campaignId: "camp-01",
    title: "Amplie o que está funcionando",
    diagnosis:
      "A Mentoria Scale mantém o melhor score da conta e uma boa relação entre investimento e leads.",
    cause: "Mensagem aderente e público com intenção consistente.",
    impact: "Oportunidade simulada de ampliar o volume de leads.",
    action:
      "Aumentar o orçamento diário em 15%, de R$ 950 para R$ 1.092,50, e revisar em 48 horas.",
    priority: "Média",
    confidence: 89,
    kind: "Aumentar orçamento",
  },
  {
    id: "rec-3",
    campaignId: "camp-05",
    title: "Proteja o orçamento de prospecção",
    diagnosis:
      "A campanha está em aprendizado e ainda apresenta eficiência inferior à da Mentoria.",
    cause: "Audiência ampla, com poucos sinais de conversão.",
    impact: "Redução de exposição enquanto novos dados são coletados.",
    action:
      "Reduzir o orçamento diário de R$ 380 para R$ 323 e acompanhar a saída do aprendizado.",
    priority: "Média",
    confidence: 78,
    kind: "Reduzir orçamento",
  },
  {
    id: "rec-4",
    campaignId: "camp-03",
    title: "Revise o anúncio saturado",
    diagnosis:
      "O anúncio de manifesto concentra exposição na campanha com maior frequência recente.",
    cause: "Repetição de mensagem para o mesmo segmento.",
    impact: "Possível desperdício de investimento em impressões repetidas.",
    action:
      "Pausar o Anúncio 3A somente após disponibilizar o criativo substituto. Alternativa à recomendação de troca, não cumulativa.",
    priority: "Alta",
    confidence: 87,
    kind: "Pausar anúncio",
  },
  {
    id: "rec-5",
    campaignId: "camp-02",
    title: "Mantenha o remarketing estável",
    diagnosis: "O remarketing apresenta boa proporção de vendas por lead.",
    cause: "Público de alta intenção já familiarizado com a oferta.",
    impact: "Preservação da eficiência de conversão.",
    action: "Manter a configuração atual e revisar a frequência em três dias.",
    priority: "Baixa",
    confidence: 91,
    kind: "Manter campanha",
  },
  {
    id: "rec-6",
    campaignId: "camp-04",
    title: "Teste uma nova prova social",
    diagnosis:
      "O Programa Pro tem espaço para explorar mensagens diferentes com orçamento controlado.",
    cause: "Pouca diversidade de argumentos entre as peças atuais.",
    impact: "Aprendizado sobre a mensagem que gera clientes.",
    action:
      "Testar um depoimento de cliente com até 10% do orçamento atual, sem ampliar o teto diário.",
    priority: "Baixa",
    confidence: 82,
    kind: "Testar novo criativo",
  },
];
const names = [
  "Mariana Costa",
  "Rafael Almeida",
  "Camila Oliveira",
  "Pedro Santos",
  "Juliana Ribeiro",
  "André Lima",
  "Beatriz Martins",
  "Felipe Rocha",
  "Larissa Souza",
  "Bruno Pereira",
  "Isabela Gomes",
  "Thiago Dias",
  "Luana Ferreira",
  "Gabriel Melo",
  "Carolina Alves",
  "Diego Barbosa",
  "Natália Castro",
  "Vinícius Reis",
];
const stages: Lead["status"][] = [
  "Novo",
  "Qualificado",
  "Reunião",
  "Proposta",
  "Venda",
  "Perdido",
];
const leads: Omit<Lead, "workspaceId">[] = names.map((name, i) => {
  const stage = i % 6;
  return {
    id: `lead-${i + 1}`,
    name,
    company: [
      "Studio Horizonte",
      "Nexo Consultoria",
      "Ateliê Aurora",
      "Vértice Digital",
      "Impulso Educação",
      "Órbita Serviços",
    ][i % 6]!,
    campaignId: campaigns[i % 6]!.id,
    creativeId: creatives[(i % 6) * 2 + (i % 2)]!.id,
    status: stages[stage]!,
    qualified: stage >= 1 && stage <= 4,
    meeting: stage >= 2 && stage <= 4,
    proposal: stage >= 3 && stage <= 4,
    sale: stage === 4,
    value: stage === 4 ? 2400 : 0,
  };
});
export const mockRepository: TrafficRepository = {
  async getDataset(workspace): Promise<Dataset> {
    if (!workspace.id) throw new Error("Workspace obrigatório.");
    const factor =
      workspace.id === "ws-scale"
        ? 1
        : 0.6 +
          ([...workspace.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 80) /
            100;
    const scoped = <T extends object>(rows: T[]) =>
      rows.map((row) => ({ ...row, workspaceId: workspace.id }));
    return {
      workspaceId: workspace.id,
      journal: [0,-1,-2,-3].map(offset=>({workspaceId:workspace.id,date:dateOffset(offset)})),
      campaigns: scoped(
        campaigns.map((c) => ({
          ...c,
          name:
            workspace.id === "ws-scale"
              ? c.name
              : `${c.name} · ${workspace.name}`,
          budget: Math.round(c.budget * factor),
        })),
      ),
      daily: scoped(
        daily.map((r) => ({
          ...r,
          spend: Math.round(r.spend * factor * 100) / 100,
          impressions: Math.round(r.impressions * factor),
          clicks: Math.round(r.clicks * factor),
          leads: Math.round(r.leads * factor),
          sales: Math.round(r.sales * factor),
          reach: Math.round(r.reach * factor),
          revenue: workspace.id === "ws-scale" ? r.revenue : Math.round(r.sales * factor) * (r.campaignId === "camp-04" ? 3200 : 2400),
        })),
      ),
      creatives: scoped(creatives),
      recommendations: scoped(recommendations.map(r=>({...r,action:r.action.replace(/R\$ ([\d.,]+)/g,(_,value:string)=>(Number(value.replaceAll(".","").replace(",","."))*factor).toLocaleString("pt-BR",{style:"currency",currency:workspace.currency||"BRL"}))}))),
      leads: scoped(
        leads.map((l) => ({
          ...l,
          company: workspace.id === "ws-scale" ? l.company : workspace.name,
          value: Math.round(l.value * factor),
        })),
      ),
    };
  },
};
