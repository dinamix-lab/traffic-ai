# Integração Dinamix Vendas — Traffic AI 0.5

> CRM = fonte oficial da verdade comercial.
> Meta = fonte oficial da verdade de mídia.
> Traffic AI = camada de inteligência que cruza ambos.

> Traffic AI não deve otimizar métricas isoladas.
> Traffic AI deve otimizar resultado de negócio.

O CRM continua responsável pelo processo comercial. Esta integração somente lê eventos. Não existe escrita no CRM, acesso direto ao seu banco, busca de dados pessoais em outros endpoints, automação Meta, OpenAI real ou Laboratório de Reels nesta entrega.

## Configurar e fazer a primeira leitura

1. Na raiz do projeto, edite o arquivo privado **.env.local**, já ignorado pelo Git. Insira a chave fornecida pelo Dinamix em `DINAMIX_TRAFFIC_AI_API_KEY`. Não use prefixo NEXT_PUBLIC, não coloque a chave no código, em URLs, em .env.example ou no chat. Use aspas no valor se a chave contiver caracteres especiais. O servidor e o worker devem receber a mesma configuração e apontar para o mesmo SQLite.
2. Confira as configurações abaixo. O workspace local é **Dinamix Elétricos**, slug `dinamix-eletricos`. Não informe tenant_id: o CRM resolve o tenant pela chave. Não altere o vínculo para reutilizar uma importação de outra empresa.
3. Reinicie a aplicação para carregar o ambiente. Em produção local: `pnpm build` e `pnpm start`. Em outro terminal, execute `pnpm worker:crm`. Para conferir manualmente a primeira leitura antes do polling, inicie o worker apenas depois do passo 5.
4. Como administrador, selecione **Dinamix Elétricos → Integrações → Dinamix Vendas / CRM → Verificar conexão**. O backend chama GET /health e valida status=ok, service=crm e version. O card passa a Conectado e registra último health/versão. Health não equivale a uma sincronização de dados bem-sucedida.
5. Clique **Sincronizar agora**. Sem cursor, o backend usa `since` e `limit=100`; com cursor persistido, usa somente `cursor` e `limit=100`. As páginas são drenadas enquanto has_more=true. A tela mostra eventos processados e histórico sanitizado.
6. Confira **Cursor: Checkpoint persistido**, total importado, eventos da última execução e última sincronização com sucesso. O cursor completo nunca é exibido ou decodificado. Atualize o Funil de Receita e escolha um período que cubra os eventos importados.
7. Mantenha o worker em execução para polling automático. Alterar .env.local exige reiniciar **ambos** os processos. Em implantação permanente, use um supervisor de processos; iniciar pelo terminal não configura serviço de inicialização do Windows.

| Variável | Padrão / finalidade |
| --- | --- |
| DINAMIX_TRAFFIC_AI_API_KEY | Sem padrão. Credencial privada obrigatória para chamadas reais. |
| DINAMIX_CRM_WORKSPACE_SLUG | dinamix-eletricos; vínculo local único desta credencial. |
| DINAMIX_CRM_INITIAL_SINCE | 2026-01-01T00:00:00.000Z; só vale antes do primeiro cursor. |
| DINAMIX_CRM_POLL_SECONDS | 120; inteiro entre 30 e 86400 segundos após concluir cada ciclo. |
| DINAMIX_CRM_CURRENCY | BRL; também aceita USD/EUR. O contrato de eventos não informa moeda: confirme antes de importar. |
| SQLITE_PATH | data/traffic-ai.sqlite; mesma base da autenticação e workspaces. |

Neste computador, a aplicação e um worker foram iniciados, mas a chave estava ausente. O estado é **Desconectado / aguardando configuração**, com zero eventos reais; não houve teste contra o CRM de produção. O administrador existente foi preservado e não precisa de outro seed. As fixtures dos testes estão em um banco separado.

## Arquitetura

`DinamixClient → CrmService → handlers de eventos → CrmRepository → businessMetrics → telas Traffic AI`

