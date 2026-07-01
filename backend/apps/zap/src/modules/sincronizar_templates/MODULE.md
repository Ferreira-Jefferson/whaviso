# sincronizar_templates

## Propósito
Mantém os templates do whaviso em dia com a Meta Cloud API, substituindo o "aprovar" manual
da era Baileys. Três funções:
- `submeterPendentes(deps)`: claim (`FOR UPDATE SKIP LOCKED`) das versões marcadas `meta_acao='criar'`
  (a api enfileira), cria/edita o template na WABA via Graph e grava `meta_template_id` +
  `status_meta` inicial. EDIT quando já há `meta_template_id` para o nome; CREATE no primeiro.
- `reconciliarTemplates(deps)`: `GET /{waba_id}/message_templates` e reflete o status REAL por
  (nome_meta, idioma); rede de segurança p/ webhook perdido. Só atualiza quem a lista CONTÉM
  (não rebaixa por ausência: a lista pode vir paginada/parcial; rebaixar em massa seria destrutivo).
- `processarStatusTemplate(deps, evento)`: aplica o webhook `message_template_status_update`
  (tempo real), ligado em `server.ts` via `whats.onTemplateStatus`.

## Entry points
- `index.ts` → `submeterPendentes(deps)` e `reconciliarTemplates(deps)`: chamados pelo loop em `src/scheduler.ts`
- `index.ts` → `processarStatusTemplate(deps, evento)`: ligado ao `onTemplateStatus` em `src/server.ts`

## Especialistas consumidos
- `@whaviso/shared/db`, `@whaviso/shared/logger`
- `shared/whats` (EventoTemplateStatus; ErroEnvio)
- `shared/meta_client/graph` (criar/editar/listar template), `shared/meta_client/template_payload`
  (montarDefTemplate), `shared/meta_client/inbound` (traduzirStatusTemplateMeta), `shared/meta_client` (OpcoesMeta)

## Tabelas
- escreve em: templates (status_meta, meta_template_id, meta_submetido_em, meta_motivo, meta_acao)
- lê de: templates (claim por meta_acao)

## Regras-chave
- `api` e `zap` integram só pelo banco: a api seta `meta_acao='criar'`, o zap drena e zera.
- Erro permanente da Graph (formato/categoria recusados) → `status_meta='rejeitado'` + `meta_motivo`;
  transitório (rede/5xx) → recoloca `meta_acao='criar'` para o próximo tick.
- AUTHENTICATION (OTP `whaviso_otp`) tem formato fixo e é registrado à parte; o create genérico
  monta o corpo de auth defensivamente, mas o fluxo do painel trata só UTILITY/MARKETING editáveis.
- Reconcile só atualiza o que a lista da Meta contém (match por nome+idioma); nunca rebaixa por ausência.
- Credenciais `META_*` só no zap; nunca logar token.
