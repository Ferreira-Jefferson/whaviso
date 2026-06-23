# Relatório de validação (caça-gaps): Épico 09 — Painel de controle

> Valida `historias/planos/09-painel.plano.md` contra `historias/09-painel.md` (fonte da verdade) e `_CONTEXTO.md`.
> Estado do código conferido em 2026-06-22 por leitura direta (graphify CLI indisponível): `painel/index.ts`, `avisos/repo.ts|index.ts`, `recebimentos/index.ts`, `contracts/enums.ts`, `frontend .../painel/pages/Painel.tsx`, `.../avisos/pages/ListaAvisos.tsx|DetalheAviso.tsx`, `shared/format/index.ts`. As afirmações de "estado atual" do plano batem com o código.

## 1. Veredito

**Aprovado com ressalvas.** O plano é forte: cobre quase todos os critérios H9.x, separa MVP 🟢 de gated 🟡, acerta o estado do código (verifiquei: `listarAvisos` filtra por `direcao`/`status` e não por `papel`; o enum só tem 6 estados; `ROTULO_ATOR.cobrador='Você'`/`devedor='A pessoa'` é fixo; resumo soma `aguardando_aceite+pendente`; busca é client-side só por `nome_devedor` com `per_page:100`; `desmarcar-recebimento` existe). Mas deixou passar **um critério de aceite inteiro (a janela de 1 minuto da H9.5)** e contém **uma contradição de transição** com a máquina de estados canônica. Resolver os críticos antes de implementar P8.

## 2. Gaps por severidade

### Críticos

- **[H9.5] Janela de 1 minuto ao confirmar pagamento — não coberta.** O critério H9.5 diz literalmente: "Ações que disparam mensagem ao devedor respeitam as regras dos épicos de origem (ex.: a **janela de 1 minuto** ao confirmar pagamento, Épico 8 H8.1)." O plano não menciona isso em lugar nenhum: nem no passo P8 (ações por estado), nem em §3.4, nem em §6 (riscos), nem em §7 (decisões em aberto). Quando o cobrador confirma recebimento pelo painel, a UI precisa refletir essa janela (ex.: affordance de "desfazer" por ~1 min, ou estado de "aguardando envio" antes de a notificação sair). **Correção:** acrescentar ao P8 um item explícito: ao confirmar pagamento via painel, expor o comportamento da janela de 1 min (H8.1) sem o front implementar a regra (a autoridade é a API/zap); listar como ponto de teste e/ou decisão de UX em §7. Hoje o efeito ficaria invisível ao usuário do painel.

- **[H9.5 / máquina de estados] Contradição na transição de "reabrir".** O plano afirma, em §2 (P8), §3.4 e P8/§7, que "reabrir" é `pago→programado`. Mas o CLAUDE.md (transições válidas) e o `_CONTEXTO.md` definem a transição como **`pago→pendente`** (que será renomeado para `programado` só quando a varredura `pendente→programado` ocorrer, cross-épico E6). O endpoint atual é `POST /avisos/:id/desmarcar-recebimento` e leva a `pendente`. Afirmar `pago→programado` como se já existisse é prematuro e arrisca alinhar o E9 a um destino que o E8/máquina de estados ainda não materializou. **Correção:** declarar a transição como `pago→pendente` **hoje**, virando `pago→programado` **apenas** após a varredura cross-épico; não inventar o destino. Confirmar o nome/rota com o plano de E8 (já está em §7 como aberto, mas o corpo do plano afirma o destino errado).

### Médios

- **[H9.7] "Retry"/"falha persistente" depende de semântica do `statusEnvio` que o plano não fixa.** Verifiquei: `statusEnvio` é `['agendado','processando','enviado','falhou','cancelado']` — não há estado "em nova tentativa". O plano (P9) propõe **derivar** "em retry" de `tentativas`/`proxima_tentativa_em`. Isso é razoável, mas o plano não amarra a invariante de E6 que torna a derivação confiável: `falhou` só pode significar **falha persistente (3 retries esgotados)**; um `falhou` transitório entre tentativas faria o painel mentir "não saiu". **Correção:** registrar como dependência dura de E6 H6.8 (contrato: `falhou` = definitivo; "em retry" = `agendado/processando` com `tentativas>0` e `proxima_tentativa_em` futuro) e como ponto de teste em §6.