- Cliente HTTP dedicado no backend, com transporte injetável para testes.
- Serviço de sincronização centraliza autorização, lease, paginação, transações e auditoria.
- Processador normaliza apenas campos permitidos; handlers atualizam snapshots e histórico.
- Repositório SQLite encapsula SQL e oferece transações. Uma implementação PostgreSQL poderá substituir esse adaptador; recomenda-se NUMERIC para dinheiro, JSONB para histórico e transações/leases compartilhados equivalentes.
- Métricas são funções puras sobre snapshots autorizados. Componentes React consultam somente a API interna da aplicação; nunca fazem chamadas diretas ao Dinamix nem recebem a chave.
- POST interno `/api/workspaces/[id]/crm` aceita ações health/sync e exige administrador, sessão válida, proteção de origem e acesso ao workspace. GET interno retorna snapshot autorizado. POST interno não é uma escrita no CRM externo.

O único destino externo é `https://arkom-crm-ia.replit.app/api/traffic-ai`, nos caminhos GET `/health` e GET `/events`. Autenticação exclusivamente no header Authorization: Bearer. Redirecionamentos são rejeitados. Não há chave em query string, analytics, respostas ou logs. Respostas remotas de erro nunca são repassadas ao usuário.

## Persistência, cursor e concorrência

| Tabela | Conteúdo |
| --- | --- |
| crm_integration_state | Workspace, nome da integração, cursor, tenant observado, timestamps, estado, erro sanitizado, cooldown, fingerprint privado da credencial e lease. |
| crm_processed_events | event_id globalmente único, workspace, tipo, occurred_at, processed_at e payload permitido para auditoria. |
| crm_leads | Snapshot por workspace + lead_id; atributos comerciais, aquisição original, versões por campo e evento de origem. |
| crm_calls | Snapshot por workspace + call_id, estado e datas; reagendamentos atualizam a mesma call. |
| crm_proposals | Snapshot por workspace + proposal_id; permite várias propostas por lead. |
| crm_sales | Snapshot por workspace + sale_id; permite várias vendas por lead, sem unique em lead_id. |
| crm_runs | Início, fim, duração derivada, status, páginas, eventos novos e erro sanitizado. Interface exibe as últimas 100 execuções. |
| crm_http_gate | Reserva durável do horário da próxima chamada, compartilhada pelo worker e pelas ações manuais. |

No SQLite, snapshots e estado usam JSON textual, com decimais armazenados como strings; IDs de entidade têm chave composta por workspace. WAL, foreign keys e busy_timeout estão habilitados. A criação das tabelas é idempotente e não substitui tabelas de autenticação, workspaces ou Meta.

Cada página é uma transação BEGIN IMMEDIATE: valida lease/cursor esperado → aplica todos os eventos e deduplica → atualiza entidades → salva histórico, progresso e next_cursor → COMMIT. Qualquer falha reverte a página inteira; páginas anteriores confirmadas continuam válidas. Uma repetição de event_id não aumenta receita nem contadores. Colisão de event_id entre workspaces falha de forma fechada.

Cursor é opaco: nunca decodificado, fabricado, transformado ou combinado com since. Uma página vazia pode confirmar novo cursor. next_cursor nulo em página vazia mantém o cursor anterior. Eventos ou has_more=true exigem cursor não vazio. Ciclos/repetição de cursor com has_more=true interrompem a execução. Erro de cursor nunca provoca reset automático.

Lease durável de 90 segundos, renovado entre chamadas/páginas e verificado antes de commit. Worker e botão manual usam o mesmo mecanismo. Outro processo não começa enquanto o lease estiver válido. Após expiração, um novo dono pode continuar; o dono anterior é impedido de gravar por verificação de propriedade. Execução abandonada fica registrada como interrompida quando outro processo assume.

O primeiro tenant_id recebido fica vinculado ao estado privado. Divergências posteriores ou traffic_workspace_id incompatível com o workspace local interrompem a página. Trocar a chave não apaga cursor nem muda tenant; fingerprint serve apenas para liberar uma configuração antes rejeitada. Migrar tenant exige procedimento administrativo explícito, com backup e novo vínculo; não existe botão de reset nesta etapa.

