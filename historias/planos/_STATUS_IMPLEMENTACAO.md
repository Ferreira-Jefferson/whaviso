# Status da implementação dos 13 épicos

> Resultado da fase de implementação (a partir dos planos + validações em `historias/planos/`). Fonte da verdade = `historias/*.md`. Tudo verde no fim: **backend api 142 (+1 todo) · zap 147 · shared 40 = 329 testes** · frontend typecheck/lint/build OK · `validate_migrations.sh whaviso_dev` recria a cadeia 0001..0043 + seed. Nada commitado (projeto não é git).

## Ordem executada (por dependência)

Fundações → fluxo: **E13 → E12 → E11 → E1 → F-STATE (máquina de estados) → E10a (outbox generalizada) → E2 → E3 → E4 → E5 → E6 → E7 → E10b (coalescing/espaçamento) → E8 → E9**. Cada etapa: 1 agente implementou fechando os gaps do relatório; depois lint+typecheck+test (+validate_migrations quando schema) e confronto com os critérios do épico. (E10 foi dividido em **E10a** infra de outbox e **E10b** comportamento crítico; E3 e E6/E10b foram finalizados por agente focado após timeouts de stream.)

## Migrations criadas

`0025` templates sem travessão · `0026` planos balde único (4 planos + free) · `0027` eventos_auth · `0028` máquina de estados (rename pendente→programado + novos estados/eventos + trigger) · `0029` notificações generalizada · `0030` número de convite · `0031` Pix obrigatório+titular/banco · `0032` avisos_edicoes · `0033` plano edicoes_max · `0034` templates de estado ao devedor · `0035` invertido Pix/convite · `0036` agenda (sem_aviso destino) · `0037` convite/aceite WhatsApp · `0038` horário reservado · `0039` ciclo botões/empurrão · `0040` interação devedor · `0041` fila de saída (agendar_para/coalesce/espaçamento) · `0042` confirmação de pagamento · `0043` índices do painel por papel.

## Por épico

