# acessos (frontend)

## Proposito
Tela "Acessos" do console: grade permissao x papel, em dois grupos (Console e Loja). O admin liga e
desliga celulas e salva. Espelha `backend/apps/api/src/modules/acessos`; o servidor decide, a tela
le e edita a mesma grade.

## Regras de UI
- Papel fixo (`admin` no console, `dono` na loja) e permissao travada (`acessos:gerir`) aparecem
  sempre ligados/desligados e desabilitados: nao sao editaveis.
- Alteracoes ficam em rascunho local; "Salvar" envia cada celula alterada (PATCH `/acessos/grade`).
- Rotas de operador (`semLoja`), contratos Zod proprios em `schemas.ts`, corpo sem `loja_id`.
- 403 = quem entrou nao e admin (a tela mostra acesso restrito).
