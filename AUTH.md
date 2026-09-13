> Atualização 0.4: a integração Meta simulada foi substituída por OAuth e leitura real. Consulte [META.md](META.md); as notas de simulação abaixo descrevem a versão anterior. Login e permissões de workspace permanecem válidos.

# Autenticação e usuários

## Preparar o primeiro administrador

Use Node.js 24 LTS (mínimo 22.13) e pnpm 11. Execute na pasta do projeto:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
```

Se `.env.local` já existir, edite-o sem sobrescrever. Preencha `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. Escolha uma senha exclusiva de 12 a 128 caracteres; não coloque a senha em comandos, histórico do terminal ou commits. Valores com `#` devem estar entre aspas no arquivo de ambiente.

Depois:

```sh
pnpm seed:admin
pnpm dev
```

Abra http://localhost:3000/login. Entre com o e-mail e a senha que você definiu. O seed só cria o primeiro usuário em um banco vazio; repeti-lo não modifica contas nem senhas existentes. Remova `SEED_ADMIN_PASSWORD` de `.env.local` após o seed. A aplicação não precisa dessa variável para autenticar. Nenhum administrador com senha padrão acompanha o projeto.

`APP_ORIGIN` deve corresponder exatamente ao endereço usado no navegador, incluindo a porta. Para localhost, HTTP é permitido inclusive em `pnpm start`; para outros hosts, configure HTTPS. A validação de origem não confia em `X-Forwarded-Host` nem em cabeçalhos de IP fornecidos pelo cliente. Se usar outra porta no desenvolvimento, altere `APP_ORIGIN` e reinicie o processo.

## Testar os perfis

1. Entre com o administrador. A sidebar mostra **Usuários** e o nome real da sessão; todas as áreas continuam disponíveis.
2. Em **Usuários → Novo usuário**, informe nome, e-mail, senha inicial, perfil **Gestor de tráfego** e status **Ativo**.
3. Antes de entrar com o novo gestor, abra **Workspaces → Detalhes → Equipe** e vincule-o ao workspace desejado. Saia pelo botão **Sair** e entre com o gestor (ou use outra sessão de navegador). Confira as oito áreas e os detalhes de campanha. O item Usuários não aparece. Acesso direto a `/usuarios` leva a **Acesso restrito**; as APIs administrativas retornam 403.
4. Como administrador, edite nome/e-mail/perfil, desative/ative e redefina a senha do gestor. Desativação, mudança de e-mail/perfil e redefinição revogam as sessões existentes. Um usuário reativado precisa entrar novamente.
5. Tente a senha antiga após redefinir, uma senha incorreta, um usuário inativo e o retorno a uma rota protegida após sair. Nenhum desses casos concede acesso.

O sistema exige pelo menos um administrador ativo. A redefinição é administrativa nesta fase; a tela de login orienta o usuário a procurar o administrador. Senhas iniciais devem ser compartilhadas por um canal seguro. Não há e-mail de recuperação conectado.

## Persistência e arquitetura

- `src/auth/types.ts`: contratos do usuário público, armazenamento e sessão. O DTO público exclui o hash de senha.
- `src/auth/service.ts`: regras de login, sessão, permissões, administração, revogação, auditoria e seed; independente do Next.js.
- `src/auth/password.ts`: scrypt da biblioteca criptográfica do Node, com salt aleatório de 128 bits, N=32768, r=8, p=3, chave de 64 bytes e comparação em tempo constante. Parâmetros correspondem a uma configuração recomendada pela [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- `src/data/auth-sqlite.ts`: adaptador SQLite com consultas parametrizadas, WAL, chaves estrangeiras, e-mail único e transações para alterações críticas. Schema v1 registrado em `schema_migrations`.
- `src/auth/server.ts`: composição exclusiva de servidor e guardas de páginas. Cada página protegida e cada endpoint administrativo faz sua própria verificação; o layout não é a única barreira.
- `src/app/api`: endpoints REST com verificação de origem para escritas, limite de 8 KiB por JSON, erros controlados e `Cache-Control: no-store`.
- `src/features/auth` e `src/features/users`: login, logout e gestão visual. Campos de senha permanecem apenas no formulário durante a operação. Mudanças de sessão fazem uma navegação completa para descartar páginas prefetched do usuário anterior.

O banco fica em `data/traffic-ai.sqlite` por padrão, fora de `public/`, ignorado no Git e no ZIP de entrega. O caminho pode ser alterado em `SQLITE_PATH`. Nenhuma senha em texto puro ou token de sessão em texto puro é salvo no banco. A pasta e o volume que contêm o SQLite devem ter permissões restritas ao processo da aplicação; não disponibilize backups pela web.

Para PostgreSQL, implementar o contrato do armazenamento e substituir a composição em `server.ts`. O adaptador atual é síncrono porque usa `node:sqlite`; a migração para um driver PostgreSQL assíncrono exige converter os métodos e callbacks transacionais para promises, preservando os mesmos testes e regras. Não é uma troca de URL. Migrar schema/dados e converter inteiros de timestamps/booleanos para os tipos adequados. Preservar unicidade de e-mail e transações serializadas para a regra de último administrador. O isolamento multiempresa foi implementado na versão 0.3; consulte WORKSPACES.md.

As campanhas continuam simuladas por workspace. Metas ficam no SQLite por workspace e decisões no navegador por usuário e workspace. Os valores anônimos da V1 não são atribuídos automaticamente a uma nova conta.

## Sessões e controles

- Token opaco aleatório de 256 bits; somente SHA-256 do token é armazenado em `sessions`.
- Expiração absoluta em oito horas, sem renovação automática. O usuário deve entrar novamente ao expirar.
- Cookie HttpOnly, SameSite=Strict, Path=/; Secure para HTTPS. Única exceção: HTTP local em loopback para desenvolvimento.
- Login valida status e hash novamente dentro da transação antes de criar a sessão, evitando corrida com redefinição/desativação.
- E-mail/perfil/status são consultados no banco a cada requisição autenticada. Desativar ou redefinir não depende de esperar o cookie vencer.
- Cinco tentativas por e-mail em 15 minutos, com chave hash e persistência SQLite. Limite global de 100 tentativas por 15 minutos para esta instância local. Erro de login genérico para não enumerar contas; senha incorreta e conta inativa não revelam existência do e-mail.
- Eventos de login, logout, criação, edição e redefinição em `audit_events`, sem senhas ou tokens.
- Tabela `password_reset_tokens` preparada para hashes de tokens com expiração e consumo único. Em uma fase futura, implementar emissão/consumo atômico, resposta não enumerável e entrega por canal validado; nenhuma rota pública de recuperação foi exposta agora.

Para hospedagem, SQLite requer volume persistente e uma única instância. Antes de escalar, migrar banco e limitador para infraestrutura compartilhada, adotar proteção de tráfego na borda e definir backup/restore. Este código não inclui MFA, verificação de e-mail, convite por e-mail ou recuperação pública.

Referência das guardas e cookies: [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication).

## Verificações reproduzíveis

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:http
```

`pnpm test` executa os testes de domínio e autenticação. `pnpm test:http` exige um build atual e sobe um servidor em porta temporária com banco isolado. Cria senhas aleatórias, executa o seed real duas vezes, testa os endpoints e remove o banco de teste; não usa nem modifica os usuários locais. Não registra as credenciais.
