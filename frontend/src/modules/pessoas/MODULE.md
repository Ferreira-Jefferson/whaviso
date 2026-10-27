# pessoas (frontend)

## Proposito
Cadastro da equipe da loja ativa: pessoas que trabalham a favor dela (nao so CLT, ex.:
motoboy, churrasqueiro de fim de semana), seus cargos (funcoes) e a escala de cada pessoa
(dias + horarios). Rota `/pessoas`. Duas abas: Equipe e Cargos.

## Entry points
- `index.ts`: export default da pagina (para `lazy(() => import('@/modules/pessoas'))` no registry de rotas).

## Telas
- `pages/Pessoas.tsx`: abas (Tabs). Aba "Equipe" = lista (nome, cargo, telefone mascarado, badge
  arquivada), filtro Ativas/Todas (SegmentedControl), botao "Nova pessoa". Aba "Cargos" = PainelCargos.
- `components/PessoaDialog.tsx`: dialog de criar/editar pessoa (nome, cargo, telefone, observacoes),
  arquivar/reativar (ConfirmDialog) e, em edicao, a escala (EscalaEditor).
- `components/EscalaEditor.tsx`: adiciona/edita/remove linhas de escala (dia da semana + entrada/saida).
- `components/PainelCargos.tsx`: cria cargos, renomeia/arquiva os proprios; motoboy e presets protegidos.

## Dados
- Prefixo `/v1/pessoas`. `GET /pessoas` (query `incluir_inativos`), `POST /pessoas`, `GET /pessoas/:id`
  (detalhe com escalas), `PATCH /pessoas/:id` (campos + `ativo` para arquivar/reativar).
- Cargos: `GET /pessoas/cargos`, `POST /pessoas/cargos`, `PATCH /pessoas/cargos/:id`.
- Escalas: `POST /pessoas/:id/escalas`, `PATCH /pessoas/escalas/:id`, `POST /pessoas/escalas/:id/desativar`.
- Contratos: `@/shared/contracts/_generated/pessoas` (nao redefinir).
- Cache: raiz `['pessoas']`; toda mutacao (pessoa/cargo/escala) invalida essa raiz (lista + detalhe + cargos).
- A loja ativa vai no header `x-loja-id` (o apiClient injeta); nunca no corpo.

## PII (telefone)
- O telefone da pessoa so e exibido MASCARADO (`telefone_mascarado`, ja mascarado pelo backend).
- A tela NAO usa `POST /:id/telefone/revelar` (revelacao em claro, so dono/gerente): o cadastro
  nao reexibe o numero em claro. Para trocar, digita-se um numero novo (PhoneInput -> E.164); deixar
  em branco mantem o atual; ha botao "Remover" (envia `telefone: null`).

## Cargos: regras de protecao
- `editavel(c) = c.loja_id != null && !c.sistema`. So cargos PROPRIOS e nao-sistema podem ser
  renomeados/arquivados.
- Motoboy (`sistema = true`): fixo do sistema, nunca renomeado nem arquivado; badge "Fixo do sistema".
- Presets da plataforma (`loja_id = null`): catalogo compartilhado, somente leitura; badge "Padrao".
- Nao ha opcao de APAGAR: o backend so arquiva (`ativo = false`); a UI reflete isso.

## Notas / primitivos locais (candidatos a promover ao design system se reusados)
- `DIAS` / `OPCOES_DIA` (EscalaEditor.tsx): rotulos dos dias da semana (0=domingo).
- Textarea estilizado inline no PessoaDialog (observacoes): candidato a um primitivo `Textarea`.
- Select nativo estilizado inline no PessoaDialog (cargo): usa `<select>` cru porque o primitivo
  `Select` e generico em `T extends string` e aqui o valor e um UUID livre (ids dinamicos).
- dia_semana: 0=domingo ... 6=sabado (convencao do backend). Horarios sao hora de parede da loja.
