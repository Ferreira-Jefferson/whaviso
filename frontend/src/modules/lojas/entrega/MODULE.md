# lojas/entrega

Subárea do módulo `lojas`: as zonas de entrega de UMA loja (fonte única, operacional). Absorvida do
antigo módulo solto `zonas` (rota `/zonas`, removida): entrega passou a morar na edição da loja, na aba
"Entrega" do `FormularioLoja`.

## Entry point
- `GestaoEntrega`: conteúdo da aba Entrega (resumo + lista + "Nova zona" + "Importar bairros" +
  editar/desativar). Sem `PageHeader` de página inteira (é conteúdo de aba).

## Dados (`api.ts`)
- Escopo = loja ativa do shell, via header `x-loja-id` do `api_client` (NUNCA loja no corpo). O editor
  torna a loja ativa (`useTenant().selecionarLoja`) antes de mostrar a aba.
- `GET /v1/zonas` (lista; `incluir_inativas`), `POST /v1/zonas` (bairro | polígono | raio),
  `PATCH /v1/zonas/:id`, `POST /v1/zonas/:id/{ativar,desativar}`, `POST /v1/zonas/lote` (vários bairros).
  Cache raiz `['zonas']`. Dinheiro em centavos.

## Componentes
- `ZonaDialog`: criar/editar uma zona (tipo só se escolhe na criação); mapa via `@/shared/mapa`
  (`SeletorArea` para raio e polígono). Desativar = zona nunca some.
- `LoteDialog`: importação rápida de bairros com os mesmos valores (transacional).
- `estados.ts`: rótulos de tipo e resumo da área (apresentação; a regra de qual zona atende é do servidor).

## Notas
- Contratos: `@/shared/contracts/_generated/zonas_entrega` (não redefinir).
- Módulo nunca importa módulo: tudo compartilhado (mapa) vem de `@/shared/*`.
