# custos

## Proposito
Razao de custos externos da plataforma (LLM, WhatsApp, mapas, fiscal) e catalogo de tarifas Meta.
Duas visoes: a LOJA ve so os proprios custos (resumo, pico diario para o alerta SEC-100, eventos);
o OPERADOR ve so agregado/metrica da base inteira, nunca conteudo e nunca lista por loja (SEC-003).
`uso_llm` e o detalhe especifico de LLM; `eventos_custo` e o razao unificado de todos os externos.

## Entry points
- `index.ts`: `custosRoutes` (registry, prefixo `custos`) e `registrarEventoCusto` (ingestao).
- Rotas (`/v1/custos`): loja `GET /resumo`, `GET /eventos`; operador `GET /plataforma/resumo`,
  `GET /plataforma/tarifas`.

## Escopo / permissoes
- Loja: `acesso = conteudo_de_loja`, `escopoLoja` + `loja:gerir`. A loja vem do escopo (x-loja-id).
- Operador: `acesso = plataforma`, `escopoOperador` (membro de loja recebe 403).

## Tabelas (migration 0047)
- `eventos_custo`: append-only (trigger rejeita UPDATE, sem DELETE). SEM coluna de conteudo.
  Insert: whaviso_api, whaviso_zap, whaviso_atendente. Select: whaviso_api.
- `tarifas_meta`: select pela api; escrita so por migration/operacao. Catalogo ainda vazio.

## Contrato de ingestao (produtores)
`EventoCustoNovo`: `loja_id` (nulo = custo de plataforma), `categoria` (llm|whatsapp|mapas|fiscal),
`origem` (`[a-z0-9_.]{1,60}`), `valor_centavos` (custo total do evento, arredondado para cima),
`quantidade` (unidades: tokens, mensagens, requisicoes), `referencia` (so ids), `chave_idempotencia`
(reenvio de (origem, chave) e ignorado). zap/atendente gravam com o proprio pool usando o mesmo
INSERT (sem RETURNING, sem alvo de conflito).

## Definicoes
- Periodo em dias America/Sao_Paulo inclusivos; default ultimos 30 dias; maximo 92.
- `pico_dia` = dia de maior custo do periodo (null sem custo); `media_dia_centavos` = total / dias.
