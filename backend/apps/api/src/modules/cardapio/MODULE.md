# cardapio

## Proposito
Cardapio da loja: grupos de opcoes reutilizaveis, categorias, itens, e a heranca (categoria -> item)
com excecao por item. Entrega a arvore resolvida (grupos efetivos + disponibilidade calculada pelo
servidor) para o painel e a visao "pedivel agora" para pedidos/atendente. Quem edita: gerente e dono;
atendente le e liga/desliga disponibilidade.

## Entry points
- `index.ts` (plugin Fastify registrado em `src/routes.ts`, prefixo `cardapio`, rotas `/v1/cardapio/*`)
- `GET /`, `GET /publico-resolvido`, `GET|POST /grupos`, `PUT /grupos/ordem`, `PATCH /grupos/:id`,
  `POST /grupos/:id/opcoes`, `PUT /grupos/:id/opcoes/ordem`, `PATCH /opcoes/:id`,
  `POST /categorias`, `PUT /categorias/ordem`, `PATCH /categorias/:id`, `PUT /categorias/:id/grupos`,
  `POST /itens`, `PATCH /itens/:id`, `PUT /itens/:id/grupos`,
  `POST /itens/:id/disponibilidade`, `POST /opcoes/:id/disponibilidade`

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao: unica via de dados), `@whaviso/shared/datas`
- `shared/http_errors`, `shared/auth` + `shared/tenant` (escopo de loja, `loja:gerir` / `pedidos:gerir`)

## Arquivos
- `resolvedor.ts`: funcoes PURAS (heranca/excecao, disponibilidade, programacao SP, preco). Candidato a
  subir para o kernel `packages/shared` sem mudar assinatura (pedidos/atendente reusam).
- `arvore.ts`: monta a arvore resolvida (modos `painel` e `pedivel`).
- `repo.ts` (leitura) e `repo_escrita.ts` (escrita + auditoria); `service_*.ts`; `routes*.ts`; `schemas.ts`.

## Tabelas
- dono de: `grupos_opcoes`, `opcoes`, `categorias`, `categoria_grupos`, `itens`, `item_grupos`
- escreve: `eventos` (auditoria `cardapio.*`, sem PII)
- le de: `lojas` (so via escopo)

## Regras de heranca e excecao
- Efetivos = grupos da categoria menos `incluir=false` mais `incluir=true`; grupo inativo some.
- Ordem: acrescentado pelo item usa `item_grupos.ordem`; herdado usa `categoria_grupos.ordem`; depois
  `grupos_opcoes.ordem`; desempate por id.
- Sem DELETE no grant: o PUT de excecoes reconcilia por NEUTRALIZACAO. Linha "real" = acrescenta o nao
  herdado ou remove o herdado; omitida do PUT vira neutra (incluir = herdado) e some das saidas.
  Categoria ganhar um grupo converte rastro `incluir=false` dos seus itens para `true`; mover item de
  categoria neutraliza todas as suas excecoes (resposta traz `excecoes_resetadas`).
- `PUT /categorias/:id/grupos` so acrescenta/reordena. Remover vinculo da categoria responde 422
  `remocao_vinculo_nao_suportada` ate decidir: (a) coluna `ativo` em `categoria_grupos`/`item_grupos`
  (recomendado), ou (b) DELETE so nessas tabelas de ligacao. Ate la, use grupo `ativo=false` ou excecao.
- `imagem_url`: https e host na allowlist `HOSTS_IMAGEM_PERMITIDOS` (`service_itens.ts`).

## Contratos
- publica: schemas Zod em `schemas.ts` (espelhados pelo frontend); mutacoes de grupo/opcao devolvem
  `impactos` (add-ons presos a tamanho desativado)
