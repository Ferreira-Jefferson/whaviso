# API-clientes clientes

- **ID:** API-clientes  ·  **Área:** API  ·  **Onda:** 1
- **Modelo sugerido:** Sonnet  ·  **Status:** `A FAZER`
- **Reivindicado por:** (livre)

## Objetivo

Clientes por loja (telefone em hash + cifra) e seus endereços, que são a base do "repetir último
pedido / sugerir último endereço". "Pronto" observável: o painel lista e busca clientes da loja, abre a
ficha (nome, endereços, histórico resumido), cria/edita endereços e marca um como favorito/ativo; o
telefone aparece mascarado na tela e só é decifrado sob demanda para o dono/gerente; busca por telefone
funciona pelo hash, sem nunca guardar o número em claro. O endereço mais recente por `ultimo_uso_em` é
exposto como "último endereço" para o atendente e para a UI.

## Dependências

- `F4` api-core: registry, erros, config, logger/redaction, `shared/db`. Transitivas: `F0` (tabelas),
  `F1` (contratos), `F3` (escopo de loja).
- Helper `cifra` + `sha256Hex` do kernel (ver `API-numeros`, etapa 2): reusar; se ainda não existir, o
  primeiro dos dois módulos a precisar cria no kernel com commit próprio.
- Dependentes: `API-pedidos` (cliente e endereço do pedido), `ZAP-webhook` (resolve/cria cliente no
  inbound, escrita direta do `zap` já permitida pelo grant), `AT-motor-min`.

## Contratos e tabelas que toca

- **Dono de escrita pelo painel:** `clientes` e `enderecos` (`whaviso_api`: select/insert/update; sem
  DELETE, endereço some via `ativo = false`). O `zap` (inbound) e o `atendente` também escrevem
  `clientes`/`enderecos` por grant próprio; este módulo define as **regras** (normalização de telefone,
  forma do hash) num helper do kernel que os três usam, para não divergir.
- **Lê por read-model:** `pedidos` (somente `count`, `max(criado_em)`, `sum(total_centavos)` por
  `cliente_id`, para a ficha; leitura via `shared/db` documentada no MODULE.md, sem import de módulo).
- **Contratos Zod (F1):** `ClienteListaSaida` (telefone mascarado `+55 ** *****-1234`), `ClienteDetalheSaida`,
  `ClienteAtualizarEntrada` (só `nome`), `ClienteBuscaEntrada`, `EnderecoEntrada`, `EnderecoSaida`,
  `UltimoEnderecoSaida`, `TelefoneRevelarSaida` (E.164 em claro, só no endpoint de revelar).
- **Segurança de dados:** `telefone_hash = sha256(E.164 normalizado)` com formato hex 64 validado no
  banco; `telefone_cifrado` via cifra da aplicação. Endereço é dado operacional em claro, nunca logado.
- Evento de auditoria (sem PII): `cliente.atualizado`, `cliente.telefone_revelado` (registra **quem**
  e **qual cliente**, nunca o número), `endereco.alterado`.

## Arquivos (escopo de edição)

- `backend/apps/api/src/modules/clientes/**`
- `backend/apps/api/src/routes.ts` (1 linha, combinado)
- `backend/packages/shared/src/contracts/clientes*.ts`
- `backend/packages/shared/src/telefone/**` (normalização E.164 BR + hash + máscara, função pura, só se
  ainda não existir)

## Etapas

- [ ] 1. Scaffold `clientes` + MODULE.md (dono de `clientes`/`enderecos` no painel; leitura de `pedidos`)
  (commit: `chore(api-clientes): scaffold do modulo clientes`)
- [ ] 2. Helper de telefone no kernel: `normalizarTelefoneBR` (aceita `(11) 99999-9999`, `5511999999999`,
  `+55...`; rejeita inválido; sempre E.164), `hashTelefone` (sha256 hex), `mascararTelefone`; testes
  tabulares  (commit: `feat(shared): normalizacao, hash e mascara de telefone`)
- [ ] 3. Contratos Zod do módulo + regenerar `_generated`  (commit: `feat(contracts): contratos de clientes e enderecos`)
- [ ] 4. Repo SQL parametrizado de clientes: listar paginado por `loja_id` com busca por nome (ILIKE
  escapado) e por telefone (normaliza e compara hash); detalhe; atualizar nome  (commit: `feat(api-clientes): repositorio de clientes`)
- [ ] 5. `GET /clientes` (paginação por cursor, ordena por última atividade) e `GET /clientes/:id`
  (ficha com endereços ativos e agregados de `pedidos`)  (commit: `feat(api-clientes): listar e abrir ficha de cliente`)
