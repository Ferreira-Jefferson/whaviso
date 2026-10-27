# roteirizacao (prefixo `/v1/roteirizacao`)

Sugere corridas automaticas: agrupa pedidos de entrega prontos por **tempo de preparo + proximidade** e
ordena as paradas. O operador aceita a sugestao; a corrida so existe depois do `aceitar`. Operacao manual
de corridas continua no modulo `despacho` (este modulo nao o importa; le o que precisa por SQL).

Fonte de regra: `historias/backend-api/roteirizacao.md`.

## Rotas

| Metodo e caminho | Permissao | O que faz |
|---|---|---|
| `GET /config` | `pedidos:gerir` | parametros da loja (defaults se nao configurou) |
| `PUT /config` | `loja:gerir` | patch parcial com upsert |
| `POST /geocodificar-pendentes` | `pedidos:gerir` | geocodifica enderecos sem coordenada (lote 1..25) |
| `POST /sugerir` | `pedidos:gerir` | corridas sugeridas, `sem_localizacao`; NAO persiste corrida |
| `POST /aceitar` | `pedidos:gerir` | cria `corridas.sugerida = true` e grava `corrida_id/ordem_parada` (atomico) |
| `POST /reordenar` | `pedidos:gerir` | recalcula so a ordem de uma lista manual (nao persiste) |

## Dono de escrita

`despacho_config`; `enderecos.lat/lng/geocodificado_em/geocode_falha_em` (unico escritor); INSERT em
`corridas` (sugerida) e `pedidos.corrida_id/ordem_parada/motoboy_*`. O `status` do pedido nunca muda.

## Decisoes

- **Agrupamento** (`agrupar.ts`, puro): semente = pronto mais cedo; entra o candidato de menor acrescimo de
  insercao se `|pronto - semente| <= janela_saida_min`, acrescimo `<= desvio_max_min` e cabe em
  `max_pedidos_corrida`. **Ordem** (`ordenar.ts`): vizinho mais proximo + 2-opt sobre a matriz de tempo
  (aberto, ou fechado com `volta_a_loja`).
- **Pronto previsto** = `criado_em + preparo_base + itens * preparo_por_item` (config da loja).
- **Geocode**: cache e o proprio `enderecos.lat/lng`; consulta so com campos de endereco; coordenada fora de
  80 km da origem da loja vira falha; falha permanente grava `geocode_falha_em` (nova tentativa em 24h);
  erro retentavel (rate limit/transitorio) interrompe o lote sem marcar falha. Serial, com pausa (~1 req/s).
- **ClienteMapas**: unica saida de rede (SEC-070). `criarRoteirizacaoRoutes(mapas)` recebe a implementacao;
  o plugin padrao `roteirizacaoRoutes` injeta o provedor REAL `criarMapasOsm` (Nominatim p/ geocode + OSRM
  p/ matriz/rota, em `@whaviso/shared/clientes`, via `fetchSeguro`) quando as vars `API_MAPAS_*` estao
  configuradas; sem elas (dev/offline/testes) cai em `mapas_indisponivel` (nunca inventa coordenada): matriz
  vira linha reta (`estimado = true`) e geocode fica `pendente`. Resiliencia na impl: limitador ~1 req/s no
  Nominatim, teto de tempo por chamada e disjuntor por provedor (RES-001..003).
  - Vars (convencao `API_*`, lidas no boot): `API_MAPAS_NOMINATIM_URL` (base HTTPS do Nominatim),
    `API_MAPAS_OSRM_URL` (base HTTPS do OSRM), `API_MAPAS_CONTATO` (contato exigido pela politica do
    Nominatim, compoe o User-Agent), `API_MAPAS_USER_AGENT` (opcional, User-Agent completo),
    `API_MAPAS_TIMEOUT_MS` (opcional, default 8000), `API_MAPAS_INTERVALO_MS` (opcional, default 1000).
- Sem origem configurada, a origem e o centroide das paradas (`origem_configurada = false`).
- Pedidos ja com motoboy individual nao entram (mesmo criterio do painel do despacho).
