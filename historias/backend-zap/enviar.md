# ZAP-enviar enviar

- **ID:** ZAP-enviar  ·  **Área:** ZAP  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

## Objetivo

Drenar a outbox `envios` e entregar cada item à Meta via `ClienteWhats`. Claim `FOR UPDATE SKIP LOCKED`,
retentativa com backoff para falha transitória, falha definitiva marcada com motivo sem PII, respeito à
janela de 24h (texto livre só dentro da janela; fora dela, só template). "Pronto" observável: uma linha
`agendado` vira `enviado` com `wamid`; falha transitória reagenda com backoff; falha permanente vira `falhou`;
dois workers concorrentes nunca enviam o mesmo item duas vezes.

## Dependências

- `ZAP-meta`: único caminho até a Meta; fornece os erros tipados que decidem retentar ou falhar.

## Contratos e tabelas que toca

- **Lê e atualiza `envios`** (outbox genérica). O `whaviso_zap` tem UPDATE **por coluna**: `status`,
  `enviado_em`, `wamid`, `erro`, `proxima_tentativa_em`, `tentativas`, `entrega_status` (SEC-031). Nunca
  escreve `payload`, `destinatario_hash`, `loja_id`.
- **Lê** `numeros_whatsapp` (via `ZAP-meta`) e, para a regra de janela, a marca de última mensagem de entrada
  da conversa (somente leitura).
- Contrato: formato do `payload` de `envios` (kernel F1): tipo (texto, interativo, template, mídia) e
  conteúdo. Este módulo interpreta o contrato, não o define.
- Quem produz envios: `atendente` e `api` (só enfileiram). Este módulo nunca cria linha em `envios`.

## Arquivos (escopo de edição)

- `backend/apps/zap/src/modules/enviar/**`
- `backend/apps/zap/src/scheduler.ts` (registrar o laço de drenagem; base legada existe)
- `backend/apps/zap/test/**` para testes do módulo

## Etapas

- [ ] Query de claim: seleciona `status = 'agendado'` com `agendado_para <= now()` e `proxima_tentativa_em`
      vencida, `FOR UPDATE SKIP LOCKED`, em lote pequeno, e marca `processando` na mesma transação (usa o
      índice parcial `envios_due`)  (commit: `feat(zap): claim da outbox com skip locked`)
- [ ] Recuperação de órfãos: itens `processando` há mais que um limite (worker morreu) voltam a `agendado`
      sem consumir tentativa indevida  (commit: `feat(zap): recuperacao de envios orfaos`)
- [ ] Despachante por tipo de `payload` (texto, interativo, template, mídia) chamando `ClienteWhats`; o lote
      respeita o limite de taxa por número (a Meta limita por `phone_number_id`)  (commit: `feat(zap): despacho por tipo de payload`)
- [ ] Regra da janela de 24h: se o destino está fora da janela e o payload não é template, **não** enviar:
      falha permanente com motivo `fora_da_janela` (a escolha de template é de quem enfileira)  (commit: `feat(zap): guarda da janela de 24h`)
- [ ] Sucesso: gravar `status=enviado`, `enviado_em`, `wamid`; limpar erro  (commit: `feat(zap): marcar envio concluido`)
- [ ] Retentativa: erro `transitorio` reagenda com backoff exponencial com jitter em
      `proxima_tentativa_em`, incrementa `tentativas`, com teto configurável; estourado vira `falhou`  (commit: `feat(zap): retentativa com backoff`)
- [ ] Falha permanente (`permanente`, `credencial_invalida`, `fora_da_janela`): `status=falhou`, `erro` com
      código e descrição curta, **sem telefone, sem corpo da mensagem, sem token**  (commit: `feat(zap): falha definitiva sem PII`)
- [ ] Idempotência de envio: se uma tentativa anterior obteve `wamid` mas a gravação falhou, não reenviar
      (checar `wamid` presente antes de chamar a Meta)  (commit: `feat(zap): evitar envio duplicado`)
- [ ] Laço no scheduler: intervalo configurável, parada limpa no shutdown, sem sobreposição de ticks;
      `LISTEN` opcional em canal de novo envio para latência baixa, com polling como piso  (commit: `feat(zap): laco de drenagem`)
- [ ] Logs estruturados sem PII: contagem por status, latência, tentativas  (commit: `feat(zap): logs de drenagem`)
- [ ] Testes (ver abaixo)  (commit: `test(zap): enviar`)

## Testes e segurança exigidos

- Unidade com `ClienteWhats` falso: sucesso, cada classe de erro, backoff calculado, teto de tentativas.
- Integração em `whaviso_dev`: **dois workers concorrentes** drenando a mesma fila, cada item enviado
  exatamente uma vez; item `processando` órfão é recuperado.
- **SEC-031**: UPDATE em coluna não permitida de `envios` pelo role do zap falha.
- **SEC-024**: `erro` e logs não contêm telefone, corpo nem token.
- **SEC-001/002**: o item sai pelo número (`numero_whatsapp_id`) da própria linha, nunca por outro número
  ou loja.

## Notas e decisões

- Decisão: o zap **não decide conteúdo** (nem escolhe template); só executa o que foi enfileirado. A regra
  "usar template fora da janela" mora em quem produz o envio.
- Decisão: a janela de 24h é checada aqui como **guarda de segurança** (evita erro caro na Meta), mas a
  fonte da regra continua sendo `API-conversas`.
- Decisão: em `credencial_invalida`, pausar novos claims daquele número até a saúde voltar (evita martelar
  a Meta com token morto); os demais números seguem.
