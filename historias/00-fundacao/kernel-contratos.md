# F1 kernel-contratos

- **ID:** F1  ·  **Área:** F  ·  **Onda:** 0
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Entregar o kernel de contratos em `packages/shared`: os schemas Zod como **fonte única** de todo
payload de borda, o `NodeContract` (interface dos plugins do grafo de conversa), os contratos de
eventos (`eventos` e NOTIFY de realtime) e o codegen `gen_contracts`, que emite
`frontend/src/shared/contracts/_generated/` (commitado) mais um hook de CI que falha quando o gerado
está fora de sincronia. "Pronto" observável: editar um schema em `packages/shared`, rodar
`npm run gen:contracts` e ver o diff aparecer no front; `npm run check:contracts` verde com o gerado em
dia e vermelho com ele defasado; o front importa só o gerado local, nunca `@whaviso/shared`.

## Dependências

- `F0`: os enums e formas dos contratos espelham o baseline (`papel_membro`, `status_pedido`,
  `tipo_grupo`, `status_envio`, `status_numero`...). Concluído.

## Contratos e tabelas que toca

Nenhuma tabela é escrita. Os contratos refletem o schema de [BANCO.md](../../docs/pivot/BANCO.md) por
**DTO de borda**, nunca por linha crua. Este módulo cria o esqueleto e os contratos transversais; cada
módulo `API-*` acrescenta depois os seus DTOs no mesmo pacote (coordenado, ver Notas).

- **Enums de domínio** (espelham os enums do Postgres): `papel_membro`, `status_numero`,
  `status_pedido`, `tipo_grupo`, `status_envio`, demais do baseline.
- **Primitivos comuns:** `Centavos` (int não negativo), `UuidSchema`, `TelefoneE164` (entrada; nunca
  devolvido), `DataHoraIso` (UTC), `Paginacao`/`Cursor`, `ErroApi` (envelope `{ error: { code, message } }`).
- **`NodeContract`:** forma que todo node do grafo implementa (id/tipo, schema de config Zod, entrada,
  saída `{ proximo, mensagens, efeitos }`, declaração de se usa LLM). Só o **contrato**; os nodes
  concretos moram em `apps/atendente/src/nodes/<tipo>/` (AT-motor-min).
- **Eventos:** envelope `EventoDominio` (`tipo`, `loja_id`, `ocorrido_em`, `payload` sem PII) e o
  contrato de **canal realtime** (`pedido.atualizado`, `conversa.mensagem`, `conversa.handoff`...),
  consumido por F5 e F6.
- **Convenções:** dinheiro em centavos; datas de negócio em America/Sao_Paulo (conversão fica em
  `shared/datas`), no contrato trafega ISO UTC.

## Arquivos (escopo de edição)

- `backend/packages/shared/src/contracts/**` (reorganizar: remover os contratos de cobrança legados
  `entidades.ts`, `payloads.ts`, `pix.ts`, `render.ts`, `linguagem.ts` quando nada novo os usar; ver Notas)
- `backend/packages/shared/package.json` (export `./contracts`, scripts do codegen)
- `backend/scripts/gen_contracts/**` (script do codegen) e `backend/scripts/check_contracts.sh`
- `frontend/src/shared/contracts/_generated/**` (saída do codegen; **nunca editar à mão**)
- `frontend/package.json` (apenas o script `check:contracts`, se necessário)
- `.github/workflows/**` (apenas o passo de sincronia de contratos no gate)

## Etapas

- [ ] 1. Inventário: listar o que existe em `packages/shared/src/contracts` (legado de cobrança) e
  decidir o que sai, o que fica (`render`/`datas`/`pix` só se reaproveitáveis) e o que vira novo.
  Registrar em Notas.  (commit: `chore(shared): inventario dos contratos legados de cobranca`)
- [ ] 2. Primitivos comuns (`Centavos`, `UuidSchema`, `DataHoraIso`, `Paginacao`, `ErroApi`) com testes.
  (commit: `feat(shared): primitivos de contrato (centavos, uuid, paginacao, erro)`)
- [ ] 3. Enums de domínio espelhando o baseline (um arquivo `enums.ts`), com teste de paridade contra
  `pg_enum` do `whaviso_dev` (garante que o enum Zod não diverge do banco).
  (commit: `feat(shared): enums de dominio do restaurante com teste de paridade`)
