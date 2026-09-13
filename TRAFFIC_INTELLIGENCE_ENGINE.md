# Traffic Intelligence Engine — 0.6

Modo operacional oficial: **SEMIAUTOMÁTICO**.

> Traffic AI não deve otimizar métricas isoladas.
> Traffic AI deve otimizar resultado de negócio.

> CRM = fonte oficial da verdade comercial.
> Meta = fonte oficial da verdade de mídia.
> Traffic AI = camada de inteligência que cruza ambos.

Esta etapa implementa análise determinística, explicação local, recomendações, aprovação humana, auditoria e acompanhamento observacional. Aprovar não pausa anúncios, não muda orçamento e não cria campanhas. O CRM permanece somente leitura. Não é necessária chave OpenAI.

## Usar e testar manualmente

1. Entre com o usuário existente e selecione o workspace. Acesse **Traffic AI**. O worker prepara a análise diária; **Atualizar análise** registra uma análise sob demanda.
2. Escolha Hoje, Ontem ou uma janela de 3, 7, 14 ou 30 dias. Janelas de vários dias usam **dias completos até ontem**, no fuso do workspace. Hoje é explicitamente parcial. O controle superior antigo de período continua servindo às métricas de mídia/funil; a janela específica da inteligência governa suas próprias análises.
3. Leia o briefing, saúde/cobertura, riscos, oportunidades e estados de espera. Abra **Por que o Traffic AI está dizendo isso?** para ver métricas atuais/anteriores, fonte, período, regra/versionamento, limitações, conflitos e guardrails.
4. Acesse **Aprovações**, ou use o próprio card, para aprovar ou rejeitar. Motivo e observação são opcionais na rejeição. Apenas recomendações persistidas, pendentes e não expiradas aceitam decisão.
5. Abra **Diário da IA**: decisões preservam usuário, data, métricas e evidências; o resultado posterior começa inconclusivo. Uma tarefa de acompanhamento pode ser concluída localmente, sem representar execução Meta.
6. Como administrador, abra **Config. de Inteligência**. Configure limites, amostras, confiança, alvos e parâmetros do laboratório. Os valores pertencem exclusivamente ao workspace. Gestores não veem os campos administrativos nem conseguem alterá-los pela API.
7. Para explorar cenários de mídia sem conexão Meta, selecione **Demonstração isolada**. As métricas de mídia e comerciais deste modo são integralmente sintéticas, sem combinar investimento fictício com vendas reais. O modo demo usa uma janela de sete dias e sua própria partição de recomendações/decisões.
8. Consulte CREATIVE_INTELLIGENCE.md e REELS_LAB.md para cadastrar conteúdo, avaliar scores e testar o laboratório.

Aplicação local: `pnpm dev`, ou `pnpm build` seguido de `pnpm start`. Em outro terminal: `pnpm worker:intelligence`. O worker consulta a base local a cada cinco minutos, registra uma análise diária por workspace ativo e reavalia observações de Reels elegíveis uma vez por dia. **Não chama APIs externas.** Continue mantendo `pnpm worker:crm` para atualizar eventos comerciais. São processos separados e precisam permanecer em execução; não foi instalado serviço de inicialização do Windows.

## Arquitetura

`Data Sources → Metrics → Evidence → Diagnosis → Recommendation → Confidence/Guardrails → Approval → Outcome`

| Camada | Implementação |
| --- | --- |
| Fontes | sources.ts e runtime.ts leem snapshots CRM/Meta locais do workspace; nenhuma chave integra o modelo de inteligência. |
| Métricas | math.ts e businessMetrics existente: contagens, razões ponderadas, dinheiro decimal, períodos, variação, média móvel, tendência, aceleração e volatilidade. |
| Evidências/diagnóstico | engine.ts: regras determinísticas com métricas identificadas, comparação equivalente e limiares configuráveis. |
| Confiança/suficiência | Avaliação de amostra, duração, sinais comparáveis, cobertura, atribuição, volatilidade e conflitos. |
| Narrativa | Interface IntelligenceNarrator; LocalNarrator traduz os resultados estruturados em briefing. Um provider LLM futuro pode substituir a narrativa, mantendo cálculos e regras auditáveis. |
| Workflow | service.ts registra recomendações, deduplica, aplica cooldown, expira/substitui e permite uma decisão humana por recomendação. |
| Persistência | IntelligenceRepository + SqliteIntelligenceRepository. Chaves compostas por workspace e ID, transações BEGIN IMMEDIATE. Adaptador PostgreSQL futuro pode preservar os contratos. |
| UI/API | IntelligenceView, sidebar e API interna /api/workspaces/[id]/intelligence. Sessão, acesso ao workspace e origem são verificados no backend. |

