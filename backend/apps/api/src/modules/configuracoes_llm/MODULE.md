# configuracoes_llm

## Proposito
Area de BYO key da loja: o dono cadastra a propria credencial de LLM (provedor, chave, modelo
preferido), troca (rotate) quando quiser e ve so o ESTADO ("configurada, termina em 1234,
validada em ..."). Expoe tambem o consumo (`uso_llm`) para o painel de gasto. O segredo mais
caro do banco: tratamento mais apertado do sistema.

## Regras de ouro (nao quebrar)
- NUNCA ler a chave de volta: a api e write-only sobre `chave_cifrada`. O grant por coluna barra
  o SELECT (SEC-021); o repo projeta SO metadado (lista explicita, nunca `select *`).
- NUNCA logar a chave (SEC-024): nenhum handler loga o corpo; a redaction mascara `chave`,
  `api_key`, `authorization`, `chave_cifrada` (inclusive aninhado). Log so com provedor/ultimos4.
- Chave write-only no contrato: so entra em schema de ENTRADA; nenhum schema de SAIDA a carrega.
- Validar ANTES de cifrar: so grava se a chamada de teste ao provedor passar. Chave invalida =>
  422 (nada gravado); provedor indisponivel => 502 (nada gravado, retry seguro).
- So o papel `dono` escreve; `atendente` nao alcanca a area (leitura = `loja:gerir`).
- A api NAO decifra: `cifra.ts` so expoe `cifrar`. Quem decifra e o worker atendente (SEC-022).

## Entry points
- `index.ts` -> `configuracoesLlmRoutes` (plugin Fastify registrado em `src/routes.ts`, prefixo `llm`)

## Especialistas consumidos
- `@whaviso/shared/db` (consultar/sql/comTransacao: unica via de dados)
- `@whaviso/shared/cifra` (kernel AES-256-GCM; `cifra.ts` adapta so o `cifrar`)
- `@whaviso/shared/contracts/configuracoes_llm` (contratos de borda; enum `provedorLlm` da barra geral)
- `shared/http_errors` (envelope de erro)
- `shared/auth` + `shared/tenant` (preHandlers `autenticar`/`escopoLoja`/`exigirPapel`/`exigirPermissao`)

## Tabelas
- dono de ESCRITA: `credenciais_llm` (insert/update de `chave_cifrada`+metadado; sem SELECT da
  chave, sem DELETE; "remover" = `PATCH ativo=false`). Unique `(loja_id)`: uma credencial por loja.
- le de: `uso_llm` (read-model de consumo; quem grava e o atendente)
- `eventos`: append de auditoria sem a chave (`credencial_llm.definida`)

## Segredo (chave de LLM)
- `chave_cifrada` WRITE-ONLY na api. Cifra (`cifra.ts`) delega ao kernel `@whaviso/shared/cifra`,
  com master key PROPRIA `LLM_MASTER_KEY` (separacao de dominio por chave, distinta da `MASTER_KEY`
  do token da Meta). O worker atendente (role `whaviso_atendente`) decifra com a mesma master key.
- Validadores (`provedores/`): host FIXO allowlisted (`openrouter.ai`, `api.anthropic.com`),
  `redirect: 'error'`, timeout curto, chave so no header de auth do provedor, nunca no corpo/URL
  (SEC-070, SEC-026). `outro` nao tem host allowlisted => sem validacao => escrita recusada (422).

## Contratos
- `@whaviso/shared/contracts/configuracoes_llm`: `CredencialLlmEntrada` (chave write-only),
  `CredencialLlmPatch`, `CredencialLlmTestarEntrada`, `CredencialLlmEstado` (sem chave),
  `CredencialLlmTesteSaida`, `UsoLlmResumo`, `resultadoValidacaoLlm`.

## Rotas (`/v1/llm`)
- `GET /credencial` estado (dono/gerente) · `PUT /credencial` set/rotate (dono; rate limit)
- `PATCH /credencial` ativar/desativar/modelo (dono) · `POST /credencial/testar` (dono; rate limit)
- `GET /uso` resumo de consumo (dono/gerente)

## Config de producao
- `LLM_MASTER_KEY` (min 32 chars) lida de `process.env` em `config.ts` (propor promover ao
  `envApiSchema`). Validadores de producao usam o `fetch` global.
