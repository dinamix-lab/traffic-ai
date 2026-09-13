# Traffic AI 0.6

SaaS de gestão de tráfego em português, com autenticação, workspaces isolados, integração read-only Dinamix Vendas e estrutura Meta. A versão 0.6 adiciona Traffic Intelligence Engine, Creative Intelligence e Laboratório de Reels semiautomático. Aprovar registra decisões locais; não executa ações Meta. Nenhuma chave OpenAI é necessária.

**Comece por [AUTH.md](AUTH.md)** para criar o primeiro administrador e testar os perfis. Essa documentação descreve também a segurança e a migração para PostgreSQL.

## Inteligência e Laboratório de Reels

Leia [TRAFFIC_INTELLIGENCE_ENGINE.md](TRAFFIC_INTELLIGENCE_ENGINE.md), [CREATIVE_INTELLIGENCE.md](CREATIVE_INTELLIGENCE.md) e [REELS_LAB.md](REELS_LAB.md). Em Traffic AI, escolha a janela e clique Atualizar análise. Recomendações explicam evidências/confiança; aprovações e rejeições ficam no Diário da IA. Configurações são administrativas e pertencem ao workspace.

Mantenha `pnpm worker:intelligence` em um terminal separado para análise diária e observação de Reels. Esse worker só lê dados locais e grava inteligência local; continue com `pnpm worker:crm` para sincronizar a fonte comercial. O modo Demonstração isolada permite explorar cenários sem misturar mídia simulada com CRM real.

## Dinamix Vendas — configurar antes de sincronizar

Leia [DINAMIX_CRM_INTEGRATION.md](DINAMIX_CRM_INTEGRATION.md). Configure DINAMIX_TRAFFIC_AI_API_KEY no arquivo privado .env.local e confirme o vínculo DINAMIX_CRM_WORKSPACE_SLUG=dinamix-eletricos, a data DINAMIX_CRM_INITIAL_SINCE e a moeda. Reinicie a aplicação, use Verificar conexão e Sincronizar agora em Integrações, depois mantenha `pnpm worker:crm` em outro terminal para polling a cada dois minutos. O cursor será indicado como Checkpoint persistido, sem exibir seu conteúdo. Não envie a chave no chat.

O CRM já foi configurado localmente e importou eventos reais na etapa anterior. A versão 0.6 preserva a credencial privada, o administrador, os eventos e o cursor, sem reler/exibir o segredo durante a entrega. Novas instalações precisam configurar sua própria credencial privada.

## Meta real — configurar antes de conectar

Leia [META.md](META.md) para o checklist completo, arquitetura, segurança, limitações e teste real. **Não envie App Secret ou tokens pelo chat.**

1. Prepare uma URL HTTPS para a aplicação e defina APP_ORIGIN com essa origem.
2. No Meta Developers, configure o app empresarial com Marketing API e Facebook Login; associe os ativos e papéis de teste.
3. Cadastre o redirect exato: **https://SEU-DOMINIO/api/meta/oauth/callback**.
4. Permissão mínima: **ads_read**. Opcionais para descoberta: business_management, pages_show_list, pages_read_engagement e instagram_basic. Não há ads_management ou publicação. O fluxo de Instagram via Facebook Login exige conta profissional vinculada a página. Para usuários fora dos papéis do app, confirme Advanced Access, App Review, verificações e requisitos de privacidade/exclusão no painel da Meta.
5. No arquivo privado **.env.local**, insira META_APP_ID, META_APP_SECRET, META_REDIRECT_URI e APP_ORIGIN. META_API_VERSION=v26.0. META_SCOPES=ads_read por padrão; META_LOGIN_CONFIG_ID é opcional para Facebook Login for Business com user token. TOKEN_ENCRYPTION_KEY deve conter 32 bytes aleatórios em base64; o comando pnpm prepare:meta gera e preserva essa chave localmente sem exibi-la. Já foi executado neste computador.
6. Reinicie, entre pelo domínio HTTPS e selecione **Dinamix Elétricos → Integrações → Conectar Meta**. Autorize na Meta, conclua o retorno, selecione contas e sincronize. Nunca cole tokens manualmente.