Nenhum cálculo depende de prompt. Não há chat completo, agente autônomo ou execução Meta. As inferências são hipóteses explícitas: correlação não estabelece causa.

## Métricas e fontes

Mídia: investimento, impressões, cliques, CTR, CPC e CPM usam apenas insights importados e contas selecionadas com moeda/fuso compatíveis. Alcance/frequência não são somados entre públicos ou dias: aparecem somente quando há uma única linha agregada compatível. Diagnósticos que exigem frequência ficam indisponíveis quando esse dado não é comparável.

Comercial: leads, qualificação, agendamentos, conclusão/no-show, propostas, vendas, receita e ticket derivam dos eventos/snapshots CRM. Calls → propostas/vendas usam leads distintos da coorte de calls realizadas; não se divide simplesmente propostas por calls de coortes sem relação. Métricas existentes do funil mantêm sua documentação de origem.

Eficiência: CPL, custos por etapa, CAC e ROAS exigem investimento e conversões atribuíveis. Receita comercial total continua distinta da receita atribuída. CAC permanece uma aproximação por lead comprador, porque não há customer_id no contrato CRM. Dinheiro usa strings decimais/BigInt; percentuais de mudança monetária são calculados a partir de razões decimais, não somas em float.

**0 ≠ desconhecido.** Zero vendas após uma leitura válida representa zero observado. Sem fonte/sincronização válida, vendas são desconhecidas. Denominador zero resulta em Não disponível, não infinito. O adaptador não usa fixtures antigas para completar métricas reais. Há uma proteção adicional no motor que remove métricas demo e razões financeiras derivadas ao receber uma análise real com mídia simulada.

Cobertura:

- Meta: dias de insights disponíveis / dias solicitados; não prova cobertura de todos os ativos existentes no fornecedor.
- CRM: 100 quando a leitura válida cobre a data inicial e chega ao fim do período; 50 para cobertura temporal parcial; desconhecido sem leitura válida.
- Atribuição: proporção de vendas com lead exact/strong; sem vendas, usa os leads disponíveis. Evidência não significa que todo ID foi confirmado na Meta; as razões financeiras exigem a confirmação adicional existente.
- Criativos: proporção dos criativos cadastrados que foram avaliados e têm vínculo com métricas comerciais. Desconhecido sem cadastro.

A cobertura não é um certificado de integridade do fornecedor. Eventos ausentes na origem, mudanças históricas e latência podem limitar qualquer interpretação.

## Data Sufficiency

Defaults centralizados e editáveis em config.ts/Configurações de Inteligência:

| Estado | Critério inicial |
| --- | --- |
| INSUFFICIENT | Menos de 3 dias, ou menos de 20 leads e 100 cliques, ou ausência de cobertura mínima. |
| LOW | Há sinal inicial, mas faltam 20 leads ou 7 dias para avaliação mais madura. |
| MODERATE | Volume mínimo e duração adequada, abaixo da amostra forte. |
| STRONG | Pelo menos 100 leads, 7 dias e cobertura relevante de 90% ou mais. |

Os números são parâmetros operacionais iniciais, não benchmarks científicos. INSUFFICIENT produz **WAIT_FOR_DATA / AGUARDAR MAIS DADOS**. Regras comerciais também exigem denominadores mínimos, como 10 calls; escala exige vendas mínimas, investimento, alvo e cobertura.

## Confidence Engine

Score heurístico de 0–100, limitado atualmente a 95; não é probabilidade calibrada:

- Base 15; volume contribui até 25; duração até 15.
- Sinais com comparação calculável contribuem até 15. Base anterior zero/ausente não conta como comparação válida.
- Atribuição contribui até 10; presença de CRM com cobertura temporal completa, 10.
- Consistência da série de leads contribui até 10; volatilidade elevada não recebe esse bônus.
- Cada conflito reduz 12; aprendizado reduz 15; período anterior incompleto reduz 15.
- Tetos: INSUFFICIENT 29, LOW 49, MODERATE 69 e STRONG 95.
- Níveis: abaixo de 50 baixa; 50–69 moderada; 70–84 alta; 85–95 muito alta.

