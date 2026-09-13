# Creative Intelligence — 0.6

Creative Intelligence organiza conteúdo e relaciona suas características ao funil comercial disponível no workspace. O cadastro é manual nesta etapa. Nenhuma mídia, publicação, métrica orgânica ou dado Meta é inventado no modo real.

> Um criativo com CPL maior pode ser superior se gerar mais calls, vendas ou receita.

## Cadastro e origem

Acesse Creative Intelligence ou Laboratório de Reels → Adicionar conteúdo publicado. Informe identificação e identificador do perfil; campos opcionais permanecem nulos/em branco. É possível guardar plataforma, tipo de mídia, ID/data de publicação, legenda, duração, thumbnail HTTPS, perfil, tags, hook, angle, tema, formato, apresentador, CTA, IDs Traffic/Meta conhecidos e métricas orgânicas com data da medição.

Campos de métricas: visualizações, alcance, plays, watch time, average watch time, retenção, likes, comentários, compartilhamentos, salvamentos, visitas ao perfil e seguidores. Tempo em segundos, retenção em percentual 0–100. Zero deve ser informado apenas se observado. Em branco significa desconhecido. Não há consulta a endpoints adicionais para completar dados ausentes.

A thumbnail opcional é carregada diretamente pelo navegador, com referrer-policy sem referência; não há proxy de download server-side. Use somente uma URL pública autorizada. Cadastros recebem source=manual, separados dos exemplos source=demo.

Taxonomia:

- Hook: curiosidade, dinheiro, oportunidade, problema, erro, comparação, bastidores, provocação, prova, pergunta, outro.
- Angle: oportunidade de negócio, renda, economia, inovação, empreendedorismo, produto, prova social, bastidores, educação, outro.
- Format: talking head, POV, demonstração, entrevista, storytelling, lista, reação, bastidores, outro.
- CTA: seguir, comentar, compartilhar, visitar perfil, acessar landing page, falar no WhatsApp, outro.
- Tags são livres; tema e apresentador permitem texto informado pelo gestor.

Ao editar uma medição, scores são invalidados para nova avaliação. Propostas ativas bloqueiam edição para preservar a evidência da decisão.

## Organic Score

Fórmula versionada organic-1.0, com pesos e suficiência configuráveis pelo administrador:

1. Exigir data de publicação e de medição válidas, pelo menos 48 horas efetivamente observadas e 300 visualizações (defaults editáveis).
2. Selecionar histórico anterior do **mesmo perfil, workspace e fonte**, com volume mínimo e idade de observação próxima da medição atual. A tolerância de idade usa a janela de observação configurada.
3. Exigir cinco criativos históricos comparáveis por componente.
4. Retenção usa percentual; compartilhamentos, salvamentos, visitas e seguidores são normalizados por visualização.
5. Componente = min(100, 50 × valor atual / mediana histórica). Mediana zero/ausente é excluída, sem infinito ou bônus fictício.
6. Exigir pelo menos dois componentes; calcular média ponderada. Pesos iniciais: retenção 2, compartilhamentos 2, salvamentos 1, visitas 1, seguidores 2.

Mediana equivale a 50 e o dobro equivale a 100. O score é relativo, não benchmark universal nem probabilidade de viralização. Sem amostra suficiente, o valor permanece nulo e o Reel fica em observação. Watch time, likes, comentários, alcance e plays são armazenados para evolução, sem fingir que todos entram na fórmula atual. Velocidade inicial por múltiplos snapshots é uma extensão futura; hoje há uma medição orgânica corrente por criativo e histórico de ações/scoring.

## Business Score

Fórmula business-1.0, independente do Organic Score:

- Exige ao menos 20 leads e cinco outros criativos comerciais comparáveis do próprio workspace/fonte.
- Compara qualificação, calls realizadas por lead, propostas por lead, vendas por lead, receita por lead, ROAS e CAC inverso quando disponíveis.
- Cada componente usa mediana dos criativos comparáveis; mediana=50, desempenho duas vezes melhor=100. Para CAC, menor é melhor: mediana/atual. Baselines monetários e receita por lead usam divisão decimal; somente a razão sem unidade entra no score numérico.
- Pesos iniciais: qualidade 1, calls 2, propostas 2, vendas/receita 3, eficiência/ROAS/CAC 3. Pesos vêm da configuração administrativa.
- Componentes ausentes não viram zero. Pelo menos dois componentes válidos são necessários; sem isso, o score é nulo.

O Business Score utiliza a janela de 30 dias completos até ontem na avaliação do criativo. A mediana deve ser interpretada como comparação operacional, não lucro absoluto. Cadastro manual de um vídeo não comprova resultados comerciais. A vinculação exige traffic_creative_id ou meta_creative_id encontrado na atribuição disponível; dinheiro/eficiência ainda exige a validação de mídia correspondente.

É perfeitamente possível ter Organic Score alto e Business Score baixo, ou o inverso. A interface mostra ambos lado a lado e explica os componentes e baselines. O limiar business_score_threshold está preparado na configuração para a classificação futura de testes pagos; nesta fase não liga sozinho um estado de winner ou escala.

## Relação com mídia e CRM

Reel → ID criativo conhecido → atribuição original do lead → calls/propostas/vendas → receita. Se o ID não é conhecido, os campos comerciais ficam indisponíveis, não são associados por nome da legenda. Mantém-se a prioridade Traffic IDs, Meta IDs, UTM parcial e origem. ROAS/CAC exigem mídia importada e conversões confirmadas, na mesma moeda/fuso. Não há ROAS real com gasto demo.

A tabela permite ordenar Organic Score, Business Score, vendas, receita, calls e eficiência/ROAS. Mostra investimento, leads, qualificados, calls, propostas, vendas, receita, status e recomendação. A taxonomia pode ser editada e os dados reavaliados sem misturar empresas.

## Padrões criativos

O serviço determinístico agrupa hook, angle, format e CTA. Compara a taxa de qualificação do grupo à dos demais criativos comerciais do mesmo workspace, indicando quantidade de criativos e leads. Sem grupo comparador, não há conclusão.

Estados operacionais:

- hypothesis: falta amostra mínima; confiança heurística 25.
- emerging: ambos os grupos têm ao menos cinco criativos e 100 leads (configurável); confiança 60.
- validated: ambos atingem pelo menos o dobro desses limites; confiança 80.

**validated significa suficiência operacional nesta versão, não significância estatística nem comprovação causal.** Segmentação, orçamento, sazonalidade e oferta podem explicar associações. Não há geração automática de conteúdo baseada em um padrão fraco. O modelo prepara recomendações futuras como “produzir mais conteúdos com característica X”, sem inventar essa conclusão hoje.

## Teste manual

No modo Demonstração isolada, carregue exemplos de Reels. Avalie Reel demonstrativo 1: ele possui histórico do próprio perfil e pode ter Organic Score calculado, enquanto Business Score permanece indisponível. Os exemplos mais antigos podem continuar sem histórico suficiente. No modo real, cadastre um Reel com pouco volume: ao avaliar, deve continuar em observação com a mensagem AGUARDAR MAIS DADOS.

Valide também que trocar o workspace não mostra os mesmos cadastros, scores, padrões ou histórico. Gestor pode cadastrar/avaliar; configurações permanecem administrativas. Veja os testes automatizados e a validação HTTP em VALIDATION.md.

Limites: importação orgânica automática, séries completas de retenção/velocidade, comparação estatística controlada, recomendações de produção e aprendizado causal são evoluções futuras. O narrador é local e não usa LLM real.
