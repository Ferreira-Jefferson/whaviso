# Entrega (zonas) e Horarios dentro da edicao de UMA loja

Plano comum congelado (2026-10-28). Decisao do Jeff: tudo que pertence a UMA loja (zonas de entrega e
horarios de atendimento) mora na edicao daquela loja, nao em modulos/paineis soltos. Executado por
subagentes; o orquestrador verifica e commita cada lane (subagente NAO roda git). Fonte da verdade do
dominio: `historias/`.

## Contexto (estado atual, verificado)

- `zonas_entrega` (tabela, modulo backend `apps/api/src/modules/zonas_entrega`) ja e POR LOJA
  (`loja_id`), rica (bairro | poligono | raio, com taxa_cliente, valor_motoboy, pedido_minimo,
  frete_gratis). E o modelo OPERACIONAL: `pedidos.zona_id` referencia ela e o motor do atendente a le
  (ResolverZona) para decidir entrega/taxa. O front tem um modulo SOLTO `modules/zonas` (rota `/zonas`,
  grupo Entrega) que edita isso; o `ZonaDialog` ja usa o mapa (`SeletorArea`) para raio E poligono.
- `lojas.area_entrega` (coluna jsonb: raio | bairros | nenhuma) e a versao CAPADA: so aparece no perfil
  da loja (FormularioLoja via `EditorAreaEntrega`, e no CardLoja), SEM preco, e NAO e usada
  operacionalmente (nenhum uso em apps/atendente nem apps/zap; so lojas + docs). As zonas a superam por
  completo (mesmo mapa + poligono + preco). Logo: VESTIGIAL, pode cair.
- Disponibilidade (horarios_funcionamento/excecoes/agendamento, modulo `disponibilidade`) ja e por loja,
  mas as rotas escopam pela LOJA ATIVA do shell (header `x-loja-id` -> `req.escopo.loja_ativa`, NUNCA
  param/corpo: SEC-001/002). A UI (`modules/lojas/disponibilidade/Painel`) fica num bloco SOLTO no
  rodape da pagina Lojas, operando na loja ativa, por isso "parece geral".

## Alvo

O editor de loja (`FormularioLoja`) vira o lar de tudo de UMA loja, em abas:
- **Perfil**: nome, endereco.
- **Entrega**: as ZONAS (lista + Nova zona + Importar bairros + editar/desativar), via os componentes
  absorvidos do antigo modulo zonas. Substitui a secao "Area de entrega" e o `EditorAreaEntrega`.
- **Horarios**: o conteudo do `PainelDisponibilidade` (atendimento + agendamento + excecoes + estado
  "agora").

Tudo escopa pela loja ativa (header), mantida a regra "loja vem do header, nunca do corpo". Abrir o
editor de uma loja a torna a loja ativa (`selecionarLoja`) para que Entrega/Horarios operem nela.

## Lanes

### Lane A (backend) - dropar `lojas.area_entrega`  [FUNDACAO, primeiro, sozinha; arvore backend/]

Espelha a limpeza de `lojas.horarios` (commit b866b68) ponta a ponta.

1. Migration `backend/supabase/migrations/0062_drop_lojas_area_entrega.sql`:
   `alter table public.lojas drop column if exists area_entrega;` + comentario de topo (a entrega da
   loja passa a ser 100% `zonas_entrega`; `area_entrega` era cosmetica e nao-operacional). NAO aplicar
   no cloud (o orquestrador aplica).
2. Contrato `backend/packages/shared/src/contracts/lojas.ts`: remover o campo `area_entrega` de
   `LojaSaida`/`LojaCriarEntrada`/`LojaAtualizarEntrada` e os schemas `AreaEntrega`/`Centro`/`RAIO_KM_MAX`
   SE ficarem sem uso apos a remocao (confirmar por grep que nada fora do modulo lojas os importa; o
   front `EditorAreaEntrega` sera removido na Lane B, entao o `RAIO_KM_MAX` reexportado para o front
   pode sair, mas confirmar que o ZonaDialog NAO depende dele, ele usa o proprio max do SeletorArea).