- [ ] 4. Convenção de DTO: um arquivo por agregado (`contas`, `lojas`, `pedidos`...) vazio-esqueleto +
  `index.ts` com barrel; o corpo de cada um é preenchido pelo módulo `API-*` dono. Documentar em
  `contracts/README` curto (convenção de nome `XxxDto`, `CriarXxxInput`, `AtualizarXxxInput`).
  (commit: `feat(shared): esqueleto de contratos por agregado`)
- [ ] 5. `NodeContract` (tipos + Zod de config/saída) e `NodeRegistry` (tipo do registry, sem
  implementação). Teste de tipo: um node de exemplo no teste satisfaz o contrato.
  (commit: `feat(shared): NodeContract e tipo do registry de nodes`)
- [ ] 6. Contratos de evento: `EventoDominio` e `CanalRealtime` com mapa tipo->payload. Teste: payload
  com campo de PII (telefone, token) é rejeitado pelo schema (strict).
  (commit: `feat(shared): contratos de evento e canais de realtime`)
- [ ] 7. Codegen `gen_contracts`: percorre o barrel `contracts/index.ts`, emite para
  `frontend/src/shared/contracts/_generated/` os schemas Zod como código TypeScript autocontido (sem
  import de `@whaviso/shared`), tipos inferidos, cabeçalho "GERADO, NAO EDITAR" e um `manifest.json`
  com hash do conteúdo de origem. Saída determinística (ordem estável, sem timestamp).
  (commit: `feat(scripts): gen_contracts emite os contratos para o frontend`)
- [ ] 8. Teste do codegen: rodar duas vezes gera saída idêntica; o gerado compila isolado com o
  `tsconfig` do front (typecheck do front passa importando só o `_generated`).
  (commit: `test(scripts): determinismo e typecheck do gerado`)
- [ ] 9. `check_contracts`: regenera em diretório temporário e compara com o commitado; falha com
  mensagem "rode npm run gen:contracts". Scripts `gen:contracts` e `check:contracts` na raiz do backend.
  (commit: `feat(scripts): check_contracts detecta gerado fora de sincronia`)
- [ ] 10. Hook de CI: passo `check:contracts` no gate, antes do build do front.
  (commit: `ci: gate de sincronia dos contratos gerados`)
- [ ] 11. Regra de lint no front que proíbe `import ... from '@whaviso/shared'` (preserva a
  independência de deploy). (commit: `chore(frontend): lint barra importar @whaviso/shared`)
- [ ] 12. Rodar `npm run lint`, `typecheck` e `test` no backend e `lint`/`typecheck` no front, verdes.
- [ ] 13. Atualizar `backend/AGENTS.md` (seção de contratos) com o fluxo "editar -> gen -> commitar".
  (commit: `docs(backend): fluxo de contratos gerados`)

## Testes e segurança exigidos

- Unidade: primitivos (rejeita centavos negativos/float, uuid inválido), enums (paridade com o banco),
  `NodeContract`, eventos (strict, sem PII), codegen (determinismo + compila isolado), `check_contracts`
  (verde em dia, vermelho defasado).
- **SEC-081** (base): todos os schemas de entrada são `strict` e com limites de tamanho/enum; teste
  genérico percorre o barrel e falha se um schema de input aceitar chave desconhecida.
- **SEC-002** (base): nenhum `CriarXxxInput` expõe `loja_id`/`conta_id` como campo aceito do cliente;
  teste varre os schemas de input e falha se encontrar. O escopo vem do kernel (F3).
- **SEC-020/024** (base): contratos de resposta nunca contêm campo de segredo (`chave`, `token`,
  `chave_cifrada`); teste de varredura por nome de campo no barrel de DTOs de saída.

## Notas e decisões

- Há contratos legados de cobrança em `packages/shared/src/contracts` e `.../datas`. Decisão: remover o
  que é domínio de cobrança; manter `datas` (America/Sao_Paulo) por ser kernel útil. `pix.ts` só sobrevive
  se `API-pagamentos` reutilizar o BR Code; caso contrário sai (registrar a decisão na etapa 1).
- **Coordenação de escrita no pacote:** F1 cria só o esqueleto e os transversais. Cada `API-*` edita
  apenas o arquivo do seu agregado em `contracts/` (um arquivo por agregado evita conflito) e roda o
  codegen; isso é combinado e está declarado nos escopos deles.
- Codegen implementado em TS com `zod` (JSON Schema do Zod 4 -> código) ou geração textual por
  re-serialização; a escolha é do executor, desde que o gerado seja autocontido e determinístico.
  Preferir a via que preserve refinamentos (`.max`, `.int`), pois o front reusa a validação.
- O `_generated` é commitado de propósito: em runtime nada acopla, e o front continua deployável sozinho.