- **E1 Conta & Auth** 🟢 — free read-only (guard antes do limite), conta-no-aceite idempotente (helper reusado no zap), OTP cria conta na confirmação, `eventos_auth` append-only (telefone só hash). Decisão: **OTP** (não botão). Gated: entrega real de OTP a +55 (Meta).
- **E2 Criar receber** 🟢 — número de convite 6 díg. (hash, unicidade por telefone_devedor), Pix obrigatório + titular/banco, sub-ciclo de edição (`avisos_edicoes`, limite por plano), pausar/cancelar, notifica devedor via outbox.
- **E3 Pagar invertido** 🟢 — espelho; devedor informa Pix, cobrador confirma/ajusta no aceite; unicidade por telefone_cobrador; notifica o devedor em TODA resposta (incl. aceite); evento `cancelado_criador`.
- **E4 Modo agenda** 🟢 — estado `sem_aviso`, criar≠ativar, free mantém agenda mas não ativa, `pago_manual` com ator correto, ativar resolve telefone/Pix faltante.
- **E5 Convite/aceite** 🟢 — aceite 100% WhatsApp (site `/aceite` removido), validação número+telefone por papel, anti-brute-force 3 tentativas + regeneração/bloqueio/desbloqueio, `recusado` terminal, telefone divergente avisa as 2 pontas.
- **E6 Ciclo lembretes** 🟢 — horário reservado por segundo (08-18h, 10min/devedor, unicidade na lógica não no índice, `_orig` recuperável), retry exatamente 3× 20-60s, catch-up, 3 botões em toda etapa, `informado_pago` para o ciclo (só empurrãozinho D+1), LEFT JOIN corrige o invertido. **Em implementação (rodada recorrência+cadência, 2026-06-25): H6.10 recorrência + cadência configurável** (schema decidido no épico: `aviso_ocorrencias`, `envios.ocorrencia_id`, geração lazy).
- **E7 Interação devedor** 🟢 — 3 botões, `desregistrado` reversível, "só o último aviso age", menu por combinado ativo (silêncio quando nada acionável), entrega da chave em 2 mensagens uma vez por combinado.
- **E8 Confirmação pagamento** 🟢 — `informado_pago→pago/programado`, marcar direto, reabrir reusando `_orig` (colisão aceita), janela 1min via `agendar_para`, botão WhatsApp Confirmar/Ainda-não-recebi para qualquer cobrador, devedor não confirma, reengajamento pós-ciclo (limite 3/combinado, nunca 2/dia). **Em implementação: H8.7 recorrência por ocorrência** (tabela `aviso_ocorrencias`, confirmação por ocorrência, terminal só no fim).
- **E9 Painel** 🟢 — visão por PAPEL (a receber/a pagar), totais no backend, "precisa de você", timeline com ATOR (distingue informado-pelo-devedor × marcado-pelo-cobrador), status de envio (retry × falha persistente), filtros/busca por nome OU motivo, free só visualiza (CTA), janela 1min na UX. **Em implementação: H9.6 recorrência no painel** (progresso k de N + desmembramento por período via `aviso_ocorrencias`).
- **E10 Notificações** 🟢 — outbox generalizada (cobrador com/sem conta + devedor por telefone), dedupe por ocorrência, **espaçamento 10min/destinatário + coalescing conservador auditável** (par opt-out/reativação anula; obsoleto por terminal) nas duas filas, opt-out atraso 1min + 2ª notificação na reativação, limite de plano registra sem enviar. Testes de corrida dedicados.
- **E11 Planos** 🟢 — catálogo 4 planos (Free/Start/Profissional/Plus) em migration, agenda balde único, criar≠ativar, validação no servidor sem corrida (lock por conta), contagem por papel, arquivamento (não DELETE). Gated: **H11.9 billing real/gateway**.
- **E12 Templates** 🟢 — tabela única, render compartilhado preview↔envio (valor ausente unificado), no-template visível ao owner, travessão no CHECK; já estava em grande parte pronto.
- **E13 Linguagem/compliance** 🟢 — `contracts/linguagem.ts` + dicionário front espelhados (proibidas + travessão + alerta de gênero), redaction de log (incl. telefone_cobrador, aninhado), testes de varredura/igualdade/compliance.

## Em implementação 🔨 (rodada recorrência + cadência, decidida 2026-06-25)

- **Recorrência (E6 H6.10 / E8 H8.7 / E9 H9.6) + cadência configurável (E6 H6.10):** UX e schema **decididos nos épicos**. Modelagem: combinado segue uma linha + tabela filha `aviso_ocorrencias`, `envios.ocorrencia_id` (unique parcial), horário reservado compartilhado, geração lazy por ocorrência, terminal só no fim. Migrations 0052 (ocorrências/recorrência) e 0053 (`permite_recorrente=true` em todos os planos). **Billing (decisão 2026-06-25): recorrência é FACILITADOR, não diferencial** — não gated por plano; cada ocorrência reserva **1 vaga de aviso ativo** (custo < preço por construção). **Cadência** segue diferencial pago (Prof/Plus). Schema/contratos/migrations prontos e validados; falta a fiação api + zap + frontend.

## Pendências 🟡 (gated nos próprios épicos, fora do MVP)

- Billing real / gateway de pagamento (E11 H11.9) — stub trial no MVP.
- Entrega de OTP a +55 e convite por template Meta com botões (E1/E5/E12 H12.10): código pronto, transporte é a Meta Cloud API; falta aprovar os templates individualmente na Meta antes do envio real.
- `dado_incorreto`/telefone_divergente no bloco "precisa de você" do painel — depende do convite por template (E5 gated).
- 1 teste `it.todo` (recorrência) marcado no backend.

## Deploy (lembrete)

Runtime DEV aponta para o Supabase **cloud**; as migrations `0025..0043` e o catálogo de planos precisam ir ao cloud via `supabase db push` (o seed não roda lá). `SUPABASE_SERVICE_ROLE_KEY` é necessária em prod para a conta-no-aceite (sem ela, degrada para vínculo só por telefone).