- [ ] 6. `POST /clientes` (cadastro manual pelo painel, telefone vira hash + cifra, conflito em
  `(loja_id, telefone_hash)` devolve o existente com 409 e o id) e `PATCH /clientes/:id`
  (commit: `feat(api-clientes): cadastrar e editar cliente`)
- [ ] 7. `POST /clientes/:id/telefone/revelar` (somente dono e gerente): decifra e devolve o E.164, grava
  `cliente.telefone_revelado`, rate limit; resposta marcada `Cache-Control: no-store`
  (commit: `feat(api-clientes): revelar telefone sob demanda com auditoria`)
- [ ] 8. Repo e rotas de **endereços**: `GET /clientes/:id/enderecos`, `POST`, `PATCH /enderecos/:id`,
  `POST /enderecos/:id/desativar`; valida UF (2 letras), CEP (8 dígitos), `lat/lng` ambos ou nenhum
  (espelha os checks); coordenadas só editáveis pelo geocodificador (Onda 5), o painel manda texto
  (commit: `feat(api-clientes): enderecos do cliente`)
- [ ] 9. `GET /clientes/:id/ultimo-endereco`: endereço ativo com maior `ultimo_uso_em` (desempate
  `criado_em`); contrato estável também consumido pelo atendente  (commit: `feat(api-clientes): ultimo endereco para repetir pedido`)
- [ ] 10. Serviço interno `registrarUsoEndereco(endereco_id)` (atualiza `ultimo_uso_em`) exposto como
  função documentada no MODULE.md para o `pedidos` chamar **via SQL próprio**, não por import (ver Notas)
  (commit: `docs(api-clientes): contrato de uso do endereco`)
- [ ] 11. Auditoria sem PII  (commit: `feat(api-clientes): auditoria de clientes e enderecos`)
- [ ] 12. Testes de unidade e integração do módulo  (commit: `test(api-clientes): suite de clientes`)
- [ ] 13. Testes de segurança (SEC-001/002/023/024)  (commit: `test(api-clientes): sec de pii e isolamento`)

## Testes e segurança exigidos

**Unidade/integração:**
- Normalização: formatos válidos e inválidos, DDI, 9º dígito, espaços/pontuação; hash idêntico para
  formatos equivalentes.
- Dedupe: mesmo telefone em formatos diferentes cai no mesmo cliente; o mesmo telefone em **lojas
  diferentes** gera clientes independentes.
- Busca por telefone parcial não é suportada (hash): resposta clara; busca por nome escapa `%` e `_`.
- Mascaramento nas listas; revelar só para dono/gerente; atendente recebe 403.
- Último endereço: ordenação, só ativos, vazio quando não há.
- Endereço de cliente de outra loja devolve 404.

**SEC aplicáveis:**
- `SEC-001`: loja A não lê clientes/endereços da loja B.
- `SEC-002`: `loja_id`/`cliente_id` do corpo não mudam a loja efetiva; endereço só liga a cliente da
  mesma loja (a api valida, o FK sozinho não garante).
- `SEC-023`: `pg_dump` semeado não contém telefone em claro.
- `SEC-024`: telefone, nome e endereço não entram em log; redaction cobre `telefone`, `phone`, campos
  aninhados e o corpo de `/telefone/revelar`.
- `SEC-081`: Zod nos payloads. `SEC-101`: rate limit em `/telefone/revelar` e na busca.
- `SEC-020` (por analogia): nenhuma listagem devolve `telefone_cifrado` nem `telefone_hash`.

## Notas e decisões

- **Escritas concorrentes:** `zap` e `atendente` também criam cliente/endereço. A unicidade
  `(loja_id, telefone_hash)` do banco é a trava; o painel trata conflito como "já existe".
- **Telefone completo na tela:** decisão de privacidade (LGPD): padrão mascarado; revelar é ação
  explícita e auditada. Atendente de salão não vê o número completo.
- **"Repetir último":** este módulo só expõe a leitura do último endereço e o contrato de `ultimo_uso_em`.
  Quem atualiza o carimbo ao confirmar um pedido é o `API-pedidos` (e o atendente), por SQL próprio sobre
  `enderecos` (permitido pelo grant), sem importar este módulo.
- **Sem exclusão de cliente:** para atender pedido de apagar dados (LGPD) fica registrado como
  melhoria futura (anonimização por UPDATE), fora desta onda.
- **Geocodificação:** `lat/lng` ficam NULL até a Onda 5; este módulo não chama mapas.