- **[H9.8] Flag "pode agir" do free não tem contrato definido.** O plano (§3.2/§3.4/P10) diz que o front lê um flag de plano de "billing/perfil" para decidir CTA, com autoridade na API. Mas não define **de onde** vem (campo no `/perfil`? no billing? qual payload?), nem que estado é "free". Sem isso, P10 fica sem contrato implementável e pode levar o front a inferir plano (regra de negócio no cliente, contra H9.8). **Correção:** especificar a fonte do flag (provável: campo do plano/assinatura já exposto pelo billing) ou marcar como decisão em aberto alinhada a E1/E11; o front nunca decide "free" por conta própria.

- **[H9.2] Sinalizações "dado incorreto"/"telefone divergente" são pré-requisito do "precisa de você", mas P3 está condicionado a E5 sem contrato.** O plano corretamente diz que o formato é de E5 (§3.1, §7), mas P3 (opus) entrega o "precisa de você" sem esse contrato, o que torna o passo parcial por construção. **Correção:** marcar explicitamente que P3 entrega **apenas** o agregado de `informado_pago` (como cobrador) + edição a aprovar no MVP, e que dado incorreto/telefone divergente entram **depois** do contrato de E5 — para o passo não ficar bloqueado nem entregar meia funcionalidade silenciosamente.

- **[H9.4] Eventos novos da timeline não estão no enum `tipoEvento` e o plano não enumera quais faltam.** Verifiquei: `tipoEvento` tem `criado, aceite, ja_paguei_devedor, confirmado_cobrador, rejeitado_cobrador, desmarcado_cobrador, optout, cancelado_cobrador, expirado, solicitou_pix, recusado`. **Faltam** os eventos que a H9.4 pede exibir: pausa/reativação, edição/aprovação, reativação/reregistro (`desregistrado→programado`), e o evento de "convite gerado" (H9.4 cita "convite gerado" explicitamente; não há `convite_gerado` no enum). O plano fala genericamente em "adicionar tipos quando os épicos de origem os gravarem", mas não lista o conjunto, o que dificulta validar cobertura. **Correção:** enumerar os tipos de evento esperados pela H9.4 e mapear cada um ao épico que o grava (E2 edição/pausa, E5 convite gerado/recusa/dado incorreto, E7 optout/reregistro, E8 confirmado/rejeitado), para o painel ter rótulo pronto e não exibir evento "cru".

### Baixos

- **[H9.3] Ordenação por data combinada exige índice, mas o plano não garante a coluna nem o índice na faixa certa.** §3.1 sugere índice por `data_combinada` "a avaliar"; P4 assume ordenação default `data_combinada asc`. Confirmar que a migration de índice é append-only e cobre os dois papéis (`(cobrador_id,status,data_combinada)` e `(devedor_profile_id,status,data_combinada)`), senão a ordenação paginada degrada. Baixo porque é otimização, não correção.

- **[H9.1/H9.3] Rótulo de `expirado` e proximidade da data — linguagem.** O plano nota que `expirado='Encerrado sem confirmação'` precisa alinhar; ok. Reforçar que o "destaque de proximidade da data combinada" (H9.3) **não** pode usar "vencimento"/"venceu"/"atrasado" (a própria H9.3 alerta); o plano cita isso em P6 mas convém amarrar ao teste de linguagem de P11.

- **[Formato/§3.6] Teste de linguagem deve cobrir o `ROTULO_ATOR` relativo ao papel.** P7 introduz a função `rotuloAtor(papel, ator)`; o teste de ator em P11 cobre a inversão, mas vale garantir que os novos textos ("A outra pessoa" etc.) também passem pela varredura de termos proibidos/gênero neutro.

## 3. Cobertura dos critérios de aceite

