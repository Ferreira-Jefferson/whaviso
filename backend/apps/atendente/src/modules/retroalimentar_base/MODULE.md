# retroalimentar_base (AT-realimentar)

## Proposito
O PRODUTOR do loop de realimentacao do RAG (RAG.md 3): **producao automatica, promocao manual**. Observa
as conversas da loja e gera **rascunhos** de documento de conhecimento; nada e embeddado nem indexado
sem aprovacao do dono (que vive na api, modulo `conhecimento`, e na ingestao do kernel `shared/rag`).
Este modulo **nunca** grava `status='aprovado'` nem `chunks`.

## Entry points
- `retroalimentar({ exec, servico, logger }, agora?)`: ciclo completo (lote periodico ou sob demanda) =
  `coletarSinais` + `gerarRascunhos` + `expirarRascunhos`. Nunca lanca.
- `coletarSinais(deps, agora?)`: observa a janela e enfileira sinais em `rag_feedback` (texto anonimizado).
- `gerarRascunhos(deps)`: para cada sinal novo, gera o rascunho com a chave da LOJA e persiste 'rascunho'.
- `expirarRascunhos(deps)`: sinaliza (evento) os rascunhos vencidos (TTL).

## Sinais (RAG.md 3)
1. **lacuna**: a conversa caiu para humano (`conversas.status='humano'`). A ultima pergunta do cliente
   antes do handoff e o sinal (o que a IA nao soube responder).
2. **correcao_humana**: a resposta do atendente humano (`autor='humano'`, saida), pareada com a pergunta
   do cliente. O par pergunta+resposta e o rascunho de maior valor.
3. **recorrente**: a mesma duvida (assinatura normalizada) em N conversas distintas (`N_RECORRENCIA=3`),
   sem duplicar sinal ja enfileirado. `ocorrencias` carrega a contagem como prioridade.

## Fluxo da geracao
1. Claim por lote: sinais `rag_feedback.status='novo'` sem marca `conhecimento.rascunho_tentado`, SO de
   lojas com credencial de LLM ativa (sem credencial a loja fica inativa). Uma tentativa por sinal.
2. LLM da loja (`ServicoLlm.completarEstruturado` + schema `RascunhoGerado`): saida DADO validada por Zod
   (SEC-061), **proibido inventar** (so reescreve o insumo); `util=false` ou corpo minimo = descarte.
3. **Trava de dado vivo**: reutiliza `validarConteudoConhecimento` do kernel `shared/rag` (preco, "R$",
   "hoje", "esgotado", status, telefone/Pix, cara de chave). Rascunho que cheira a dado vivo e descartado.
4. **Dedup/antilixo**: `hash_conteudo` (sha256 do corpo normalizado) + similaridade (Jaccard) com
   documentos aprovados e rascunhos pendentes da loja.
5. Persiste `documentos` (`status='rascunho'`, `origem='realimentado'`, `fonte_conversa_id`/
   `fonte_mensagem_id`, `hash_conteudo`). Marca `conhecimento.rascunho_tentado` (sem PII) com o
   `documento_id` para a api correlacionar sinal->rascunho na curadoria.
6. Emite `conhecimento.sugestoes_pendentes` (sem PII) para o painel.

## Anonimizacao (SEC-024)
`anonimizar()` roda ANTES de qualquer LLM e antes de gravar `rag_feedback.texto`: mascara nome do cliente,
logradouros, telefone, e-mail, CEP e numero de endereco. PII do cliente nunca sai do banco rumo ao
provedor nem entra no rascunho. O validador de dado vivo e a segunda barreira sobre o rascunho gerado.

## TTL
Rascunho realimentado com `criado_em` acima de `TTL_RASCUNHO_DIAS` (14) e vencido. O role `whaviso_atendente`
nao tem UPDATE em `documentos`, entao o modulo **sinaliza** (`conhecimento.rascunho_expirado`) e a api o
arquiva (ela tem o UPDATE). Vencidos nao contam no "pendentes" do evento de sugestoes.

## Golden set
"par pergunta+resposta humana aprovado vira `base_avaliacao` (origem='realimentado'), so apos aprovacao":
e **da api**. O role atendente so tem SELECT em `base_avaliacao`; o par vive no sinal `correcao_humana` e
no rascunho (`fonte_*`), e a api o semeia quando o dono aprova o documento. Este modulo so produz.

## Tabelas e seguranca
- Le: `conversas`/`mensagens`/`clientes`/`enderecos` (origem), `documentos` (dedup), `credenciais_llm`
  (gate), `eventos` (marcas idempotentes).
- Grava: `rag_feedback` (insert), `documentos` SOMENTE `status='rascunho'`+`origem='realimentado'`,
  `eventos` (insert, sem PII). `uso_llm` e gravado pelo `ServicoLlm` (origem `retroalimentar_base`).
- **Nunca** grava `status='aprovado'` nem `chunks` (SEC-032: a 0052 adiciona a trava de banco que impede
  o role atendente de inserir `documentos` com status diferente de 'rascunho').
- Nunca loga conteudo de conversa, PII nem texto do modelo (SEC-024): so ids, tipo e contadores.

## Agendamento
App-root (`server.ts`) chama `retroalimentar` num tick proprio (intervalo longo, ex.: alguns minutos) com
`servico = criarServicoLlmProducao({ logger })` e `exec` do role whaviso_atendente. Wiring do integrador;
esta entrega nao altera `server.ts`.