3. `lojas` modulo (repo/service/schemas/MODULE.md/lojas.test.ts): remover leitura/escrita e o campo
   `area_entrega` de `LojaLinha`/COLUNAS/inserir/atualizar/`paraSaida`; tirar do re-export de schemas.ts
   o que deixou de existir; ajustar os testes (sem `area_entrega`).
4. `npm run gen:contracts` + `check:contracts`.
5. Gate backend completo verde: `lint`, `typecheck`, `test`, `test:security`; se mexer schema rodar
   `bash scripts/validate_migrations.sh whaviso_dev` antes do test.

Nota: `area_entrega` aparece tambem no FRONT (CardLoja, FormularioLoja, mocks) - isso e da Lane B (o
`_generated` vem da Lane A pelo gen; nao editar `_generated` a mao).

### Lane B (frontend) - absorver zonas + horarios na edicao da loja  [depois de A commitada; arvore frontend/]

Padrao de absorcao ja usado no projeto (CRM->clientes, Numeros->canais): mover o modulo filho para
dentro do dono e APAGAR o modulo solto + sua rota. Dono = `modules/lojas`.

1. **Absorver zonas** em `modules/lojas/entrega/`: mover `modules/zonas/{api,estados,components/ZonaDialog,
   components/LoteDialog}` e o conteudo da pagina `Zonas.tsx` (lista/resumo/tabela/dialogs) para
   `modules/lojas/entrega/` (preservando imports relativos). A api de zonas segue header-escopada (loja
   ativa) sem mudanca. Apagar `modules/zonas/` inteiro (index, MODULE.md, pages, etc).
2. **Editor em abas**: transformar `FormularioLoja` num editor com abas (usar `Tabs`/`SegmentedControl`
   do design system, como o PainelDisponibilidade ja usa Tabs):
   - Perfil: nome + `EditorEndereco` (como hoje, menos area).
   - Entrega: a lista/gestao de zonas absorvida (Nova zona, Importar bairros, editar/desativar).
   - Horarios: o `PainelDisponibilidade` (mover de `modules/lojas/disponibilidade/` para dentro do fluxo
     do editor; pode continuar em `modules/lojas/disponibilidade/`, so muda onde e renderizado).
   - Remover `EditorAreaEntrega` (arquivo) e toda referencia a `area_entrega`/`AreaForm`/`montarArea`/
     `areaParaForm` em `campos.ts` e no form.
3. **Escopo da loja ativa**: abrir o editor (Editar numa card OU Nova loja apos criar) deve
   `selecionarLoja(id)` para que Entrega/Horarios operem na loja certa (as apis sao header-escopadas).
   Criar loja: cria o perfil (nome/endereco), no sucesso torna a nova loja ativa e mantem o editor
   aberto em modo edicao com as abas Entrega/Horarios liberadas (criar-depois-configurar). Deixar claro
   na UI que Entrega/Horarios so valem apos a loja existir.
4. **Remover o solto**: tirar a rota `/zonas` de `app/rotas.ts` (grupo Entrega fica so com Motoboys),
   limpar o import de icone orfao; remover o bloco `PainelDisponibilidade` do rodape de `Lojas.tsx`.
5. **CardLoja/mocks**: tirar a exibicao de `area_entrega` do CardLoja (se houver; pode mostrar contagem
   de zonas no lugar, opcional); limpar `area_entrega` dos mocks e garantir mocks de zonas/disponibilidade
   para o editor.
6. Gate front completo verde: `typecheck`, `lint`, `build`, `test`.

NAO fazer gambiarra (shell compondo modulos soltos): a entrega e os horarios passam a ser do modulo
lojas, de verdade. Modulo nunca importa modulo; o que for compartilhado (mapa `SeletorArea`,
`useCentroLoja`) ja esta em `shared/`.

## Ordem

A sozinha (muda schema + contrato + regen). Depois B (front, um bloco; arvore unica, nao paralelizar
sub-lanes no mesmo front). O orquestrador verifica e commita cada lane.