A versão v26 foi verificada nas [releases oficiais do SDK Meta](https://github.com/facebook/facebook-nodejs-business-sdk/releases). Requisitos de acesso foram cruzados com a [coleção oficial Marketing API](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi) e [Instagram da Meta](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00). Algumas páginas do portal Developers retornaram HTTP 429; a limitação de pesquisa e as referências estão registradas em META.md.

Limitações desta entrega: homologação real pendente de configuração; até 20 contas, 60 dias completos e 100 páginas por endpoint em sincronização manual limitada; recursos opcionais podem faltar por permissão; tokens expirados exigem Reconectar. O CRM da versão 0.5 fornece receita e ROAS quando existe atribuição e mídia compatível. Métricas ausentes não são inventadas. Depois de uma conexão real, histórico Meta nunca é misturado com demonstração.

> Traffic AI não deve otimizar métricas isoladas.
> Traffic AI deve otimizar resultado de negócio.

A inteligência futura deverá considerar Meta Ads + performance criativa + qualidade dos leads + calls + vendas + receita.

## Arquitetura inicial e evolução

- Next.js App Router + React + TypeScript estrito: rotas reais e base adequada a um futuro backend no mesmo projeto.
- Tailwind CSS 4 e CSS com tokens: interface própria, sem biblioteca de componentes pesada. Lucide para ícones.
- `src/domain`: contratos e funções puras para métricas, metas e decisões. Métricas de razão são calculadas a partir dos totais, nunca pela média de percentuais.
- `src/data`: fixture determinística e repositório assíncrono simulado. É o ponto de substituição por persistência PostgreSQL; componentes não consultam APIs externas.
- `src/components`: shell, controles e visualizações reutilizáveis.
- `src/features`: telas e interações organizadas por capacidade de produto.
- `src/app`: composição das rotas, estados de carregamento, erro e não encontrado.
- Metas persistem em SQLite por workspace. Decisões de recomendações persistem neste navegador por usuário e workspace, com validação de dados. Aprovar registra uma decisão; jamais executa alteração em anúncios. Erros de armazenamento são exibidos.
- Sem ORM, fila ou SDK antecipados. Gráficos SVG acessíveis e testes com o runner nativo do Node via tsx evitam dependências sem necessidade.

## Executar localmente

Requisitos: Node.js 24 LTS recomendado (mínimo 22.13) e pnpm 11 (`corepack enable`, quando disponível, ou `npm install -g pnpm@11.19.0`).

```sh
pnpm install --frozen-lockfile
# Configure .env.local conforme AUTH.md antes de executar o seed.
pnpm seed:admin
pnpm dev
```

Abra http://localhost:3000/login. Para produção local:

```sh
pnpm build
pnpm start
# Em outro terminal, para polling comercial:
pnpm worker:crm
# Em outro terminal, para análise diária local:
pnpm worker:intelligence
```

Verificações:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No Replit: importe esta pasta como projeto Node, instale com `pnpm install --frozen-lockfile`, configure o build como `pnpm build` e a execução como `pnpm start`. O servidor escuta em `0.0.0.0`; `PORT` pode ser definido pela hospedagem. A publicação não faz parte desta entrega.

## Escopo V1

Visão geral com oito indicadores, comparativos, evolução e alertas; campanhas pesquisáveis com detalhes; central Traffic AI; recomendações com aprovação/ignoradas; performance de criativos; metas editáveis; CRM com atribuição e etapas do funil; diário simulado. Períodos fixos de demonstração: últimos 7, 14 ou 30 dias até 12/09/2026. A janela anterior tem a mesma duração. Vendas representam conversões; o CRM é uma amostra identificada, não a lista completa de leads das métricas.

O score e os diagnósticos são heurísticas demonstrativas, não saídas de um modelo de IA. A confiança é ilustrativa. As metas ainda não recalculam as recomendações simuladas. Não há sincronização, automação ou ações publicitárias reais. Login e gestão de usuários foram adicionados na versão 0.2.

## Evolução planejada

1. Validar navegação, indicadores, metas e fluxo de aprovação com gestores; definir atribuição, fuso horário e o significado de conversão.
2. Autenticação e organizações: autorização por tenant em todas as consultas, papéis, auditoria e isolamento antes de receber dados reais.
3. PostgreSQL: organizações, contas, campanhas, conjuntos, anúncios, criativos, snapshots diários, leads, metas, recomendações, decisões e execuções. Valores monetários em centavos; chaves externas e unicidade por conta + identificador externo + dia.
4. Meta Marketing API por OAuth no servidor: tokens criptografados, escopos mínimos, jobs idempotentes, paginação, rate limits, retries e reconciliação. A interface de repositório será implementada por um adaptador PostgreSQL.
5. Motor de métricas e evidências: janelas comparáveis, qualidade dos dados e detecção de fadiga testável. OpenAI somente no servidor, recebendo evidências normalizadas e retornando recomendações com esquema validado.
6. Execução separada da aprovação: revisão de permissões e orçamento, idempotência, validade temporal, dry run, registro de resultado e mecanismo de interrupção. Nunca executar diretamente do clique de aprovação.
7. CRM por eventos idempotentes e identidade/atribuição reconciliada; qualidade dos leads, receita e ROAS.
8. Autonomia opt-in com limites de gasto, políticas, monitoramento, rollback quando possível e auditoria.

Fluxo futuro: Meta → sincronização → PostgreSQL → motor de métricas → análise IA → recomendação → aprovação → fila de execução → Meta.

## Ambiente e segurança

`.env.example` documenta a origem da aplicação, o banco SQLite, o seed do administrador e variáveis de integrações futuras. Consulte `AUTH.md` para configurar o acesso. Segredos nunca devem ter prefixo `NEXT_PUBLIC_`, aparecer no cliente ou ser versionados. Armazenamento local não é cofre nem banco de produção. Chamadas Meta são feitas somente no servidor após configuração e autorização; o modo demo não faz chamadas externas.

Referência da stack: https://nextjs.org/docs/app/getting-started/installation

## Atualização 0.2 — autenticação

As decisões iniciais acima descrevem a base da V1. A camada `src/auth`, o adaptador `src/data/auth-sqlite.ts`, os endpoints `/api/auth` e `/api/users` e as telas de login e Usuários foram adicionados sem alterar as métricas e campanhas. A versão 0.3 acrescenta isolamento por workspace; PostgreSQL continua futuro. Detalhes de instalação, seed, segurança e testes em [AUTH.md](AUTH.md).

## Atualização 0.3 — workspaces e integrações

Seletor real, equipes, metas por empresa e Meta simulada. Leia [WORKSPACES.md](WORKSPACES.md) para arquitetura, migração e roteiro de teste. Login e administrador existentes são preservados; não execute novamente o seed em um banco já configurado.
