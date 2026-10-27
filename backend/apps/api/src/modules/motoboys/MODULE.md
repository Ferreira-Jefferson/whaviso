# motoboys

## Proposito
Cadastro de entrega do motoboy (veiculo, placa, Pix) e **fechamento do dia**: quanto cada motoboy
tem a receber, somando as entregas feitas (automatico) e ajustes manuais. Fonte:
`historias/backend-api/motoboys.md`. O motoboy e uma **pessoa de cargo fixo `motoboy`** (modulo
pessoas, migration 0025): nome e telefone vivem em `pessoas`; aqui ficam so os campos de entrega.

## Entry points
- `index.ts`: `motoboysRoutes` (registry, prefixo `motoboys`) e `criarMotoboysRoutes(cifra)` (injetavel em teste).
- Rotas finais (`/v1/motoboys`, loja = `x-loja-id`):
  - Cadastro (dono/gerente): `GET /` (`?incluir_inativos`), `POST /` (`pessoa_id` + veiculo/placa/Pix),
    `GET|PATCH /:id`, `POST /:id/ativar|desativar`.
  - Seletor do despacho (`pedidos:gerir`): `GET /seletor` (id, nome, veiculo, ativo).
  - Pix em claro: `POST /:id/pix/revelar` (papel dono/gerente, rate limit 10/min, `no-store`).
  - Lancamento: `POST /:id/lancamentos` (ajuste manual, valor com sinal, descricao obrigatoria).
  - Fechamento: `GET /fechamentos?data=` (materializa + devolve total derivado),
    `POST /fechamentos/:id/pagar` (`total_centavos` visto), `GET /fechamentos/resumo?de=&ate=`.

## Tabelas
- dono de escrita: `motoboys` (insert/update; remover = `ativo=false`), `fechamentos` (insert/update),
  `motoboy_lancamentos` (so select/insert; trigger barra UPDATE; sem DELETE em nenhuma).
- le de (read-model, sem importar codigo de outro modulo): `pessoas` + `cargos` (pessoa de cargo
  motoboy), `pedidos` (entregues com `motoboy_id`) e `zonas_entrega` (`valor_motoboy_centavos`).
- escreve auditoria em `eventos` (`motoboy.*`, `fechamento.pago`), sem PII e sem o Pix.
- migration 0031: `motoboys.pessoa_id` (FK `pessoas`, unico quando nao nulo; nulo nas linhas legadas).

## Decisoes
- **Pessoa e a fonte de nome/telefone**: `motoboys.nome` e so snapshot de criacao; a saida usa o nome
  e o telefone (ultimos 4) da pessoa. Telefone unico por loja deixa de ser regra deste modulo.
- **Totais nunca armazenados**: total do dia = soma dos lancamentos (entregas + ajustes).
- **Materializacao preguicosa** ao abrir o fechamento (`GET /fechamentos`): `INSERT ... ON CONFLICT DO
  NOTHING` sobre `lancamentos_entrega_unica`; dia de negocio por `entregue_em at time zone America/Sao_Paulo`;
  entrega sem zona vale 0; nao materializa para motoboy cujo dia ja esta pago.
- **Dia pago e definitivo**: lancamento manual naquela data = 409 `dia_ja_pago` (lance no dia corrente);
  pagar e idempotente e exige `total_centavos` igual ao derivado (409 `total_divergente` se mudou). Pagar e
  lancar serializam por `FOR UPDATE` na linha do fechamento.
- **Pix**: hash sha256 do Pix normalizado por tipo (+ tipo no preimagem) e cifra AES-256-GCM (kernel
  `@whaviso/shared/cifra`, MASTER_KEY). Saidas so com `pix_ultimos4`. O claro so sai em `pix/revelar`
  (dono/gerente), auditado sem o valor. Aqui a api DECIFRA (diferente da credencial de LLM).
- Correcao de lancamento = novo lancamento de sinal oposto (nunca edicao).
- Fora do escopo = 404 (nao confirma existencia); loja alheia no header = 404 pelo kernel.
