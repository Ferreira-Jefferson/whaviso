# AT-llm llm_client

- **ID:** AT-llm  ·  **Área:** AT  ·  **Onda:** 2
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

## Objetivo

Implementar `ClienteLLM` (interface de F2) em `atendente/shared/llm_client`, com OpenRouter como provedor
inicial e outros plugáveis por configuração. Cada chamada resolve a **credencial da loja** em
`credenciais_llm`, decifra a chave **só no instante do uso**, chama o provedor com a chave dela no header,
exige modo **no-train/sem retenção** e contabiliza o consumo em `uso_llm`. Sem credencial ativa, devolve um
resultado tipado `llm_indisponivel` e o chamador degrada para o fluxo sem LLM; **nunca** cai na chave de
outra loja nem em chave global. "Pronto" observável: uma chamada de teste usa a chave da loja A, grava uso
da loja A, e a mesma chamada para a loja B sem credencial falha fechada.

## Dependências

- `F2` (clientes-externos): contrato `ClienteLLM` e stub.
- `API-config-llm`: quem grava e valida a credencial (set/rotate, `ultimos4`, `ativo`, `validada_em`); este
  módulo só consome. Define o formato do envelope de cifra, que aqui é decifrado.

## Contratos e tabelas que toca

- **Papel de banco:** `whaviso_atendente`, o **único** com SELECT em `credenciais_llm.chave_cifrada`
  (SEC-021/022).
- **Lê:** `credenciais_llm` (provedor, `chave_cifrada`, `modelo_preferido`, `ativo`), por `loja_id`.
- **Escreve (append-only):** `uso_llm` (tokens de entrada/saída, custo estimado, módulo chamador, loja);
  UPDATE rejeitado por trigger (SEC-033).
- Contrato do kernel: `ClienteLLM` (completar texto, chamada com saída estruturada validada por Zod,
  visão para imagem, transcrição de áudio) e os erros tipados.
- Master key do envelope fora do banco (env/secret manager), lida só pelo processo do atendente.

## Arquivos (escopo de edição)

- `backend/apps/atendente/src/shared/llm_client/**`
- `backend/apps/atendente/src/shared/llm_client/tests/**`
- `backend/apps/atendente/test/security/**` (testes SEC deste módulo)
- Kernel compartilhado só se combinado: helper de decifra de envelope em `backend/packages/shared/...`

## Etapas

- [ ] Resolver de credencial: `loja_id` -> linha ativa de `credenciais_llm` (query parametrizada, escolha
      explícita das colunas, sem `select *`); ausência ou `ativo=false` => `llm_indisponivel`  (commit: `feat(atendente): resolver de credencial llm por loja`)
- [ ] Decifra do envelope com a master key do ambiente: o resultado vive só numa variável local da chamada,
      zerado após o uso, **nunca** em cache nem em campo de objeto de longa vida  (commit: `feat(atendente): decifra de chave llm no uso`)
- [ ] Adaptador OpenRouter: URL base **fixa** e allowlist de host, `redirect: 'error'`, timeout, chave no
      header `Authorization`, **fora do corpo e do prompt**  (commit: `feat(atendente): adaptador openrouter`)
- [ ] Modo no-train: enviar as preferências de provedor que negam coleta/treino e retenção (ex.:
      política de dados do OpenRouter por requisição) e **recusar** modelos/rotas que não as honrem;
      registrar o parâmetro exato usado e o link da doc na seção Notas  (commit: `feat(atendente): politica no-train`)
- [ ] Interface por provedor (porta + adaptadores): trocar para Anthropic ou outro = novo adaptador +
      configuração, sem tocar chamadores  (commit: `refactor(atendente): porta de provedores llm`)
- [ ] Chamada com saída estruturada: schema Zod do chamador, validação da resposta, uma retentativa de
      reparo e erro tipado `saida_invalida`; a saída é **dado**, nunca comando  (commit: `feat(atendente): saida estruturada validada`)
