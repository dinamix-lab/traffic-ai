# Laboratório de Reels — 0.6

O laboratório organiza o fluxo semiautomático de conteúdo orgânico até uma **intenção de teste pago aprovada**. Nenhuma campanha é criada na Meta nesta versão.

## Fluxo e estados

`published → organic_observation → organic_evaluated → test_proposed → test_approved → paid_test_pending`

- published: conteúdo cadastrado localmente; não significa que o Traffic AI publicou o Reel.
- organic_observation: aguarda janela e volume suficientes. A janela inicial é 48 horas, configurável; insuficiência prolonga a observação.
- organic_evaluated: Organic Score calculado com histórico suficiente do próprio perfil.
- test_proposed: uma ou duas propostas locais, com evidência, orçamento e tracking.
- test_approved: aprovação humana registrada na timeline.
- paid_test_pending: ponto de parada obrigatório desta implementação. A timeline registra aprovação e pendência separadamente.

Modelo futuro: paid_testing → scale_candidate / maintain_candidate / pause_candidate → completed. Todas essas transições pagas são explicitamente bloqueadas agora, mesmo por chamada direta de serviço. Não há endpoint para fingir início, gasto, resultado ou conclusão.

Rejeição de todas as propostas ainda não aprovadas devolve o Reel a organic_evaluated. Rejeitar uma proposta não cancela nem altera outra já aprovada. Estados não podem pular a avaliação/aprovação. Cadastros com proposta ativa não podem ser editados silenciosamente.

## Configurações administrativas

Por workspace, em Config. de Inteligência:

| Campo | Default |
| --- | --- |
| organicObservationHours | 48 horas |
| paidTestDays | 7 dias |
| organicScoreThreshold | 70 |
| businessScoreThreshold | 70, preparado para classificação paga futura |
| testBudgetGrowth | 50 na moeda comercial, total do teste |
| testBudgetConversion | 50 na moeda comercial, total do teste |
| maxTestBudgetPerReel | 100, soma de propostas/testes não rejeitados |
| landingPage | vazio; destino HTTPS deve ser configurado antes de propor |

Os valores são editáveis, não regras permanentes espalhadas pelo código. O teto é revalidado na criação e na aprovação. Alterar o teto para baixo pode exigir rejeição/revisão das propostas antes de aprovar. Orçamento zero não permite propor teste.

## Propostas GROWTH e CONVERSION

GROWTH representa intenção de crescimento/visita ao perfil. CONVERSION representa intenção de conversão na landing page. São enums internos: não presumem nomes/IDs de objetivos publicitários disponíveis na Meta. Nesta etapa, a URL de tracking planejada usa o destino HTTPS configurado para a integração futura. O destino efetivo do teste GROWTH e o objetivo Meta serão validados na implementação executora futura.

Um Reel elegível pode gerar uma proposta de cada tipo; duplicatas ativas são rejeitadas. Precisa de Organic Score acima do limiar, janela/amostra atuais válidas e destino configurado. A proposta preserva orçamento, dias, instante, decisão, usuário, razão, métricas anteriores e tracking. Resultado inicial é inconclusive; during/after permanecem nulos.

## Tracking obrigatório

O serviço existente UrlTrackingService gera o link planejado com:

- utm_source=meta; utm_medium=paid_social;
- utm_campaign identifica Reel/tipo/proposta; utm_content identifica o criativo; utm_term identifica a intenção;
- traffic_workspace_id, traffic_campaign_id, traffic_adset_id, traffic_ad_id e traffic_creative_id.

IDs planned-* são identidades reservadas locais, **não IDs de campanhas Meta já criadas**. Uma implementação futura deve persistir a correspondência entre esses IDs e os IDs externos efetivos. Sem tracking/destino válido, a proposta é bloqueada. Atribuição comercial existente nunca é alterada para forçar uma correspondência.

## Experiência e teste manual

1. Como administrador, configure landing page HTTPS e confira janela, amostra, limiar e teto.
2. No Laboratório de Reels, selecione **Demonstração isolada** e **Carregar exemplos isolados de Reels**. Os exemplos não contêm CRM real.
3. Clique **Avaliar** no Reel demonstrativo 1. O histórico dos outros exemplos permite comparar suas métricas; Organic Score aparece e Business Score pode continuar desconhecido.
4. Abra Scores, evidências e timeline para conferir mediana, pesos, horários e justificativa. Exemplos sem amostra devem continuar em observação.
5. Clique **Propor crescimento** ou **Propor conversão**. A proposta aparece com orçamento total, duração e tracking planejado.
6. Clique **Aprovar teste**. Confirme **APROVADO — execução Meta pendente**. Não existe campanha ativa, gasto ou resultado pago fictício.
7. Teste também rejeição com motivo e limite de orçamento. Duas propostas cuja soma ultrapassa o teto são bloqueadas. Isso está coberto pela suíte automatizada.
8. Volte ao modo real: exemplos demo somem. Um Reel real sem métricas suficientes mantém scores nulos/observação.

A validação visual desta entrega realizou avaliação, proposta e aprovação em banco de teste separado, confirmando o estado paid_test_pending. Nenhum Reel demo foi cadastrado no workspace real para essa validação.

## Monitoramento e resultado futuros

O modelo ReelTest guarda before/during/after e classifica winner, promising, neutral, loser ou inconclusive. Apenas inconclusive é usado nesta etapa, pois não existe execução paga. Não classificamos winner/loser com dados inventados.

A futura conexão Meta deverá permitir iniciar/monitorar os testes aprovados, validar objetivos e permissões, registrar gasto real, incorporar aprendizado/cooldown e atribuir leads/calls/vendas do CRM. Só então haverá evidência para candidatos de escala/manutenção/pausa. Mesmo nessa evolução, decisões dependerão dos guardrails e de autorização humana explícita; não há autonomia total implícita.

## Persistência, segurança e limites

intelligence_creatives preserva cadastro, métricas, scores, estado e timeline. intelligence_reel_tests preserva propostas e decisões; intelligence_audit registra avaliação, proposta/aprovação/rejeição. Chaves compostas por workspace impedem cruzamento. Sessão e vínculo são verificados em cada operação; parâmetros do laboratório são exclusivos de administrador.

Não existem envio externo de notificações, OpenAI real, criação/publicação de Reels, upload/processamento de vídeo, escrita no CRM ou automação de orçamento. O banco local mantém uma medição orgânica corrente por criativo; séries orgânicas detalhadas e testes pagos completos são extensões futuras. Fechar o processo interrompe o worker; a persistência conserva o estado para retomada.
