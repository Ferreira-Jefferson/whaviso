# Plano mestre: disparo dos agentes de implementação

> Consolida os 13 planos + 13 relatórios de gaps e define a ORDEM de implementação, as DECISÕES do orquestrador que destravam a sequência, os GAPS a fechar por épico, e o PROTOCOLO de testes/confronto com os épicos após cada etapa.
> Fonte da verdade: `historias/*.md`. Todos os 13 planos foram validados: veredito unânime **aprovado com ressalvas** (estrutura sólida, gaps de detalhe). Doc interno (regras de linguagem do E13 não se aplicam aqui).

## Decisões do orquestrador (destravam a sequência; agentes não devem reabrir sem dado novo)

- **D-AUTH (E1):** login WhatsApp por **OTP de 6 dígitos** (Supabase Auth + Send SMS Hook → zap), NÃO por botão. Motivo: o Supabase emite o JWT do OTP; o fluxo por botão exigiria a gente emitir/gerenciar JWT, contrariando a invariante "JWT continua do Supabase". Ajuste obrigatório: a conta nasce **na confirmação do código** (semântica de `shouldCreateUser`), não no envio, para honrar H1.3. Copy varia login vs cadastro pelo status do telefone.
- **D-STATE:** uma etapa de fundação **F-STATE** (logo após E11, antes do E2) faz a máquina de estados inteira numa migration coordenada: renomeia `pendente→programado` no enum `status_aviso`; adiciona `sem_aviso`, `pausado`, `aguardando_aprovacao_aviso_editado`, `recusado`, `desregistrado`; adiciona em `tipo_evento` os valores `ativado`, `editado`, `pago_manual`, `convite_gerado`, `pausado`, `reativado`, `desregistrado`, `reregistrado`, `editado_aprovado`, `editado_recusado`; reescreve `validar_transicao_aviso` com TODAS as transições-alvo do `_CONTEXTO.md`; reescreve `encerrar_envios_do_aviso` para também liberar `horario_reservado_seg` nas portas de saída. **Cuidados:** `ALTER TYPE ADD VALUE` não pode ser usado na mesma transação que o consome (separar em migrations/statements); **NÃO** renomear o `'pendente'` de **billing** (`0019`, enum/contexto diferente); varrer literais `'pendente'` no app de negócio (`recebimentos`, `enviar_lembretes` guard, `aceite`, testes) e trocar por `'programado'`, sem tocar billing.
- **D-NOTIF:** o canal de notificações é **generalizado** no E10. `notificacoes_cobrador.cobrador_id` vira nullable + coluna de **telefone-alvo** (rota para cobrador sem conta e para notificar o **devedor/criador** no invertido). A `mensagens_avulsas` que o E8 propôs (encerramento/status-alterado/rejeição/reengajamento ao devedor) **passa pela mesma disciplina** de espaçamento 10min/destinatário + coalescing do E10 (não cria fila concorrente sem espaçamento). `dedupe_key` inclui contador de ocorrência (toque duplo = 1; pagou→rejeitou→pagou = 2). Auditoria de cada cancelamento é **obrigatória** (append-only em `eventos_aviso`), só o formato fica aberto.
- **D-HORARIO (E6):** a unicidade global de segundo do horário reservado é garantida na **lógica de alocação**, NÃO por índice único no banco (um índice único quebraria o reuso exigido na reabertura `pago→programado`, que aceita colisão). Registrar (evento/flag não-sensível) quando o espaçamento de 10min/devedor não couber.
- **D-MIGNUM:** numeração de migrations é atribuída **sequencialmente no momento de cada etapa** (próximo livre começa em 0025). Cada etapa confere a última migration antes de criar a sua, para não colidir entre épicos.
- **D-RECUSADO:** o estado `recusado` é introduzido em **F-STATE**; o **E5** troca a recusa do webhook de `cancelado→recusado`. E6/E7 apenas consomem.
- **D-BAILEYS:** botões interativos via Baileys podem falhar; cada épico que depende de botão (E5/E7/E8/E10) prevê **fallback por resposta numerada**. Implementar o fallback de forma compartilhada (uma vez, no transporte) e reusar.

