# Meta real — Traffic AI 0.4

> Traffic AI não deve otimizar métricas isoladas.
> Traffic AI deve otimizar resultado de negócio.

Esta versão implementa OAuth e leitura da Marketing API. Não cria, edita, publica, pausa ou automatiza anúncios. Não integra OpenAI, CRM real ou laboratório de Reels. A integração só indica autorização concluída depois de trocar o código, consultar o usuário, confirmar ads_read e descobrir contas na Meta. Sem configuração, exibe **Aguardando configuração**.

## Configuração no Meta Developers — ordem de execução

1. Prepare uma origem **HTTPS** estável para o Traffic AI, em hospedagem de teste ou túnel HTTPS para localhost:3000. Não há serviço de túnel contratado/configurado nesta entrega. Configure `APP_ORIGIN` com essa origem e acesse o Traffic AI por ela; entre novamente, pois a sessão de localhost não pertence ao novo domínio.
2. Em [Meta for Developers](https://developers.facebook.com/apps/), crie/configure o aplicativo empresarial para Marketing API e o fluxo de Facebook Login adequado ao seu dashboard. Associe o Business da operação e confira o acesso do seu usuário à conta de anúncios Dinamix Elétricos. Uma conta Meta nova pode não ter conta de anúncios, Business, página ou Instagram profissional prontos.
3. Habilite o login OAuth web e registre exatamente `https://SEU-DOMINIO/api/meta/oauth/callback` nos **Valid OAuth Redirect URIs**. Configure os domínios e a URL do site correspondentes. Não use curingas. O app impõe HTTPS inclusive no fluxo local via túnel.
4. Solicite somente `ads_read` para a leitura inicial de contas, estrutura e insights. Permissões opcionais de descoberta: `business_management` para Businesses; `pages_show_list` para páginas; `pages_read_engagement` e `instagram_basic` para a descoberta do Instagram profissional vinculado a uma página. A ausência desses recursos não significa ausência de campanhas. Não solicitamos ads_management nem permissões de publicação.
5. Se usar **Facebook Login for Business**, crie uma configuração com **user access token**, ativos e permissões de leitura apropriados; informe seu Configuration ID em `META_LOGIN_CONFIG_ID`. Quando esse ID está definido, as permissões do diálogo vêm da configuração da Meta. O backend continua exigindo ads_read efetivamente concedido. Este adaptador não é um fluxo de system user/WhatsApp Embedded Signup.
6. Em desenvolvimento, use pessoa com papel de administrador/desenvolvedor/testador no app e acesso aos ativos. Para atender usuários/empresas fora dos papéis de teste, obtenha os acessos avançados exigidos no painel, App Review e verificações aplicáveis. Prepare política de privacidade, termos e mecanismo de exclusão de dados exigidos pela Meta antes de produção; esta entrega não publica essas páginas nem solicita revisão por você.
7. Insira as variáveis abaixo no **arquivo local `.env.local` da pasta do projeto**, usando seu editor, ou no gerenciador de segredos do servidor. Nunca as envie por chat, issue, commit, screenshot ou formulário da aplicação.
8. Reinicie o servidor. Em **Dinamix Elétricos → Integrações → Conectar Meta**, faça o login oficial e autorize. No retorno, clique **Continuar no Traffic AI**. Esse passo permite validar a sessão original sem enfraquecer o cookie SameSite=Strict.
9. Selecione as contas disponibilizadas e clique **Salvar seleção**. Depois **Sincronizar agora**. Verifique campanhas, conjuntos, anúncios, criativos, indicadores por conta e **Histórico de sincronização**. Uma conta nova sem campanhas deve mostrar um estado vazio, nunca resultados fictícios.
10. Compare com o Ads Manager usando a mesma conta, moeda, fuso, período e atribuição. Confira os avisos de recursos indisponíveis. Teste também um gestor vinculado somente ao workspace: pode consultar dados e última sincronização, mas não conectar, selecionar contas, sincronizar ou consultar logs.

## Variáveis de ambiente

| Variável | Conteúdo |
| --- | --- |
| APP_ORIGIN | Origem HTTPS pela qual você abrirá o Traffic AI |
| META_APP_ID | App ID do Meta Developers |
| META_APP_SECRET | App Secret; somente no ambiente privado do servidor |
| META_REDIRECT_URI | Origem acima + `/api/meta/oauth/callback` |
| META_API_VERSION | `v26.0`, versão fixada nesta implementação |
| META_SCOPES | `ads_read`; opcionais separados por vírgula, conforme recursos habilitados |
| META_LOGIN_CONFIG_ID | Opcional: configuração de Facebook Login for Business para user token |
| TOKEN_ENCRYPTION_KEY | 32 bytes aleatórios em base64, estável entre reinícios |
| SQLITE_PATH | Banco local persistente da aplicação |

`pnpm prepare:meta` cria o workspace Dinamix Elétricos se ausente, prepara as tabelas e gera a chave de criptografia em `.env.local` sem imprimi-la. Já foi executado neste ambiente. Não substitua a chave após autorizar uma conta: os tokens antigos ficariam ilegíveis. Guarde uma cópia protegida separada do banco; para rotação planejada, recriptografe com a chave antiga ou reconecte as integrações. A senha do administrador existente não foi modificada. Nenhum token precisa ser copiado manualmente.

## Requisitos verificados e fontes

Consulta em 13/09/2026. A versão v26 foi confirmada nas [releases do SDK oficial facebook/facebook-nodejs-business-sdk](https://github.com/facebook/facebook-nodejs-business-sdk/releases). A implementação usa fetch no servidor, sem adicionar esse SDK como dependência.

As condições Standard/Advanced Access e o uso de ads_read para leitura foram conferidos na [coleção oficial Marketing API da Meta no Postman](https://www.postman.com/meta/facebook-marketing-api/documentation/0zr4mes/facebook-marketing-api-mapi). O app e as permissões efetivamente aprovadas continuam sujeitos ao dashboard e à revisão da Meta.

A dependência entre Instagram profissional, página vinculada e permissões de Facebook Login foi conferida na [coleção oficial Instagram da Meta](https://www.postman.com/meta/workspace/instagram/documentation/23987686-9386f468-7714-490f-9bfc-9442db5c8f00). Não usamos Instagram Basic Display nem presumimos acesso a contas pessoais.

Referências adicionais: [OAuth manual](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/), [autorização Marketing API](https://developers.facebook.com/docs/marketing-api/get-started/authorization/), [long-lived user token](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/), [Insights](https://developers.facebook.com/docs/marketing-api/insights/). Essas páginas do portal retornaram HTTP 429/indisponibilidade durante a consulta; não foi possível validar integralmente seu texto nesta sessão. Campos consultados também foram comparados com o [código oficial AdsInsights](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ads-insights.js). O fluxo real precisa ser homologado com o app configurado; nenhum resultado real foi declarado nesta entrega.

## Arquitetura e segurança

`GraphClient → MetaService → MetaRepository/SQLite → snapshot autorizado → componentes`.

- `src/meta/client.ts`: endpoints oficiais fixos, Authorization Bearer, appsecret_proof, timeout, retries limitados em erro transitório, paginação por cursor sem seguir URLs next externas. Erros são classificados sem conservar o texto bruto da Meta.
- `src/meta/security.ts`: configuração validada e vault AES-256-GCM com nonce aleatório e workspace como dado autenticado. Trocar o ciphertext de workspace invalida a decriptação.
- `src/meta/service.ts`: OAuth state aleatório com hash no banco, validade de dez minutos, uso único, cookie HttpOnly/Secure/SameSite=Lax separado e vinculação ao hash da sessão original. Perfil e workspace são revalidados antes de publicar resultados após chamadas assíncronas.
- `src/app/api/meta/oauth`: callback sem scripts externos, sem cache e sem referrer. O código de autorização é transitório, não um token de API. Configure proxies/APM para não registrar querystrings do callback, corpos OAuth ou headers Authorization.
- `src/data/meta-sqlite.ts`: conexões, credenciais criptografadas, contas selecionadas, recursos, revisões de insights, runs e eventos. Toda chave de recurso inclui workspace e conta. Nenhuma credencial é incluída no snapshot retornado ao cliente. SQLite e backups ficam fora de public e do ZIP.
- `src/features/integrations/meta-panel.tsx`: configuração pendente, autorização, seleção, saúde e histórico administrativo.
- `src/features/integrations/meta-data.tsx`: visualização real, datas atuais por fuso da conta, comparação 7/14/30 dias, dados por anúncio/dia e valores ausentes explícitos. Moedas distintas não são somadas.
- `src/attribution`: Tracking Service para UTMs e IDs internos; contratos de eventos de clique, lead, qualificação, call agendada/realizada, no-show, proposta, venda e receita. Inclui idempotência, modelo de atribuição e referência de consentimento. Ainda não coleta eventos nem calcula receita de CRM.
- Criativos preservam IDs de mídia/post e referência de vídeo; CreativeOrigin prepara observação orgânica e proposta de teste pago, sem executar Reels/automação.

## Histórico e sincronização

A primeira versão reconsulta os últimos **60 dias completos**, no fuso da conta: suporta dois períodos de 30 dias. Usa insights no nível anúncio e time_increment=1. Atribuição unificada da conta/conjunto é solicitada; actions e cost_per_action_type são preservados por tipo, sem somá-los como se fossem vendas de negócio.

O snapshot atual tem chave única workspace + conta + anúncio + dia. Reconsultar atualiza essa visão, enquanto revisões históricas permanecem em tabela separada, e dias anteriores à janela não são apagados. Isso acomoda correções retroativas da Meta. Entidades e insights de cada conta só são publicados após todas as consultas obrigatórias daquela conta terminarem. Uma conta com falha preserva sua versão anterior; outras contas podem concluir, com status parcial. Recursos opcionais indisponíveis são registrados separadamente.

Runs registram início, término, duração calculável, quantidade, status e erros sanitizados. O processamento é manual no servidor, com trava por workspace; uma execução interrompida pode ser retomada após a expiração da trava de 15 minutos. Cada cliente limita a janela de chamadas a quatro minutos, até 100 páginas por endpoint e até 20 contas selecionadas. Não existe cron ou fila nesta fase. Jobs futuros devem substituir essa execução limitada por fila persistente, cursor durável e relatórios assíncronos Meta.

## Limitações e comportamento esperado

- O app Meta ainda não está configurado neste computador: não houve OAuth real, importação real ou teste contra credenciais reais. As APIs foram mockadas exclusivamente nos testes automatizados.
- Não existe refresh token OAuth convencional neste fluxo. O servidor troca o código por user token e tenta a troca long-lived. Usa a expiração retornada; validade ausente é rejeitada. Expiração/revogação exige Reconectar. Revisão de acesso a dados pode exigir nova autorização antes dessa data.
- Business, páginas, Instagram e pixels/datasets podem não ser disponibilizados. O app consulta adspixels; não promete listar todos os tipos de datasets, suas fontes ou eventos. Não aumenta permissões automaticamente para contornar a falta de acesso.
- As respostas da API podem omitir alcance, frequência, conversões, mídia ou campos depreciados. Campo indisponível não vira zero. Uma rejeição de campo obrigatório falha a importação daquela conta e fica no histórico; não é silenciosamente substituída por fixture.
- Alcance não é deduplicado entre dias/anúncios. Por isso não somamos alcance nem calculamos frequência agregada com essa soma. Receita, CAC, qualidade dos leads, show rate e ROAS de vendas reais aguardam a fonte de negócio; a Meta isoladamente não os comprova.
- Workspaces nunca autorizados continuam em demonstração, claramente identificada. Depois de uma autorização real, inclusive após desconectar, a aplicação mantém o modo Dados Meta/histórico e não recai silenciosamente em demonstração. Módulos de IA e CRM ficam com estados vazios explicativos nesse modo.
- Desconectar apaga a credencial local e interrompe novas sincronizações. Não revoga globalmente as permissões do app na Meta, pois isso poderia afetar outros workspaces do mesmo usuário. Para revogação completa, use também as configurações de integrações empresariais da Meta.
- Remover uma conta da seleção impede sua exibição e novas sincronizações nesse workspace, preservando o histórico armazenado. Revogação na Meta é percebida na nova consulta, seleção ou sincronização; sem webhook não existe detecção instantânea.
- Contas simuladas da versão 0.3 permanecem arquivadas em suas tabelas, mas não entram em seleção, métricas ou status da integração real. Endpoints antigos de mutação respondem 410 para administradores e continuam bloqueados para gestores.
- Recursos de descoberta sem vínculo a uma conta (Businesses, páginas e Instagram) ficam restritos ao administrador. Gestores recebem somente recursos das contas selecionadas do workspace.
- A autorização atual é por workspace. Não há restrição operacional por gestor individual dentro de uma conta. Não há transferência automática de dados reais entre workspaces.
- SQLite requer disco persistente e uma instância. Para produção com escala, migrar o repositório para PostgreSQL assíncrono, acrescentar jobs, rotinas de retenção/eliminação, auditoria e homologar o app no Meta Developers. Não basta trocar DATABASE_URL.

## Próxima etapa

Configure e homologue a operação Dinamix Elétricos com leitura real, valide atribuição e reconcilie com o Ads Manager. Depois, implemente ingestão de eventos de negócio e jobs resilientes. Qualquer evolução de inteligência deverá considerar Meta Ads + performance criativa + qualidade dos leads + calls + vendas + receita. Automação de campanhas continua fora do escopo.
