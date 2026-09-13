> Atualização 0.4: a integração Meta simulada foi substituída por OAuth e leitura real. Consulte [META.md](META.md); as notas de simulação abaixo descrevem a versão anterior. Login e permissões de workspace permanecem válidos.

# Workspaces e integrações — versão 0.3

A aplicação continua em http://localhost:3000. Login, usuários e credenciais existentes foram preservados. Não é necessário repetir o seed. O primeiro acesso aplica a migração transacional 2 ao SQLite existente, sem apagar tabelas de autenticação. Foi feito backup local antes desta atualização.

## O que foi criado

- Workspaces Scale Digital, Loca Easy e Dinamix; cadastro, edição, ativação, detalhes e equipe. Slug único, timezone IANA, moeda BRL/USD/EUR e descrição.
- Seletor real com navegação completa e contexto explícito em `?workspace=<id>`. O cookie HttpOnly guarda a preferência; nunca concede permissão.
- Administradores têm acesso global. Gestores acessam somente workspaces ativos com vínculo. As guardas consultam sessão, perfil e vínculo no backend em cada operação. APIs retornam 403 e páginas redirecionam para Acesso restrito em contexto proibido.
- Gestores anteriores à migração mantêm acesso apenas à Scale Digital. Novos gestores começam sem workspace e precisam ser vinculados pelo administrador. Remover um vínculo também remove suas atribuições às contas daquele workspace.
- Integrações Meta Ads, CRM, Google Ads, WhatsApp e Google Analytics. Todas começam desconectadas. Somente Meta possui fluxo funcional de simulação; demais cards ficam em breve.
- Meta permite simular conexão, sincronizar e desconectar. Mostra usuário da sessão, Business Manager do workspace, horário e quantidade de contas. Não há OAuth, tokens ou chamadas externas.
- Contas simuladas permitem controlar sincronização, atribuir gestores da equipe e transferir para workspace ativo com Meta simulada conectada. Contas inativas não sincronizam. A transferência muda a propriedade e remove atribuições anteriores. Desconectar preserva as contas, desligando sua sincronização; reconectar não duplica nem recupera contas transferidas.
- Campanhas, métricas diárias, leads, criativos, recomendações e diário carregam `workspaceId`. As fixtures são centralizadas no repositório e variam por empresa. IDs de campanha são locais ao workspace: a identidade completa é workspace + ID.
- Metas são compartilhadas pela equipe e persistidas por workspace no SQLite. Decisões de recomendações continuam locais, com chave usuário + workspace. As decisões antigas do usuário são lidas somente em Scale Digital. Metas antigas do navegador podem ser importadas explicitamente na tela Metas da Scale Digital; não sobrescrevemos metas compartilhadas automaticamente.

A atribuição de gestores por conta prepara o modelo futuro; hoje a autorização operacional é por workspace. Um gestor autorizado vê todas as contas pertencentes ao seu workspace. As campanhas demonstrativas ainda não derivam das contas conectadas; mover uma conta não transfere campanhas fictícias. Alterar moeda muda a apresentação, não executa conversão cambial. Timezone é armazenado para uso na futura ingestão; o período demonstrativo continua fixo.

## Como testar

1. Entre com o administrador existente e abra Workspaces. Crie uma empresa ou edite uma das três iniciais; teste nome, slug, moeda, timezone e status.
2. Use o seletor da sidebar para alternar Scale Digital, Loca Easy e Dinamix. Confira os nomes das campanhas e os valores no dashboard. Salve metas distintas e alterne novamente para verificar a persistência.
3. Crie um gestor em Usuários. Em Workspaces → detalhes da empresa → Equipe, selecione-o e salve. Entre com ele em outra sessão ou após sair do administrador. Só o workspace atribuído aparece. Usuários e Workspaces não aparecem na sidebar.
4. Como gestor, tente `/workspaces`, `/usuarios` e `/?workspace=ws-loca` quando não tiver esse vínculo. O acesso é bloqueado. Ele continua usando as oito áreas operacionais; Integrações fica somente para consulta.
5. Como administrador, escolha Scale Digital → Integrações → Conectar Meta → Simular conexão. Confira Lucas Lima (ou o nome da sessão), Scale Digital e três contas. Abra Contas conectadas, alterne sincronização e atribua gestores já vinculados à equipe.
6. Para transferir uma conta, simule Meta também no destino e use Gerenciar na conta para selecionar esse workspace. Verifique que ela desaparece da origem e aparece no destino. Só os gestores do destino podem ser atribuídos.
7. Teste Sincronizar agora e Desconectar; o horário muda na simulação e o status volta a Não conectado. Entre com o gestor e confirme que não há controles de conexão. Os endpoints também bloqueiam essas ações.
8. Desative um workspace ou remova o gestor da equipe: o acesso seguinte dele será bloqueado. Login, logout e administração de usuários continuam funcionando.

## Arquivos principais

| Arquivo/pasta | Responsabilidade |
| --- | --- |
| `src/workspaces/types.ts` | Entidades e contrato WorkspaceStore |
| `src/workspaces/service.ts` | Validação, autorização, equipes, metas e contas |
| `src/workspaces/server.ts` | Composição e resolução segura do workspace |
| `src/data/workspace-sqlite.ts` | Migração, transações e persistência |
| `src/data/mock.ts` | Dados operacionais simulados por workspace |
| `src/integrations/contracts.ts` | Interfaces futuras OAuth, token vault, Marketing API e sync |
| `src/integrations/mock-provider.ts` | Catálogo e descoberta simulada de contas |
| `src/components/workspace-{frame,selector,link}.tsx` | Contexto e navegação |
| `src/components/providers.tsx` | Dados, metas e decisões por workspace |
| `src/features/workspaces/` | Gestão administrativa e equipe |
| `src/features/integrations/` | Cards e contas conectadas |
| `src/app/api/workspaces/` | Endpoints protegidos |
| `tests/workspaces.test.ts` e `tests/http/auth.integration.ts` | Isolamento e regressões |

## Persistência e próxima etapa

SQLite contém `workspaces`, `workspace_users`, `integrations`, `ad_accounts`, `workspace_ad_accounts`, `ad_account_users` e `workspace_goals`, com índices, unicidade, chaves estrangeiras e transações. Cada conta tem um único workspace proprietário. Nenhuma credencial Meta é persistida nesta fase.

A próxima etapa é implementar OAuth Meta no servidor com state de uso único vinculado ao usuário/workspace, armazenamento criptografado e renovação de tokens, descoberta real de Business Managers/contas/pages/pixels e importação de campanhas, conjuntos, anúncios, criativos e insights. A sincronização incremental deve ter paginação, cursores, retries, rate limits e idempotência por workspace/conta/recurso. Substituir o provider simulado sem transferir segredos ao frontend.

Para PostgreSQL, implementar os contratos AuthStore e WorkspaceStore em adaptadores assíncronos, converter serviços e transações para promises, migrar dados e preservar as mesmas guardas/testes. Não basta alterar uma URL. Antes de produção, acrescentar auditoria de alterações de equipes/conexões, isolamento em consultas reais e testes de concorrência.

## Verificações

Com Node 24 e pnpm 11: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:http`. Os testes HTTP usam banco isolado e senhas aleatórias, sem alterar credenciais locais. Resultados desta entrega em VALIDATION.md.
