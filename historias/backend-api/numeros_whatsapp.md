# API-numeros numeros_whatsapp

- **ID:** API-numeros  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Cadastro do número WhatsApp da loja via Embedded Signup da Meta, com o token cifrado em repouso e o
número de telefone só como hash. "Pronto" observável: o dono conclui o Embedded Signup no front, a api
troca o código por token, persiste `phone_number_id`/`waba_id`, `numero_hash` e `token_cifrado`, e o
número aparece na loja como `conectado`; nenhuma resposta, log ou dump contém o token nem o número em
claro; o `zap` (role `whaviso_zap`) consegue ler o token para enviar e só escreve `status`/`verificado`.

## Dependências

- `F4` api-core: server, erros, config, logger com redaction, `shared/db`. Transitivas: `F0` (tabela
  e grants por coluna), `F1` (contratos), `F3` (escopo de loja).
- Pré-requisito de kernel: helper de **cifra da aplicação** (AES-256-GCM, chave mestra fora do banco) e
  de **hash sha256** de telefone. Se não existir em `packages/shared` quando a etapa 2 começar, criar
  `packages/shared/src/cifra/**` com testes em commit próprio e registrar em Notas (é o mesmo helper que
  `API-clientes` usa para `telefone_cifrado`: reusar, não duplicar).
- Interface do provedor Meta: o `ClienteWhats` de `F2` vive no `zap`. A api **não importa o zap**; usa uma
  porta própria e mínima de onboarding (ver Notas).

## Contratos e tabelas que toca

- **Dono de escrita:** `numeros_whatsapp` (`whaviso_api`: insert/update completos). `whaviso_zap` só
  escreve `status` e `verificado`; `whaviso_atendente` só lê colunas não sensíveis (grants da 0003).
- **Lê por read-model:** `lojas` (validar que a loja pertence ao escopo; leitura via `shared/db`).
- **Contratos Zod (F1):** `NumeroConectarEntrada` (`loja_id`, `codigo` do Embedded Signup, `waba_id`,
  `phone_number_id`), `NumeroSaida` (`id`, `loja_id`, `phone_number_id`, `waba_id`,
  `status`, `verificado`, `criado_em`; **sem** token e sem número), `NumeroStatusEntrada` (pausar/reativar).
