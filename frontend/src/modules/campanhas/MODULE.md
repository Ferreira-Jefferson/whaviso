# campanhas (frontend)

## Proposito
Campanhas de WhatsApp da loja: lista, criacao de rascunho (nome, template, numero de origem,
segmento, variaveis fixas), previa do publico excluindo opt-out, disparo e acompanhamento da
entrega. Rota `/campanhas`.

## Entry points
- `index.ts`: export default da pagina (`lazy(() => import('@/modules/campanhas'))`).

## Dados
- `GET|POST /v1/campanhas`, `GET /v1/campanhas/:id`, `GET /v1/campanhas/:id/destinatarios`,
  `POST /v1/campanhas/:id/disparar`, `POST /v1/campanhas/:id/cancelar`; `GET /v1/numeros` (origem).
- Contratos: `@/shared/contracts/_generated/campanhas` e `numeros_whatsapp`. Cache: raiz `['campanhas']`.

## Regras
- Fluxo: criar (rascunho) -> detalhe mostra a previa (`/destinatarios`, sempre fresca) -> disparar com
  confirmacao -> acompanhar entrega (polling de 15 s enquanto `enfileirada`) -> cancelar pendentes.
- Opt-out e primeira classe: nao e filtro opcional; o aviso fica fixo no formulario e a contagem da previa ja vem sem opt-out.
- Sem telefone nem hash na tela (o contrato nao traz): o publico e so contagem.
- So template aprovado: nao ha campo de texto livre.
- Permissao `loja:gerir` (dono/gerente); sem permissao a tela cai no estado de erro.

## Lacunas de API
- Nao ha endpoint para listar templates aprovados da loja: o formulario pede a `template_chave` em texto.
- Nao ha como editar nem excluir rascunho; `GET /numeros` nao devolve o numero legivel (so `phone_number_id`).
