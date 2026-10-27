# zonas (frontend)

## Propósito
Zonas de entrega da loja ativa (`/zonas`, grupo entrega): lista, cadastro e edição de zonas por
bairro, polígono ou raio, cada uma com taxa cobrada do cliente, valor pago ao motoboy, pedido
mínimo e frete grátis (os dois últimos opcionais: vazio = sem regra). Importação rápida de bairros.

## Entry points
- `index.ts`: export default da página (para `lazy(() => import('@/modules/zonas'))`).

## Dados (`api.ts`, raiz de cache `['zonas']`)
- `GET /v1/zonas` (`incluir_inativas`), `POST /v1/zonas`, `PATCH /v1/zonas/:id`,
  `POST /v1/zonas/:id/ativar|desativar`, `POST /v1/zonas/lote`.
- Contratos: `@/shared/contracts/_generated/zonas_entrega`. Toda mutação invalida a raiz.

## Notas
- Dinheiro em centavos: entrada por `MoneyInput`, exibição por `formatarCentavos`.
- Tipo da zona só se escolhe na criação (a api não troca o tipo). "Excluir" = desativar.
- Polígono: o usuário digita um ponto por linha (`latitude, longitude`); a tela converte para o
  anel GeoJSON `[lng, lat]` e fecha o anel. Raio: centro (lat/lng) + metros.
- Qual zona atende um endereço é decisão do servidor (`/zonas/resolver`, usado na conversa); esta
  tela não calcula cobertura. `pedidos_em_aberto` é aviso informativo, não bloqueia.
- Sem primitivo novo: só `@/shared/ui`. Módulo não importa módulo.
