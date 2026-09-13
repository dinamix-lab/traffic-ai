# Validação — Traffic AI 0.6

Validação concluída em 13/09/2026 sobre o build de produção entregue.

- ESLint aprovado sem erros ou avisos.
- TypeScript estrito (tsc --noEmit) aprovado.
- Build de produção Next.js aprovado.
- Autenticação, domínio, workspaces, Meta, CRM e inteligência: 128 resultados aprovados (122 cenários e seis grupos).
- HTTP contra produção e SQLite isolado: 21 resultados aprovados (20 cenários e um grupo).
- Total: **149 resultados aprovados, correspondentes a 142 cenários e sete grupos**.

## Cobertura desta fase

A suíte de inteligência acrescenta 53 cenários em dois grupos. Exercita suficiência, confiança, comparações e tendências, conflitos, limites financeiros, cooldown, aprendizado, expiração, isolamento de fontes e workspaces, valores monetários exatos, scores, padrões, decisões e diário, persistência, permissões, transições de Reels, propostas, tracking e aprovação sem execução. Três cenários HTTP novos validam autorização/CSRF/configuração administrativa, análise e decisões demonstrativas e bloqueio de propostas sem evidência suficiente.

Os testes anteriores continuam passando: login correto/incorreto, usuário inativo, administrador/gestor, proteção de rotas, logout e associação a workspaces; OAuth e vault Meta com transporte simulado; sincronização CRM, paginação, cursor, retries, idempotência, rollback, atribuição e valores decimais exatos. Testes HTTP usam exclusivamente um banco separado.

## Conferência no navegador

- Sessão existente e integração CRM local preservadas; a integração mantém os 92 eventos já importados, sem duplicação observada.
- Central Traffic AI real conferida com evidências e aviso de dados insuficientes. Janelas de 3/7/14/30 dias usam dias completos até ontem; hoje é uma janela parcial explícita. Ausência de dados não é convertida em ROAS, receita ou resultado inventado.
- Em ambiente isolado, um Reel demonstrativo foi avaliado, recebeu proposta de teste e foi aprovado. O estado final foi **execução Meta pendente**. Nenhuma campanha ou gasto foi criado.
- Layout desktop das novas áreas conferido; ajustes de espaçamento e quebra das métricas incluídos no build final. Não foi feita conferência visual em dispositivo móvel nesta sessão.
- Aplicação e workers locais de CRM e inteligência deixados em execução. Servidores de teste encerrados após a conferência.

## Reprodução

Com Node 24 e pnpm 11: pnpm lint, pnpm typecheck, pnpm test, pnpm build e pnpm test:http.

Neste ambiente, o subprocesso usado pelo tsx é bloqueado. Os mesmos testes foram compilados com TypeScript e executados diretamente:

```sh
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --outDir ../../work/intelligence-test-build --module commonjs --moduleResolution node --target es2022 --esModuleInterop --skipLibCheck --strict --noEmit false tests/auth.test.ts tests/domain.test.ts tests/workspaces.test.ts tests/meta.test.ts tests/crm.test.ts tests/intelligence.test.ts tests/http/auth.integration.ts scripts/crm-worker.ts scripts/intelligence-worker.ts
node --test --test-isolation=none ../../work/intelligence-test-build/tests/auth.test.js ../../work/intelligence-test-build/tests/domain.test.js ../../work/intelligence-test-build/tests/workspaces.test.js ../../work/intelligence-test-build/tests/meta.test.js ../../work/intelligence-test-build/tests/crm.test.js ../../work/intelligence-test-build/tests/intelligence.test.js
node node_modules/next/dist/bin/next build
```

A validação HTTP final usou a porta 3106 e o diretório isolado work/traffic-ai-auth-intelligence-verified, configurados por TRAFFIC_TEST_ORIGIN e TRAFFIC_TEST_DIRECTORY. Nunca aponte fixtures HTTP para o banco real. O fluxo visual utilizou outro servidor isolado na porta 3105.

## Limites

Não houve validação de autorização, importação ou execução contra a Meta real nesta fase. Não há chamada real à OpenAI. Scores e confiança são heurísticas operacionais, sem calibração estatística; comparações posteriores não demonstram causalidade. Métricas orgânicas ainda são cadastradas manualmente. Execução paga, monitoramento durante o teste e classificação automática de vencedores dependem de etapa futura. Credenciais locais não foram lidas para conferência nem incluídas no pacote de distribuição.