## Gaps cross-épico recorrentes (fechar onde indicado)

1. **Plano `free` inexistente** (default cai em `pessoal`/10 avisos): E11 cria o `free` em migration e a semântica "cria agenda mas não ativa"; E1 usa flag `somente_leitura`/guard antes do limite numérico (nunca cair em `limite_plano_atingido`). [E1-C1/C2, E4-GC2, E11-M6]
2. **Enums de estado/evento incompletos:** F-STATE. [E2, E3-C2, E4-GC1, E7-GC2, E8-M5, E9]
3. **Ciclo quebra no invertido** (`enviar_lembretes/repo.ts` INNER JOIN em `cobrador_id`): trocar por LEFT JOIN + `coalesce(nome_cobrador, p.nome)`. [E6-G1]
4. **Notificar o devedor/criador** (não só cobrador) em recusa/dado-incorreto/rejeição/aceite: D-NOTIF. [E3-M3, E8-C2/C3, E5-G]
5. **Contagem por papel no invertido** (não existe coluna `criador_id`): usar a dupla condição `(criador_papel='cobrador' and cobrador_id) or (criador_papel='devedor' and devedor_profile_id)`. [E11-C1]
6. **Constraint `assinaturas_quantidade_minima (>=16)` bloqueia o Plus (mínimo de unidades baixo):** dropar e recriar `unidades>=1`. [E11-C2] (feito na 0026; o Plus hoje é por volume de envios 26-200, ver épico 11.)
7. **Validação de linguagem ao salvar template** estende travessão (só em-dash/en-dash, nunca hífen ASCII); sincronizar os 3 padrões (CHECK banco + shared + front). [E12-B1/B2, E13]
8. **`horario_reservado_seg` liberar em toda porta de saída** (terminal via api, opt-out, expiração) e tratar `desregistrado`/`pausado` como **suspensão** (mantém `_orig`), não liberação definitiva. [E6-G3/G4, E10-C1]

## Sequência de implementação (sequencial, não paralela)

> Fundações primeiro (destravam o resto), depois o fluxo de negócio na ordem natural. Modelo predominante por etapa entre parênteses.