Confiança alta exige suficiência forte. Qualidade do lead e receita têm precedência sobre um CPL isolado na interpretação. Exemplo: CPL pior + qualificação melhor gera MAINTAIN e explicita o conflito, em vez de sugerir pausa.

## Regras, gargalos e guardrails

Regras iniciais cobrem: necessidade de dados, estabilidade, deterioração de CTR/CPM/CPL, frequência, fadiga combinando CTR+CPM+frequência, baixa qualificação, CPL maior com melhor qualidade, agendamento, show rate, call → proposta/venda, CAC acima do alvo e oportunidade de escala com ROAS/CAC/vendas suficientes. Landing page é uma **hipótese de investigação** que exige cliques, taxa clique→lead disponível e comparação de CTR/CPC; não afirma falha técnica.

Bottleneck model: CREATIVE, MEDIA, LANDING_PAGE, LEAD_QUALITY, SCHEDULING, SHOW_RATE, SALES, CLOSING, ATTRIBUTION e INSUFFICIENT_DATA. Séries temporais permitem volatilidade/consistência; comparações históricas e entre pares mais sofisticadas continuam dependentes de dados comparáveis. O motor não classifica toda perda como falha do tráfego.

Ações modeladas: SCALE, MAINTAIN, REDUCE_BUDGET, PAUSE, TEST_NEW_CREATIVE, REPLACE_CREATIVE, WAIT_FOR_DATA, INVESTIGATE_LEAD_QUALITY, INVESTIGATE_SALES_PROCESS e INVESTIGATE_LANDING_PAGE. PAUSE/REPLACE_CREATIVE estão preparadas nos contratos e guardrails, mas esta primeira versão conservadora não as emite automaticamente. Sem alvos CAC/ROAS, não inventa uma oportunidade de escala por benchmark genérico.

Guardrails para propostas de alteração de mídia: suficiência moderada/forte, confiança mínima configurada (65), investimento mínimo (100 na moeda comercial), cinco vendas, cobertura Meta/CRM completa, atribuição mínima de 80%, ausência de aprendizado ou alteração recente. Aumento/redução sugeridos respeitam teto percentual configurado (20% cada, inicialmente). Não há execução, mesmo depois de aprovar.

Prioridade LOW/MEDIUM/HIGH usa confiança, proximidade comercial e tipo de ação. CRITICAL está no contrato, mas não é emitida sem uma política validada de impacto financeiro. Estimativas de receita perdida/gasto ineficiente têm estrutura própria, com valor nulo e método não estimado; nunca são exibidas como resultado garantido.

## Workflow, cooldown e Decision Journal

Cada recomendação inclui identidade, workspace, entidade, ação, título, resumo, evidências, diagnóstico, causa provável, impacto, sugestão, confiança, suficiência, prioridade, timestamps, validade, status, versão da regra, fontes, limitações e métricas anteriores.

Status: pending, approved, rejected, expired, superseded. Repetir a análise com a mesma regra e evidência não material preserva a recomendação vigente. Mudança material inicial: 25% em alguma evidência comparável. Cooldown inicial: 72 horas entre recomendações conflitantes sem mudança material. Validade inicial: 48 horas. Uma versão nova da regra permite substituir a análise antiga; registros antigos continuam auditáveis. Alterações aprovadas são tratadas conservadoramente como sinal de mudança recente, sem afirmar que foram executadas.

Decisões são transacionais e preservam uma cópia da recomendação e das métricas do momento. Uma segunda aprovação/rejeição do mesmo registro falha. Motivos opcionais: estratégia comercial, campanha em teste, informação desconhecida, recomendação incorreta ou outro. Notificações são internas, com leitura por usuário, sem WhatsApp/e-mail/push.

Outcome Tracking verifica a janela posterior à decisão após os dias configurados (sete inicialmente), usando dias completos. Compara taxas de qualificação, show, fechamento e ROAS quando disponíveis. Exige janelas compatíveis e cobertura; sinais conflitantes ou dados insuficientes permanecem inconclusive. positive/neutral/negative descrevem variação observada, não efeito causal nem confirmação de execução. Demonstração não produz outcomes apresentados como reais.

Diário: um registro por dia/workspace/modo, com resumo, riscos, oportunidades, gargalos, recomendações, decisões, resultados comerciais e criativos em observação. Testes ativos/concluídos permanecem zero nesta etapa porque execução paga está desabilitada. Auditoria registra criação/decisão de recomendação, configuração, cadastro, proposta, aprovação, score e outcome.

## Traffic Health