- [ ] Contabilizar uso: gravar em `uso_llm` tokens e custo estimado por chamada (mesmo em falha parcial);
      falha ao gravar uso não vaza erro com segredo  (commit: `feat(atendente): registro de uso_llm`)
- [ ] Limite de gasto por loja (orçamento diário configurável a partir de `uso_llm`): estourado =>
      `limite_excedido` e degradação para o fluxo sem LLM (base do alerta SEC-100)  (commit: `feat(atendente): teto de gasto por loja`)
- [ ] Classificação de erros do provedor: `transitorio` (retentável com backoff), `chave_invalida`
      (marca a credencial para revisão pelo dono via contrato, sem logar a chave), `limite`, `conteudo`  (commit: `feat(atendente): erros tipados do llm`)
- [ ] Redaction: garantir que `chave`, `authorization` e o corpo bruto de request/response não saem em log
      nem em mensagem de erro; exceções são sanitizadas antes de propagar  (commit: `feat(atendente): sanitizacao de erros e logs do llm`)
- [ ] Testes (ver abaixo)  (commit: `test(atendente): llm_client`)
- [ ] Revisão (Opus) obrigatória contra SEGURANCA.md (módulo do ativo mais caro)

## Testes e segurança exigidos

- Unidade com servidor HTTP falso do provedor: header de auth correto, corpo sem a chave, no-train
  presente, saída estruturada válida e inválida, cada classe de erro.
- Integração em `whaviso_dev`: duas lojas com chaves diferentes (valores sentinela); cada chamada usa a chave
  da própria loja; a loja sem credencial falha fechada; `uso_llm` gravado na loja certa.
- **SEC-020**: a chave nunca aparece em retorno do módulo nem em erro propagado (varredura com sentinela).
- **SEC-021**: `whaviso_api` não consegue SELECT em `chave_cifrada` (matriz por `SET ROLE`, em F7).
- **SEC-022**: só `whaviso_atendente` lê; `whaviso_zap` não.
- **SEC-024**: sentinela de chave injetada não aparece em nenhuma saída de log nem em stack trace.
- **SEC-026**: a request montada ao provedor não contém a chave no texto do prompt/corpo (vai só no header).
- **SEC-060**: o system prompt, a chave e dados de outra loja não são extraíveis por prompt adversarial
  (o módulo nunca coloca segredo no contexto; testado junto com `entender_mensagem`/`rag`).
- **SEC-062**: este módulo não monta contexto, mas recebe `loja_id` obrigatório; sem ele, falha.
- **SEC-070**: host fixo; redirect para `169.254.x`/`localhost` falha.
- **SEC-033**: `uso_llm` rejeita UPDATE e não tem DELETE.
- **SEC-100**: pico de consumo por loja é detectável a partir de `uso_llm` (consulta de apoio testada).

## Notas e decisões

- Decisão: **falha fechada**. Qualquer dúvida sobre credencial (ausente, inativa, decifra falhou) resulta em
  `llm_indisponivel`, nunca em fallback para outra chave.
- Decisão: a master key nunca é lida por `api` nem por `zap`; só o processo do atendente a recebe.
- Decisão: contabilização de custo é **estimativa** com tabela de preço por modelo mantida em config; não é
  faturamento.
- Decisão: a política exata de no-train do OpenRouter (parâmetros por requisição e configuração de conta)
  deve ser confirmada na documentação vigente na hora da implementação e registrada aqui; se um modelo não
  puder honrá-la, ele fica fora da lista permitida.
- Decisão (RAG.md seção 4): **embedding e rerank usam a credencial da plataforma**, não `credenciais_llm`;
  o `ClienteLLM` cobre **geração, contextualização de chunk, STT e visão** com a chave da loja. O `uso_llm`
  ganha `tipo_uso` (`geracao`, `embedding`, `rerank`), delta da migration `0013_rag`. `chave_cifrada`
  continua restrita ao uso de geração do atendente.
- Decisão: a decifra por chamada tem custo desprezível frente à latência do LLM; não otimizar com cache.
