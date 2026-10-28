# Limpeza: coluna legada `lojas.horarios` + codigo morto

Plano comum congelado (2026-10-28). Executado por subagentes; o orquestrador verifica e commita cada
lane (subagente NAO roda git). Fonte da verdade do dominio: `historias/`, em especial
`regras-negocio/05-disponibilidade-loja.md` e [[disponibilidade-fonte-unica]].

## Contexto

A disponibilidade passou a ter fonte unica na loja via tabelas normalizadas
(`horarios_funcionamento`, `excecoes_disponibilidade`, `agendamento_config`) e o kernel
`@whaviso/shared/disponibilidade`. A coluna jsonb legada `lojas.horarios` ficou orfa de verdade: o
motor do atendente ja migrou, e a UI ja nao a edita. Mas ela ainda esta cabeada no modulo `lojas`
(contrato + repo + service), e `aberta_agora` (consumido pelos cards da tela Lojas) ainda e derivado
dela. Entao dropar a coluna exige **religar `aberta_agora` ao motor novo**, nao e delete puro.

## Lanes

### Lane A (backend) - remover a coluna `lojas.horarios` ponta a ponta  [FUNDACAO, primeiro, sozinha]

Dono unico de migration + contrato + regen. Arvore: `backend/`.

1. **Migration** nova `backend/supabase/migrations/0061_drop_lojas_horarios.sql`:
   `alter table public.lojas drop column horarios;`
   (migrations NAO sao idempotentes; nao use `if exists` como muleta de logica, mas pode usar por
   seguranca). Comentario no topo explicando que a fonte unica agora e `horarios_funcionamento`.
2. **Religar `aberta_agora`** (modulo lojas) ao motor novo, SEM importar o modulo disponibilidade
   (modulo nunca importa modulo; integra-se LENDO as tabelas compartilhadas + usando o kernel
   `@whaviso/shared/disponibilidade`):
   - `repo.ts`: parar de selecionar/inserir/atualizar `horarios`. Adicionar uma leitura em lote das
     faixas ativas (`horarios_funcionamento`) e da excecao de hoje (`excecoes_disponibilidade`) para
     um conjunto de `loja_id` (evitar N+1 na listagem: UMA query por tabela filtrando
     `loja_id = any(...)`).
   - `service.ts` (`paraSaida` e chamadores `listar`/`obter`/`criar`/`aplicar`/`pausar`/`despausar`/
     `definirCapacidade`/`alterarAtivo`): `aberta_agora` passa a vir de
     `lojaAceitandoAgora(faixas, excecaoDeHoje, agora)` do kernel (mesma semantica: aberta para
     pedido ao vivo; `null` quando a loja nao tem faixa cadastrada, preservando o contrato atual).
     Carregar o mapa `loja_id -> {faixas, excecao}` uma vez e passar para `paraSaida`.
   - Remover `horariosVazios()` e o `horarios: entrada.horarios ?? horariosVazios()` do `criar`.
3. **Contrato** `backend/packages/shared/src/contracts/lojas.ts`: remover `Horarios`, `DiaHorario`,
   `FaixaHorario`, `faixasSobrepostas`, `intervalo`, `paraMinutos`, `Hhmm` (se nao usados por mais
   nada APOS a remocao) e o campo `horarios` de `LojaCriarEntrada`, `LojaAtualizarEntrada` e
   `LojaSaida`. **Manter** `aberta_agora` em `LojaSaida` (ajustar o comentario: derivado de
   `horarios_funcionamento`). CUIDADO: ha colisao de nome, o kernel disponibilidade tem o seu PROPRIO
   `FaixaHorario` (import de `@whaviso/shared/disponibilidade`), que NAO deve ser tocado. Confirme por
   grep que os simbolos removidos do contrato nao sao importados fora do modulo lojas.
4. `schemas.ts` (lojas): remover do re-export os simbolos que deixaram de existir.
5. `horarios.ts` (lojas): `lojaAbertaAgora` morre. Se `diaEMinutoSp`/`paraMinutos`/`intervalo`/
   `lojaAbertaAgora` ficarem todos sem uso, **apague o arquivo** `horarios.ts`. NAO confundir com
   `backend/apps/atendente/src/modules/motor_fluxo/horario.ts`, que e OUTRO arquivo e esta VIVO
   (usado por `montar_cardapio.ts` para a programacao por categoria): nao toque nele.
6. `lojas.test.ts`: ajustar/retirar os casos de `horarios`/`horariosVazios`/`lojaAbertaAgora`;
   adicionar cobertura de `aberta_agora` derivado de `horarios_funcionamento` (aberta dentro da faixa,
   fechada fora, `null` sem faixa, excecao fecha o dia). Manter a suite verde e significativa.
7. `MODULE.md` (lojas): tirar a nota do campo legado; descrever `aberta_agora` derivado do motor.
8. Rodar `npm run gen:contracts` (reemite o `_generated` do front) e `npm run check:contracts`.
9. Gate backend completo: `npm run lint && npm run typecheck && npm test` (de `backend/`), mais
   `npm run test:security`. Tudo verde.

Entrega: diff + lista de arquivos + confirmacao do gate. O orquestrador aplica a 0061 no cloud e
commita.

### Lane B (frontend) - varredura de codigo morto  [depois de A commitada; arvore frontend/]

Arvore: `frontend/`. Conservador: so remover o PROVAVELMENTE morto, cada remocao confirmada por grep
de referencias; NUNCA mexer no registry de imports dinamicos (`src/app/rotas.ts`) a nao ser para tirar
import de icone orfao; rodar o gate inteiro ao fim.

- Orfaos deixados pelas 4 absorcoes de modulo (conhecimento/fluxo -> llm, crm -> clientes,
  roteirizacao -> despacho, numeros -> canais) e pela absorcao de disponibilidade em lojas: diretorios
  vazios, arquivos sem nenhum import, exports nunca referenciados, imports de icone nao usados.
- Referencias mortas ao antigo `loja.horarios`/`Horarios` em codigo NAO gerado (o `_generated` ja veio
  da Lane A; nao edite `_generated` a mao). Notas de MODULE.md desatualizadas sobre horarios.
- `src/qa/mocks.ts`: so limpar o que ficou sem uso; mocks de disponibilidade/`aberta_agora` seguem.
- Gate: `npm run typecheck && npm run lint && npm run build && npm test` (de `frontend/`). Verde.

### Lane C (backend) - varredura de codigo morto  [depois de A commitada; paralela a B, arvore backend/]

Arvore: `backend/`. Mesmo rigor conservador da Lane B.

- Exports/arquivos/funcoes sem referencia deixados pelo bloco de disponibilidade (ex.: restos de
  `janela_atendente`, helpers de horario orfaos fora os ja tratados na Lane A).
- NAO dropar nenhuma OUTRA coluna/tabela: se encontrar candidato a schema morto alem de
  `lojas.horarios`, apenas LISTAR no relatorio (o orquestrador decide); migration de schema e so a 0061
  da Lane A.
- Nao tocar em `motor_fluxo/horario.ts` (vivo). Nao tocar no que a Lane A ja mexeu.
- Gate: `npm run lint && npm run typecheck && npm test` + `npm run test:security` (de `backend/`). Verde.

## Ordem

A sozinha (fundacao: muda schema + contrato + regen). Depois B e C em paralelo (arvores diferentes,
sem dependencia entre si). O orquestrador verifica e commita cada lane assim que a integra, uma a uma.