## Resiliência

- Timeout HTTP de 20 segundos, incluindo leitura da resposta; no máximo quatro tentativas por chamada.
- Timeout, rede e 500/502/503/504: backoff exponencial de 500, 1000 e 2000 ms, acrescido de jitter até 249 ms.
- 429: respeita Retry-After em segundos ou data HTTP. Espera curta ocorre na execução; espera superior a 60 segundos é persistida e a execução é adiada. Nunca ignora a reserva/cooldown para tentar imediatamente de novo.
- 400: registra erro sanitizado e interrompe, preservando cursor. Corrigir a causa com o fornecedor; não voltar ao since.
- 401: configuração inválida, sem retries. O worker aguarda mudança de chave ou health bem-sucedido para retomar. Repetir sync manual não envia chamadas enquanto a configuração permanece rejeitada.
- Intervalo mínimo de 1100 ms entre reservas HTTP, aproximadamente 54 chamadas/minuto nesta instalação, abaixo de 120/minuto. Outros serviços no mesmo IP podem consumir o limite do CRM; 429 continua sendo respeitado.
- Resposta limitada a 2 MiB, 100 eventos/página e cursor de até 16 KiB. Campo escalar até 2048 caracteres; contrato inválido interrompe sem avançar.

## Eventos e snapshots

Todos exigem event_id, event_type e occurred_at. O ID da entidade principal é obrigatório; demais campos podem ser ausentes/nulos. Ausência é patch sem apagar valor anterior. Datas devem ser ISO-8601 UTC com Z; versão de schema, quando fornecida, aceita 1/1.0.

| Evento | Handler / efeito |
| --- | --- |
| lead_created | Cria/atualiza lead_id; mantém primeira data de criação conhecida. |
| lead_updated | Atualiza campos comerciais presentes. |
| lead_qualified | Registra primeira qualificação conhecida e seu estado. |
| lead_lost | Registra perda, status e motivo recebido; preserva histórico de qualificação. |
| call_scheduled | Cria/atualiza call_id e data agendada; mantém primeira ocorrência de agendamento. |
| call_completed | Atualiza a mesma call para completed e registra conclusão. |
| call_no_show | Atualiza a mesma call para no_show. |
| call_cancelled | Atualiza a mesma call para cancelled. |
| proposal_created | Upsert por proposal_id, vínculo opcional ao lead, vendedor, status e valor decimal. |
| sale_completed | Upsert por sale_id, vínculo opcional ao lead, vendedor, valor decimal e produto_oferta. |

Não existe handler lead_disqualified. Evento desconhecido interrompe a página para revisão do contrato.

Eventos de call/proposta/venda sem lead_id são preservados como entidades sem vínculo, sem inventar lead. Quando lead_id existe antes de lead_created, cria-se uma representação mínima com a primeira observação conhecida. Vínculo existente da entidade com outro lead é rejeitado. Campos usam sequence quando disponível para ambos os eventos e, em seguida, updated_at/occurred_at; empate temporal sem sequência segue a ordem recebida. Eventos atrasados não regridem campos mais novos. Aquisição original é preservada; eventos anteriores podem estabelecer a origem real e campos desconhecidos podem ser completados.

Histórico contém apenas a lista permitida do contrato: controle, identificadores, atribuição, estados comerciais, vendedor, datas de calls e valores. Não são persistidos nome/e-mail/telefone do lead, mensagens, observações, prompts, senhas ou tokens. seller_name é permitido. Cada campo versionado e snapshot mantém referência ao evento que o alterou. O histórico de eventos fica disponível pelo repositório para auditoria futura; a interface administrativa atual mostra execuções, não um explorador de payloads.

## Valores, atribuição e métricas

Valores numéricos JSON são lidos como lexemas textuais antes de JSON.parse, evitando conversão monetária para float. Dinheiro utiliza strings decimais e BigInt com escala de 18 casas; soma exata, divisão arredondada. Aceita valores não negativos com até 30 dígitos inteiros e 18 decimais em notação decimal simples. Notação científica, negativos ou precisão maior são rejeitados com rollback, não arredondados silenciosamente. Ausência de sale_value torna receita total indisponível; subtotal conhecido é mostrado separadamente.

