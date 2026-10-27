# lojas

## Proposito
Perfil da loja dentro da conta: criar/editar loja, branding (cores e logo), endereco, horarios por dia
da semana e area de atendimento (raio ou bairros). Fonte: `historias/backend-api/lojas.md`.

## Entry points
- `index.ts`: `lojasRoutes` (registrado em `src/routes.ts`) e `criarLojasRoutes({ hostsLogoExtras })`.
- Rotas (`/v1/lojas`): `GET /` (`?incluir_inativas=true`, so dono), `GET /:id`, `POST /` (dono),
  `PATCH /:id` (dono, gerente), `PATCH /:id/branding` (dono, gerente), `POST /:id/desativar` e
  `POST /:id/reativar` (dono).

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao), `@whaviso/shared/datas` (TZ), `@whaviso/shared/contracts`.
- `shared/tenant` via `app.escopoLoja` (lista, detalhe, PATCH); `shared/http_errors`.

## Tabelas
- dono de: `lojas` (insert/update; desativar = `ativo=false`, sem DELETE).
- le de: `numeros_whatsapp` (so contagem total/conectados, nunca `token_cifrado`),
  `membros` (so `contasDoDono`: o kernel exclui lojas inativas e conta sem loja, entao criar,
  desativar e reativar resolvem a conta pelo vinculo de dono "todas as lojas").
- escreve auditoria em `eventos` (`loja.criada|atualizada|desativada|reativada`, detalhes = nomes de campos, sem PII).

## Contratos
`schemas.ts`: `LojaCriarEntrada`, `LojaAtualizarEntrada`, `LojaBrandingEntrada`, `LojaSaida`
(mesma forma na lista e no detalhe), `Cores`, `Horarios`, `Endereco`, `AreaEntrega`. Todo jsonb e
lido/gravado por estes schemas estritos. `aberta_agora` e calculado no servidor (`horarios.ts`).

## Decisoes
- Logo: so `logo_url` https de host allowlisted (host do `SUPABASE_URL` + `hostsLogoExtras`); upload fica futuro.
- Corpo com `id`/`conta_id`/chave extra e rejeitado (400, strictObject), nunca aplicado.
- Fora do escopo = 404 (nao confirma existencia).
