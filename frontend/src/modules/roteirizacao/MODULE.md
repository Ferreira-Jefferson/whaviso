# roteirizacao (frontend)

## Propósito
Sugestão automática de corridas da loja ativa (`/roteirizacao`, grupo entrega). Duas abas:
- **Sugestões**: pede ao servidor para agrupar os pedidos de entrega prontos em corridas (tempo
  de preparo + proximidade). Mostra um **mapa de despacho** (`mapa/`) com a origem da loja, as paradas
  numeradas por corrida e o trajeto, ao lado da lista de corridas (duas colunas no desktop, empilhado
  no mobile). Passar o mouse/foco num cartão destaca a corrida no mapa e vice-versa (a legenda abaixo
  do mapa é o seletor por teclado). Cada cartão mostra saída prevista, tempo/distância e paradas; o
  operador ajusta a ordem (subir/descer), pode recalcular ("Otimizar ordem") e **aceita** cada corrida
  (motoboy opcional). Lista também os pedidos sem localização, com ação de localizar endereços.
- **Configuração**: preparo base/por item, máximo de pedidos, janela de saída, desvio máximo,
  origem da loja, volta à loja e velocidade média (fallback em linha reta).

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/roteirizacao'))`).

## Dados (`api.ts`, raiz de cache `['roteirizacao']`)
- `GET|PUT /v1/roteirizacao/config`, `POST /v1/roteirizacao/sugerir`, `POST /v1/roteirizacao/aceitar`,
  `POST /v1/roteirizacao/reordenar`, `POST /v1/roteirizacao/geocodificar-pendentes`.
- `GET /v1/motoboys/seletor`: chamada HTTP pelo `api_client` (NÃO import do módulo motoboys) para
  o seletor de motoboy no aceite.
- Aceitar invalida a chave `['despacho']` (string de cache, não import do módulo despacho).
- Contratos: `@/shared/contracts/_generated/roteirizacao` (+ `despacho` e `motoboys`, só leitura).

## Notas
- A sugestão **não persiste**: vive no estado da página (mutation `sugerir`). Só o aceite grava a
  corrida (`sugerida = true`), que então aparece no Despacho com o selo "Sugerida".
- Após ajuste manual de ordem, os horários de chegada por parada são escondidos (ficam inválidos);
  `Otimizar ordem` chama `/reordenar` e atualiza tempo e distância totais. O aceite envia a ordem
  atual da tela.
- Tempos `estimado` (linha reta, provedor de mapas fora) e origem não configurada são avisados.
- Configuração só grava para dono/gerente: o 403 volta como mensagem no formulário.
- Sem primitivo novo: só `@/shared/ui`. Módulo não importa módulo.

## Mapa (`mapa/`, dependência de lib)
- **Leaflet** `leaflet@1.9.4` (licença BSD-2, sem acoplar a versão do React), usado direto (sem
  wrapper), com tiles livres do **OpenStreetMap**. Carregado **lazy** (`MapaDespacho` faz
  `React.lazy(() => import('./MapaLeaflet'))`): o leaflet e seu CSS saem em chunk próprio, fora do
  bundle principal. Marcadores por `divIcon`/`circleMarker` (sem assets de imagem, evita o bug do
  ícone padrão sob bundler) e sem plugin de cluster (poucas paradas por lote; `circleMarker` aguenta
  centenas). O front **não** chama provedor de geocode/rota (SEC-070): só os tiles.
- **CSP (SEC-090):** registrar `*.tile.openstreetmap.org` em `img-src` ao dono do módulo de headers.
  Trocar de provedor de tiles é mudar só `TILES_URL`/`TILES_ATRIB` em `mapa/MapaLeaflet.tsx`.
- **Costura para a geocodificação (seam):** o contrato da sugestão (`ParadaSugerida`) ainda NÃO traz
  `lat`/`lng`. `mapa/geo.ts` (`pontoDaParada`) lê a coordenada de forma defensiva (`lat`/`lng`,
  `ponto` ou `coordenada`): assim que a api (trilha `API-roteiriza` + `ClienteMapas`) passar a mandar
  a coordenada, os marcadores e o trajeto aparecem sozinhos. Degradação: parada sem coordenada **nunca
  some**, fica na legenda e nos cartões; sem coordenada alguma, o mapa mostra a origem (ou o centro de
  São Paulo) com um aviso. O trajeto hoje é por segmentos retos (origem -> paradas em ordem); quando a
  api devolver a geometria real da rota, trocar só a montagem em `trajetoDaCorrida`.