Prioridade de aquisição: traffic_* → exact/traffic_ids; meta_* → strong/meta_ids; UTMs → partial/utm; source → partial/source; nenhuma evidência → unattributed/unknown. traffic_workspace_id isolado não prova atribuição a campanha. Rótulos expressam a evidência recebida, não garantem correspondência com mídia importada. Dimensões mantêm prefixos traffic:, meta: e utm: para evitar confundir IDs com nomes.

Cruzamento financeiro exige IDs presentes nos recursos Meta selecionados e referências compatíveis; UTMs nunca são associados por semelhança de nome. IDs Traffic só cruzam mídia quando correspondem a IDs efetivamente importados; não existe mapeamento arbitrário entre IDs internos e Meta. Sem Meta, tabelas de campanhas/criativos apresentam evidência Traffic/UTM e informam ausência de mídia. Leads sem atribuição continuam nos totais comerciais.

- Volumes de cada etapa usam suas respectivas datas no fuso do workspace; não são todos uma única coorte. Calls agendadas contam IDs distintos na primeira ocorrência de agendamento; reagendar não aumenta o volume. Realizadas/no-show usam o estado atual e a data da etapa.
- Qualificação = leads da coorte qualificados até o fim selecionado / leads criados ou observados no período. Fechamento = leads da coorte com venda conhecida até o fim / leads da coorte. São taxas por lead, sem duplicar quem tem várias vendas.
- Show rate = realizadas / (realizadas + no-shows); canceladas ficam fora. Ticket médio = receita / quantidade de vendas. Divisor zero retorna Não disponível.
- Vendedor filtra leads pelo responsável atual; calls/propostas/vendas priorizam o vendedor da própria entidade e usam o lead como fallback. Não é uma reconstrução histórica da carteira de cada vendedor.
- Investimento é soma de spend decimal importado na janela disponível. Eficiência exige sincronização CRM bem-sucedida, moeda e fuso iguais aos das contas selecionadas. Falhas/incompatibilidades deixam razões indisponíveis.
- CPL e custos por etapa dividem investimento pelo volume atribuído confirmado. CAC usa leads compradores distintos como aproximação, pois não há customer_id neste contrato. ROAS/receita por unidade monetária investida usa receita atribuída confirmada, separada da receita comercial total. Filtro de vendedor desabilita custos/ROAS: não há investimento por vendedor para ratear.

Funil de Receita tem período, workspace no seletor global, campanha, conjunto, anúncio, criativo e vendedor quando existem dados. Visão geral adiciona cards comerciais; listagens de campanhas/criativos adicionam resultados agrupados. Mídia real existente permanece disponível. Após dados CRM reais, métricas demo não são misturadas ao resultado comercial. Antes de configuração/importação, o novo funil fica vazio e as demais áreas mantêm o modo de demonstração identificado da versão anterior.

BusinessScoreFoundation define entradas de qualidade de lead, calls, propostas, vendas, receita e eficiência; score e versão permanecem nulos, sem fórmula ou execução de otimização.

> Um criativo com CPL maior pode ser superior se gerar mais calls, vendas ou receita.

## Segurança e testes

Administrador verifica, sincroniza e consulta logs. Gestor lê métricas/funil somente dos workspaces vinculados; ações administrativas e acesso cruzado são bloqueados no backend. Inativação e revogação de sessão continuam vigentes e são revalidadas durante a sincronização manual. Cursor, tenant, dono do lease e fingerprint nunca integram o snapshot público. Logs só contêm mensagens fixas sanitizadas.

Execute `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` e `pnpm test:http`. Os testes CRM usam provider/HTTP mockados e SQLite temporário, sem dependência da API real ou de credenciais. Cobrem contrato, autenticação, since/cursor, páginas vazias, múltiplas páginas, duplicatas, rollback no meio da página, retomada, erro de cursor, 401/429/5xx/timeout, precisão decimal, opcionais, reagendamento, todos os estados de call, múltiplas propostas/vendas, atribuição, lease, vendedor e isolamento.