| História | Coberto? | Onde |
|---|---|---|
| H9.1 (por papel; vínculo por telefone; campos do item; linguagem) | Sim | P1, P4, P5 |
| H9.2 (totais a receber/recebido, a pagar/pago; "precisa de você"; backend; sem termo proibido; terminais fora) | Parcial | P2, P3 — "precisa de você" depende de E5 (médio) |
| H9.3 (filtro por estado c/ rótulos; busca nome **ou motivo**; ordenar por data; faixa Sem aviso; histórico) | Sim | P1, P4, P6 |
| H9.4 (linha do tempo; ator relativo; informado×marcado; nada sensível; sem recálculo) | Parcial | P7 — enum de eventos incompleto (médio); "convite gerado" ausente |
| H9.5 (ações por estado/papel; só solicita; **janela 1 min**; ações indisponíveis somem; relê) | **Parcial — falta janela 1 min** | P8 (crítico: janela 1 min ausente; contradição reabrir) |
| H9.6 (recorrentes 🟡) | Sim (gated, não implementar) | P12 |
| H9.7 (status enviado/falha/retry; reflete outbox; nada sensível; falha persistente) | Parcial | P9 — semântica de `falhou` não amarrada (médio) |
| H9.8 (só leitura; free só visualiza; via REST; isolamento; revalida; estados vazios) | Parcial | P10 — contrato do flag de plano indefinido (médio) |

**Critérios sem passo no plano (lista para o objeto):** janela de 1 minuto (H9.5); contrato da fonte do flag de plano free (H9.8); enumeração dos eventos novos incl. "convite gerado" (H9.4); contrato de dado incorreto/telefone divergente do "precisa de você" (H9.2, herdado de E5).

## 4. Testes (pontos críticos)

- **Corrida/fila/coalescing/horário reservado:** o plano acerta ao dizer que **não há ponto de corrida próprio do E9** (o painel não escreve; só relê). Não duplicar testes de E6/E8/E10. **Concordo** — o E9 não tem fila, claim, nem idempotência própria.
- **Cobertos no plano:** isolamento por usuário em todos os endpoints novos; papel × direção no invertido (teste dedicado, §6); totais por estado (constante única); ator relativo ao papel; free barrado pela API; ausência de termo proibido.
- **Faltando como teste dedicado:** (a) confirmação com **janela de 1 min** (H9.5) — adicionar; (b) **falha persistente vs retry transitório** em H9.7 — garantir que "não saiu" só aparece com retries esgotados.

## 5. Coerência cross-épico

- Dependências mapeadas corretamente (E2/E3/E4/E5/E6/E7/E8/E10/E11/E1/E13) e o plano respeita "módulo nunca importa módulo" (painel não importa avisos; integração por endpoint/banco).
- **Uma contradição com a máquina de estados:** "reabrir" como `pago→programado` (ver crítico acima); a transição canônica hoje é `pago→pendente`. Demais estados-alvo são tratados como dependência (correto: o painel rotula/consome, não cria).
- O plano não importa E10 nem fala com o zap (correto): o painel só lê `envios`/`eventos_aviso` via API.

## 6. Aderência às invariantes (Épico 13)

- **Sem travessão / palavras proibidas:** o plano evita; pede varredura de linguagem (P11). Atenção residual: rótulos legados a corrigir (`expirado`, "No ciclo", "Em revisão") e o destaque de "proximidade da data" sem termo acusatório. O `&middot;` no JSX do Painel é entidade HTML (não é travessão) — ok.
- **Gênero neutro:** o `ROTULO_ATOR` relativo ao papel ("A outra pessoa") deve permanecer neutro; incluir na varredura.
- **Centavos / fuso:** o plano mantém totais em centavos no backend e datas em `to_char(...,'YYYY-MM-DD')` (já no `repo.ts`); ordenação/agrupamento no servidor (não no cliente) — alinhado.
- **Sem DELETE de negócio/auditoria:** o plano só adiciona leitura/índice append-only; nenhum DELETE. Ok.
- **Nunca logar sensível / hash / JWKS / isolamento:** §3.5 cobre (Pix só no detalhe do dono, número de convite só hash, isolamento por `req.userId`, sem stack/SQL no envelope). HMAC do webhook é de E5/E7, fora do E9 (correto não duplicar).

## 7. Modelo recomendado por passo

Sensato. opus nos passos de semântica (P2 agregação, P3 fronteira de pendências, P4 papel≠direção, P7 ator relativo, P8 mapa estado×papel→ações, P11 desenho de casos de isolamento/linguagem); sonnet nos mecânicos (P1 rótulos, P5/P6 UI, P9 derivação de rótulo, P10 gating UI, P12 stub). Sem reparos.
