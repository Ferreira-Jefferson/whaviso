# AT-entender entender_mensagem

- **ID:** AT-entender  ·  **Área:** AT  ·  **Onda:** 2
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

## Objetivo

Dar ao atendente a capacidade de entender o cliente em linguagem livre: **transcrever áudio (STT)** e
extrair **intenção e entidades** do texto (pedir item, alterar carrinho, perguntar preço/horário, cadastrar
endereço, falar com humano, "cadê meu pedido"). A saída é um objeto **estruturado e validado**, tratado como
dado: o motor decide o que fazer com ela, nunca o modelo. "Pronto" observável: um áudio ou frase livre vira
uma intenção válida que o `motor_fluxo` consome como entrada (equivalente a um botão); sem credencial de LLM
da loja, o passo é pulado e o fluxo por botões segue.

## Dependências

- `AT-llm`: `ClienteLLM` (completar com saída estruturada, transcrição) e a resolução de credencial da loja.
- `AT-motor-min`: o motor expõe o ponto de extensão onde a intenção entra como evento do usuário; este
  módulo produz esse evento, não altera o grafo.

## Contratos e tabelas que toca

- **Lê:** `mensagens` (entrada pendente, `media_id`/tipo), `conversas`, `lojas` e cardápio (leitura para
  ancorar entidades a itens reais), `credenciais_llm` apenas via `llm_client` (nunca direto).
- **Escreve:** `mensagens` (campo de **transcrição** do áudio), `uso_llm` (via `llm_client`), `eventos`
  (sem PII).
- Contratos do kernel: `Intencao` (união discriminada Zod: `adicionar_item`, `remover_item`,
  `alterar_item`, `consulta`, `informar_endereco`, `confirmar`, `cancelar`, `falar_com_humano`,
  `acompanhar`, `desconhecida`) com confiança, e a saída do STT. Os schemas vivem no kernel.
- Mídia: baixada pelo atendente via `ClienteWhats` (`ZAP-meta`) usando o `media_id`; mantida só em
  memória/`media_storage` temporário, descartada após transcrever.

## Arquivos (escopo de edição)

- `backend/apps/atendente/src/modules/entender_mensagem/**`
- `backend/apps/atendente/src/shared/stt/**`
- `backend/apps/atendente/test/**`
- `backend/packages/shared/...` **somente** o schema `Intencao` se ainda não existir (combinar com F1)

## Etapas

- [ ] Definir o contrato `Intencao` e o formato de entidades (item, opções, quantidade, endereço livre) no
      kernel, com testes de schema  (commit: `feat(shared): contrato de intencao`)
- [ ] STT: baixar a mídia por `media_id`, validar tipo e tamanho máximo, transcrever via `ClienteLLM`
      (provedor de transcrição configurável), gravar a transcrição em `mensagens`; falha de STT vira
      pergunta de esclarecimento ao cliente, não erro mudo  (commit: `feat(atendente): stt de audio`)
- [ ] Descarte da mídia após a transcrição (sem persistir o áudio além do necessário)  (commit: `feat(atendente): descarte de midia apos stt`)
- [ ] Extração de intenção: prompt com instruções fixas + **cardápio da loja** (ancoragem; ver RAG para o
      escopo) + mensagem do cliente delimitada como dado não confiável; saída estruturada validada
      contra `Intencao`  (commit: `feat(atendente): extracao de intencao`)
- [ ] Ancoragem de entidades: mapear nomes citados a `itens`/`opcoes` reais da loja (busca por similaridade
      simples/normalização); entidade sem correspondência vira pedido de esclarecimento, **nunca item
      inventado**  (commit: `feat(atendente): ancoragem de entidades ao cardapio`)
- [ ] Limiar de confiança: abaixo dele, o motor apresenta botões/lista em vez de agir  (commit: `feat(atendente): limiar de confianca`)
- [ ] Integração com o motor: produz o evento de usuário equivalente a uma escolha de botão e o entrega
      pelo ponto de extensão; sem credencial ou com `limite_excedido`, retorna "sem LLM" e o motor segue o
      fluxo fixo  (commit: `feat(atendente): ponto de extensao de entendimento`)
- [ ] Defesa contra prompt injection: conteúdo do cliente em bloco delimitado e declarado como dado; saída
      que tente instruir (ex.: "ignore as regras") cai em `desconhecida`; nenhuma ação sai da intenção sem
      passar pela regra do node  (commit: `feat(atendente): defesa contra prompt injection`)
- [ ] Testes (ver abaixo)  (commit: `test(atendente): entender_mensagem`)
- [ ] Revisão (Opus) das defesas SEC-060/061

## Testes e segurança exigidos

- Unidade com `ClienteLLM` falso: cada intenção, saída inválida (reparo e erro tipado), entidade sem
  correspondência, baixa confiança, STT com falha, mídia acima do limite.
- Conjunto de **frases reais de pedido** em português (gírias, quantidade por extenso, "o de sempre") com
  expectativa de intenção; mede acerto de forma reproduzível com respostas gravadas (sem chamar a rede).
- **SEC-060**: bateria de prompts adversariais (pedir o system prompt, a chave, dados de outra loja, "ignore
  as instruções") não extrai segredo nem cruza tenant.
- **SEC-061**: saída do modelo é dado; "confirmar o pedido" dito pelo cliente só confirma se o estado do
  fluxo permite, via regra determinística.
- **SEC-062**: o cardápio injetado no prompt é somente o da loja da conversa (teste com duas lojas).
- **SEC-024**: texto da mensagem e transcrição fora dos logs.
- **SEC-026**: nenhuma chave no prompt (herdado de `llm_client`, reafirmado no teste de montagem do prompt).

## Notas e decisões

- Decisão: **LLM é opcional e degradável**. Etapas fixas (confirmação, endereço, pagamento, repetir) seguem
  por botões e regras, como diz a arquitetura; o LLM só entende texto/áudio livre.
- Decisão: o modelo **propõe intenção, o motor decide**. Nada de chamada de função que execute efeito.
- Decisão: transcrição fica em `mensagens` como dado do atendimento (visível ao dono no painel), com a
  mesma proteção de PII das demais mensagens.
- Decisão: provedor de STT segue o mesmo `ClienteLLM` e a mesma credencial da loja (BYO key); se o
  provedor configurado não suportar áudio, o passo degrada para pedir ao cliente que escreva.