| # | Etapa | Modelo | Fecha gaps |
|---|---|---|---|
| 1 | **E13 Linguagem/compliance** (contracts/linguagem.ts + dict front + travessão no lint/CHECK + redaction `telefone_cobrador` + teste de espelhamento) | misto (opus contrato, sonnet limpeza) | E13 C1/C2/M1-M5/B4 |
| 2 | **E12 Templates** (paridade preview↔envio p/ valor ausente, no-template visível ao owner, travessão no CHECK) | opus (render) + sonnet | E12 M1/M2/M3/B1/B2 |
| 3 | **E11 Planos** (catálogo 4 planos c/ `free` em migration, balde único, criar≠ativar, validação no servidor sem corrida, contagem por papel, drop constraint Plus) | opus | E11 C1/C2/C3/M1-M6 |
| 4 | **E1 Auth** (free guard antes do limite, conta-no-aceite idempotente, OTP cria conta na confirmação, eventos_auth append-only/hash) | opus + sonnet | E1 C1/C2/M1-M5 |
| 5 | **F-STATE máquina de estados** (rename + novos estados/eventos + trigger + liberação horário; excluir billing `pendente`) | opus | gap 2, D-STATE |
| 6 | **E2 Criar receber** (número convite 6 díg. hash + unicidade por telefone, Pix obrigatório+titular/banco, sub-ciclo de edição, pausar/cancelar, contador tentativas nasce aqui) | opus | E2 GC1/GC2/GC3 |
| 7 | **E3 Criar pagar invertido** (espelho; devedor informa Pix, cobrador confirma; notificar devedor em TODA resposta incl. aceite; `cancelado_criador`; unicidade por telefone_cobrador) | opus | E3 C1/C2/M1-M5 |
| 8 | **E4 Modo agenda** (`sem_aviso`, separar criar de gerar convite, free mantém agenda, `pago_manual`+ator, telefone_devedor ao ativar invertido) | misto | E4 GC1/GC2/GM1-GM5 |
| 9 | **E5 Convite/aceite** (100% WhatsApp, remover site, validação número+telefone por papel, anti-brute-force, `cancelado→recusado`, telefone divergente, conta-no-aceite idempotente, reinício de 7d no reenvio) | opus | E5 G1-G11 |
| 10 | **E6 Ciclo lembretes** (LEFT JOIN cobrador, horário reservado por segundo + 10min/devedor, retry 20-60s exatamente 3, catch-up, `informado_pago` para o ciclo, liberação em toda saída) | opus | E6 G1-G12 |
| 11 | **E10 Notificações (infra outbox)** (generalizar canal: nullable+telefone-alvo, dedupe_key c/ ocorrência, espaçamento 10min + coalescing conservador auditável, retry 20-60s, limite de plano registra sem enviar) | opus | E10 C1/C2/M1-M5 |
| 12 | **E7 Interação devedor** (3 botões, `desregistrado` reversível, só último aviso age, menu por combinado ativo, entrega Pix 2 msgs uma vez, enfileira opt-out 1min no E10) | opus | E7 GC1/GC2/GC3/GM1-GM5 |
| 13 | **E8 Confirmação pagamento** (informado_pago→pago/programado, marcar direto, reabrir+reuso horário, janela 1min via E10, botão WhatsApp qualquer cobrador, devedor não confirma) | opus | E8 C1-C5/M1-M6 |
| 14 | **E9 Painel** (visão por papel, totais no backend, "precisa de você", timeline c/ eventos novos+ator, status envio enviado/falha/retry, janela 1min na UX, reabrir=`pago→programado` pós-rename) | misto | E9 críticos/médios |

> Recorrência (E6 H6.10 / E8 H8.7 / E9 H9.6) e billing real (E11 H11.9) são **🟡 gated**: ficam fora do MVP, criados inativos/documentados, não implementados agora.

## Protocolo por etapa (o orquestrador executa entre as etapas)

1. Disparar **1 agente** com: o épico, o plano, o relatório de gaps, este plano mestre, e a instrução de **fechar os gaps listados** e respeitar as decisões do orquestrador. Modelo conforme a tabela.
2. Ao retornar, o orquestrador roda em `backend/`: `npm run lint` + `npm run typecheck` + `npm test`; se a etapa mexeu no schema, `bash scripts/validate_migrations.sh whaviso_dev`. Em `frontend/` quando tocar UI: `npm run lint` + `npm run typecheck` + `npm run build`.
3. **Confrontar com o épico:** conferir que cada critério de aceite tocado pela etapa tem teste verde e bate com a história. Se algo divergir do épico, corrigir (a história ganha), disparando agente se necessário.
4. Atualizar o grafo: `graphify update .` (ou `/graphify . --update`).
5. Só então seguir para a próxima etapa. Sem paralelismo entre etapas (compartilham migrations/trigger/enums).
6. Dúvida que trave: disparar agente focado, avaliar a resposta, decidir, seguir (mandato de autonomia).

## Riscos operacionais a vigiar

- `ALTER TYPE ... ADD VALUE`/`RENAME VALUE` e transação (F-STATE) no `validate_migrations.sh` local e no `db push` cloud.
- Runtime DEV aponta para o Supabase **cloud**; mudança de schema/catálogo só aparece após `supabase db push` (catálogo de planos vai em migration upsert, não no seed).
- Ponto crítico E10 H10.9 (coalescing + espaçamento) exige testes de corrida fortes; não cancelar o que não devia.
- Não logar telefone/Pix/titular/banco/token em nenhuma etapa.