A validação desta entrega registrou 73 resultados na suíte de serviços/domínio e 18 na suíte HTTP: 91 resultados aprovados (86 cenários e 5 grupos). Consulte VALIDATION.md para comandos alternativos usados no ambiente restrito e limites da homologação.

## Troubleshooting e limites atuais

- **Aguardando configuração:** definir chave no ambiente privado e reiniciar servidor/worker; conferir slug e workspace ativo. Não inserir chave pela interface.
- **Health conectado, sem métricas:** health não importa eventos; executar sync e conferir período inicial/filtro, total e cursor.
- **Zero eventos:** pode ser resposta legítima. Uma página vazia pode criar checkpoint; não resetar por estar vazia.
- **Erro de contrato/400:** cursor preservado. Corrigir payload/versão/identificadores com o fornecedor; dados das páginas confirmadas continuam visíveis com aviso de importação incompleta.
- **401:** corrigir credencial, reiniciar e verificar conexão. Não há tentativa de contornar escopo do tenant.
- **429:** aguardar horário autorizado. Múltiplas instalações no mesmo IP precisam de coordenação externa; o limitador local compartilha apenas este SQLite.
- **Worker interrompido:** reiniciar no mesmo banco. O lease expira e a próxima execução retoma do último commit. Nenhuma instalação de serviço do sistema foi feita.
- **CAC/ROAS indisponível:** conferir Meta selecionada/sincronizada, IDs, moeda, fuso, dados financeiros completos, denominador e ausência de filtro de vendedor. Janela Meta continua limitada pela integração 0.4; não representa gasto fora do histórico importado.
- **Volumes históricos:** snapshots atuais não reconstroem integralmente estado/seller de cada entidade numa data passada. Histórico foi preservado para análise temporal futura. Data inicial que exclui lead_created pode limitar coortes; primeira observação é explicitamente usada como fallback.
- **Escala:** adequado a desenvolvimento local, com snapshots completos em memória e páginas transacionais. Para grandes volumes, implementar agregações SQL, paginação de leitura, retenção auditável, PostgreSQL e operação supervisionada. Sincronização manual longa ocupa uma requisição backend; o worker é indicado para cargas iniciais extensas.
- **Homologação:** contrato implementado conforme especificação fornecida, sem consulta a outros endpoints. Chave ausente impediu health/sync reais nesta sessão. Moeda não vem na API; confirme a configuração com a origem. Multi-tenant com várias credenciais não faz parte desta etapa.

## Arquivos desta etapa

Criados:

- src/crm/client.ts, config.ts, decimal.ts, types.ts: cliente/contratos/configuração/dinheiro exato.
- src/crm/service.ts, processor.ts, attribution.ts, metrics.ts, server.ts: sincronização, handlers, atribuição, métricas e composição backend.
- src/data/crm-sqlite.ts: tabelas, transações, leases e histórico.
- scripts/crm-worker.ts: polling automático.
- src/app/api/workspaces/[id]/crm/route.ts: API interna protegida.
- src/features/integrations/crm-card.tsx: card administrativo.
- src/features/business/funnel.tsx: funil, cards, filtros e tabelas comerciais.
- tests/crm.test.ts: cenários de CRM mockados.
- DINAMIX_CRM_INTEGRATION.md: este guia.

Alterados:

- .env.example e package.json: variáveis documentadas, comando worker:crm e versão 0.5.
- src/components/workspace-frame.tsx, providers.tsx e shell.tsx: composição de fontes, dados autorizados e navegação.
- src/app/(dashboard)/[section]/page.tsx: nova área de funil.
- src/app/(dashboard)/integracoes/page.tsx e src/features/integrations/meta-panel.tsx: composição do card CRM com integrações existentes.
- src/styles/workspaces.css: estilos coerentes com a interface atual.
- tests/http/auth.integration.ts: autorização, privacidade, dados comerciais e isolamento via HTTP.
- README.md e VALIDATION.md: operação e evidências atualizadas.
