# shared/harness (AT-harness)

Laco agentico do atendente, em `shared/` para o motor chama-lo sem import modulo->modulo. Fonte:
[docs/pivot/HARNESS-ATENDENTE.md](../../../../../docs/pivot/HARNESS-ATENDENTE.md) e
`historias/regras-negocio/09-atendente-ia-guardrails.md`.

## Fronteira sagrada
O harness ENTENDE e PROPOE; o motor deterministico EFETIVA. Saida do modelo e DADO (SEC-061): eventos so
vem de resultados de tool do servidor (ou do sinal de handoff); o JSON final do modelo nunca produz evento.

## Entrada
`rodarTurno(deps, entrada): Promise<ResultadoHarness>` (nunca lanca por falha de LLM).
- `deps`: `servico` (ServicoLlm), `registro` (RegistroTools de modules/tools), `repo` (`criarRepoHarness(exec)`),
  `logger`, `exec`, `entender?` (pre-passo de escopo, ex.: `(t) => entendedor.entender({ exec, lojaId, mensagem: { tipo: 'texto', texto: t }, cardapio })`).
- `entrada`: `ctx` selado (`selarCtxDaConversa`), `texto`, `mensagemId?`, `entendimento?`, `lojaNome?`, `persona?`, `cardapioNomes?`.

## Saida
- `resposta`: `RespostaProposta` + `desfecho` (`resposta|handoff|recusa_escopo|aviso_final_escopo|vazamento_bloqueado`).
  Evento `escalar_humano` => o motor faz `conversas.status='humano'` + `conversa.handoff`.
- `silencio`: insistencia off-topic acima do limiar; o motor so consome a mensagem (sem envio, sem LLM).
- `sem_llm`: o motor segue por botoes (loja suspensa, sem credencial, teto de passos/gasto/tempo, limite).

## Guardrails
- Escopo: contador de insistencia DERIVADO (saidas consecutivas da IA iguais aos textos de recusa), sem coluna.
  Limiar 3: 1a e 2a redirecionam, 3a avisa que vai parar, depois silencio (zero LLM; so retorna se o texto parece da loja).
- Humano: baixa confianca (< 0.5), `precisa_humano`, tool `escalar_humano`, saida invalida apos 1 reparo, intencao `falar_com_humano`.
- Injecao/vazamento: cliente, historico, persona e resultado de tool entram DELIMITADOS e declarados dado; sem chave,
  telefone nem ids no prompt; saida com segredo/trecho do prompt/canario e descartada.
- Tetos: 5 passos, 3 tools por passo, 30 centavos e 24k tokens por turno, 30 s; `limite_excedido` do ServicoLlm degrada.
- Observabilidade: `harness turno` (loja_id, conversa_id, passos, ferramentas, tokens, custo, parada); nunca texto/PII/chave.

## Tabelas
Le (SELECT): `lojas` (suspensa, ativo), `mensagens`. Nao escreve nada. Sem migration.