- Evento de auditoria (sem PII): `numero.conectado`, `numero.pausado`, `numero.reativado`,
  `numero.removido`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/numeros_whatsapp/**`
- `backend/apps/api/src/shared/meta_onboarding/**` (porta + implementação HTTP + stub de teste)
- `backend/apps/api/src/routes.ts` (1 linha, combinado)
- `backend/packages/shared/src/contracts/numeros*.ts`
- `backend/packages/shared/src/cifra/**` (somente se ainda não existir, ver Dependências)

## Etapas

- [ ] 1. Scaffold `numeros_whatsapp` + MODULE.md (dono de `numeros_whatsapp`; segredo: token)
  (commit: `chore(api-numeros): scaffold do modulo numeros_whatsapp`)
- [ ] 2. Garantir o helper `cifra` (AES-256-GCM com nonce aleatório por cifragem, formato versionado
  `v1|nonce|ct|tag` em bytea, master key lida só da config, nunca logada) e `sha256Hex`; se faltar, criar
  no kernel com testes de ida e volta, adulteração (tag inválida falha) e chave errada
  (commit: `feat(shared): cifra AES-GCM e hash sha256 do kernel`)
- [ ] 3. Contratos Zod do módulo + regenerar `_generated`  (commit: `feat(contracts): contratos de numeros whatsapp`)
- [ ] 4. Porta `MetaOnboarding` na api (`trocarCodigo(codigo) -> {token, waba_id, phone_number_id}`,
  `lerTelefone(token, phone_number_id) -> {numero_e164, verificado}`, `assinarWebhook(token, waba_id)`),
  implementação HTTP com host **fixo** `graph.facebook.com`, sem seguir redirect, timeout curto, e stub
  injetável nos testes  (commit: `feat(api-numeros): porta de onboarding Meta com host allowlisted`)
- [ ] 5. Repo SQL parametrizado: inserir, buscar por id/loja, listar, atualizar status/token; nunca
  seleciona `token_cifrado` nas consultas de listagem/detalhe (coluna omitida do SELECT por padrão; um
  método dedicado e interno só para troca de token)  (commit: `feat(api-numeros): repositorio sem exposicao de segredo`)
- [ ] 6. `POST /numeros` (dono e gerente): valida loja no escopo, chama a porta, calcula
  `numero_hash = sha256(E.164)`, cifra o token, grava com `verificado` vindo da Meta, descarta o número
  e o token da memória; conflito em `phone_number_id` unique devolve 409 sem vazar de qual loja é
  (commit: `feat(api-numeros): conectar numero via Embedded Signup`)
- [ ] 7. `GET /numeros` e `GET /numeros/:id` (escopo da loja): só campos do `NumeroSaida`
  (commit: `feat(api-numeros): listar e ler numeros sem segredo`)
- [ ] 8. `PATCH /numeros/:id/status` (pausar, reativar, remover = `status = 'removido'`, sem DELETE);
  remover limpa `token_cifrado` (set NULL) para que o segredo não permaneça após desconexão
  (commit: `feat(api-numeros): pausar, reativar e remover numero`)
- [ ] 9. `POST /numeros/:id/reconectar`: renova token (rotação) pelo mesmo fluxo de código, substituindo
  `token_cifrado`  (commit: `feat(api-numeros): rotacionar token do numero`)
- [ ] 10. Redaction de log para `token`, `codigo`, `access_token`, `authorization` e telefone nos campos
  desta superfície (reusar a redaction de F4; só acrescentar chaves se faltar)
  (commit: `feat(api-numeros): redaction das chaves do onboarding`)
- [ ] 11. Testes de unidade e integração do módulo  (commit: `test(api-numeros): suite de numeros whatsapp`)
- [ ] 12. Testes de segurança e matriz de privilégio por `SET ROLE` (SEC-022/023/031)
  (commit: `test(api-numeros): sec de segredo e privilegio por role`)
- [ ] 13. Revisão Opus contra o SEGURANCA.md antes de `CONCLUIDO` (toca segredo)

## Testes e segurança exigidos

**Unidade/integração:**
- Conectar com stub: grava hash e cifra, resposta sem token nem número; `phone_number_id` duplicado 409.
- Round trip: o `zap` (conexão `whaviso_zap`) lê `token_cifrado` e decifra com a mesma master key.
- Pausar/reativar/remover; remover zera o token; reconectar troca o token.
- Falha da Meta (código inválido, timeout, 5xx) vira erro padronizado e **não grava registro parcial**
  (transação ou gravação só depois do sucesso).
- Papéis: atendente não conecta nem altera; gerente conecta somente em lojas do seu escopo.

**SEC aplicáveis:**
- `SEC-022`: matriz por `SET ROLE`: `whaviso_atendente` não lê `token_cifrado` (grant por coluna da 0003);
  `whaviso_zap` lê, mas não escreve token.
- `SEC-023`: dump de banco semeado com token conhecido não contém o texto claro do token nem do número.
- `SEC-031`: `whaviso_zap` só atualiza `status` e `verificado` em `numeros_whatsapp`; update de outra
  coluna falha.
- `SEC-020` (por analogia): varredura das respostas da api não encontra o token.
- `SEC-024`: token e código do Signup nunca aparecem em log (teste injeta e confirma máscara).
- `SEC-070`: a porta Meta só fala com `graph.facebook.com`; teste de redirect para `169.254.169.254` e
  `localhost` falha.
- `SEC-001`/`SEC-002`: loja de outra conta devolve 404; `loja_id` do corpo só vale se estiver no escopo.
- `SEC-101`: rate limit no `POST /numeros` e `/reconectar`.

## Notas e decisões

- **Porta própria na api:** a árvore proíbe a api de importar o `zap`. Decisão: porta
  `MetaOnboarding` na api (`shared/meta_onboarding`), mínima e só do fluxo de cadastro (troca de código,
  leitura do telefone, assinatura do webhook). O envio de mensagem continua exclusivo do `ClienteWhats`
  no `zap`. Se F2 definir contrato comum, migrar sem mudar as rotas.
- **Número só como hash:** o E.164 é lido da Meta apenas para calcular `numero_hash` e `ultimos4`
  exibível; `ultimos4` não existe como coluna no baseline. Decisão: **não** persistir `ultimos4` agora
  (o front usa o `phone_number_id`/apelido); se o produto exigir, é migration nova de metadado e muda
  o contrato. Registrar antes de implementar.
- **Mesmo número em duas lojas:** `phone_number_id` é unique global; um número pertence a uma loja.
- **Master key:** rotação da master key (re-cifrar tokens) fica fora desta onda; o formato `v1` já
  carrega versão para permitir `v2` depois.
- **Webhook assinado:** a assinatura do webhook (`SEC-050`) é do `ZAP-webhook`; aqui só se registra a
  assinatura da WABA na Meta.