Índice heurístico parcial 0–100: média dos componentes disponíveis de cobertura de mídia/criativos, qualificação, show rate, fechamento, atribuição e cobertura CRM. São necessários três componentes; ausentes ficam fora e são mostrados. Os pesos iniciais são iguais. Comparar scores com coberturas diferentes exige cautela. Não é ROAS, lucratividade ou probabilidade. A fórmula é uma fundação explícita para evolução, não uma nota financeira absoluta.

## Persistência e segurança

Tabelas intelligence_config, intelligence_recommendations, intelligence_decisions, intelligence_creatives, intelligence_reel_tests, intelligence_journal, intelligence_notifications e intelligence_audit. Cada registro tem workspace e ID; payloads são JSON com decimais textuais. SQLite WAL, FK e transações preservam isolamento e consistência de decisões. A página administrativa e sua API exigem admin; todas as outras operações exigem sessão e vínculo com workspace ativo. Objetos de outra empresa retornam acesso negado/não encontrado.

O adaptador não lê credenciais Meta nem entrega chave CRM ao narrador/UI. Não há novas variáveis secretas. .env.local e o banco permanecem fora dos pacotes/versionamento. Antes de ativar esta versão foi feito backup local do banco existente.

## Validação e limitações

Comandos: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:http`. Nesta máquina restrita, os mesmos testes foram compilados com tsc e executados pelo runner nativo sem subprocesso. Veja VALIDATION.md.

149 resultados aprovados: 128 na suíte de domínio/serviços e 21 HTTP, correspondentes a 142 cenários + 7 grupos. A nova suíte tem 53 cenários (55 resultados com seus dois grupos), além de três cenários HTTP novos. Cobrem suficiência, confiança, conflitos, regras, workspace, fontes mistas, scores, workflow, cooldown, rastreamento e teto de testes.

Limites atuais: heurísticas precisam de calibração; snapshots CRM não reconstroem perfeitamente estado histórico; atribuição parcial limita conclusões; atualizações do diário são diárias/sob demanda, não streaming; operações locais não registram execução externa real; padrões são associações descritivas; histórico completo em memória é adequado ao desenvolvimento local, não a grandes volumes. A integração real Meta continua pendente. Nenhum teste aqui prova resultados futuros de aquisição.

## O que depende da Meta futura

1. Autorização e importação de campanhas, conjuntos, anúncios, criativos e insights reais completos.
2. Métricas orgânicas de Reels/perfis, thumbnails e disponibilidade efetiva de retenção/seguidores/visitas.
3. Agregados comparáveis de alcance/frequência para diagnósticos temporais sem somar públicos.
4. Objetivos publicitários realmente disponibilizados pela Meta para crescimento e conversão.
5. Criação e ativação de testes pagos aprovados, conciliando IDs planejados com IDs reais.
6. Monitoramento do gasto, entrega e resultados durante/depois do teste; estados paid_testing, candidatos e conclusão.
7. Classificação operacional winner/loser e eventual execução humana autorizada de escala/manutenção/pausa com guardrails.
8. CAC/ROAS reais por criativo quando investimento e conversões tenham atribuição confirmada.

Não depende da Meta: análise do CRM disponível, suficiência, workflow, diário, cadastro/taxonomia manual, avaliação orgânica manual com histórico, propostas e aprovação local. A conexão da Meta, por si só, não habilitará execução automática: essa capacidade requer uma implementação futura explícita.

## Arquivos da fase

Criados: src/intelligence/types.ts, config.ts, math.ts, sources.ts, engine.ts, narrator.ts, creative.ts, repository.ts, service.ts, runtime.ts, server.ts e demo.ts; src/data/intelligence-sqlite.ts; src/features/intelligence-engine/view.tsx; src/styles/intelligence.css; scripts/intelligence-worker.ts; src/app/api/workspaces/[id]/intelligence/route.ts; tests/intelligence.test.ts; TRAFFIC_INTELLIGENCE_ENGINE.md; CREATIVE_INTELLIGENCE.md; REELS_LAB.md.

Alterados: src/components/workspace-frame.tsx, src/components/shell.tsx, src/app/(dashboard)/[section]/page.tsx, src/app/globals.css, src/crm/metrics.ts (reuso de formatadores de data, sem mudança de cálculo), tests/http/auth.integration.ts, package.json, README.md e VALIDATION.md. Versão 0.6.0. Arquitetura de autenticação, workspace, cliente CRM, cursor e integração Meta foi preservada.
