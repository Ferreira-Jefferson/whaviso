# Módulo conta

Conta (tenant), membros e papéis, convite e aceite.

- **Dono de escrita:** `contas`, `membros`, `convites` (migration 0013). **Leitura:** `lojas` (pertencimento da loja do convite).
- **Rotas** (`/v1/conta/*`): `POST /` (bootstrap idempotente), `GET|PATCH /`, `GET /membros`, `PATCH /membros/:id`,
  `POST|GET /convites`, `POST /convites/:id/revogar`, `POST /convites/aceitar`.
- **Auth:** só `app.autenticar`; a conta e o papel vêm de `membros` pelo `sub` do JWT (`contexto.ts`), nunca do corpo.
  Não usa `escopoLoja` porque conta recém-criada ainda não tem loja.
- **Papéis:** dono = tudo; gerente lista/gere membros e convites só dentro do seu alcance de lojas, nunca toca
  em dono; atendente sem acesso. Ninguém altera o próprio papel; a conta mantém ao menos um dono.
- **Convite:** token de 32 bytes, só o sha256 no banco, validade de 7 dias, `link` devolvido uma única vez.
  Aceite atômico (`UPDATE ... WHERE aceito_em IS NULL`); sem DELETE (revogar = `revogado_em`).
- **Auditoria** (`eventos`, sem PII): `conta.criada`, `membro.convidado`, `membro.aceito`, `membro.papel_alterado`, `membro.removido`.
- **Testes:** `conta.test.ts` e `convites.test.ts` (banco real, role `whaviso_api`).
