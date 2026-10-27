# roteirizacao (frontend)

## Propósito
Sugestão automática de corridas da loja ativa (`/roteirizacao`, grupo entrega). Duas abas:
- **Sugestões**: pede ao servidor para agrupar os pedidos de entrega prontos em corridas (tempo
  de preparo + proximidade), mostra saída prevista, tempo/distância e paradas; o operador ajusta a
  ordem (subir/descer), pode recalcular ("Otimizar ordem") e **aceita** cada corrida (motoboy
  opcional). Lista também os pedidos sem localização, com ação de localizar endereços.
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
