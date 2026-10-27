# Segurança do whaviso: modelo de ameaças e catálogo de testes

> **Status:** documento vivo. Nasce com o rebuild e é atualizado a cada feature nova.
> **Data:** 2026-10-27. Produto: automação de pedidos de restaurante por WhatsApp, multi-tenant.
> **Relacionado:** [ARQUITETURA.md](ARQUITETURA.md) (API como única porta, roles de serviço),
> [BANCO.md](BANCO.md) (RLS, grants por coluna, `credenciais_llm`).

## 1. Princípio

Segurança é **requisito de arquitetura**, não etapa final, e é **verificada por código, não por
memória**: toda ameaça listada aqui vira um teste automatizado com id, verde ou vermelho no CI. Três
pilares já desenhados no banco sustentam o resto: **API é a única porta** (o front nunca fala com o
banco), **RLS deny-all** para anon/authenticated, e **privilégio mínimo por role e por coluna**.

O ativo mais caro é a **chave de LLM da loja**: se vazar, gera custo real e imediato para o cliente e
para a Whaviso. Ela recebe o tratamento mais apertado do sistema e a maior cobertura de teste.

## 2. Ativos a proteger (em ordem de dano se vazar)

| Ativo | Onde vive | Dano se vazar |
|---|---|---|
| **Chave de LLM da loja** | `credenciais_llm.chave_cifrada` | custo financeiro direto, por loja |
| **Token da Meta** | `numeros_whatsapp.token_cifrado` | sequestro do WhatsApp da loja |
| **Pix da loja** | `loja_pix` (hash + cifra) | desvio de recebimento |
| **Telefone + PII do cliente final** | `clientes`, `enderecos`, `mensagens` | privacidade, LGPD |
| **Dados de motoboy / prospecto** | `motoboys`, `prospectos` | privacidade de terceiros |
| **Faturamento da plataforma** | `assinaturas`, `faturas` | dado comercial da Whaviso |
| **Sessão / identidade** | JWT do Supabase Auth | personificação de usuário |

**Regra transversal:** telefone, token, chave e Pix só entram no banco como **sha256** (para busca) e
**cifra da aplicação** (para uso); texto claro nunca é persistido, logado nem devolvido ao cliente.

## 3. Atacantes considerados

1. **Anônimo externo** com a anon key (ela é pública no bundle do front).
2. **Cliente final no WhatsApp**: controla o texto/áudio que chega ao `atendente` (prompt injection).
3. **Membro de uma loja** tentando ler ou escrever dados de **outra loja** (IDOR por `loja_id`).
4. **Membro** tentando **escalar** para operador da plataforma.
5. **Operador da plataforma** tentando ler **conteúdo** de loja (conversas, pedidos), além das métricas.
6. **Provedor externo** (LLM, mapas) comprometido ou induzido a SSRF.
7. **Vazamento passivo**: log, dump de banco, bundle do front, mensagem de erro.

## 4. Catálogo de testes automatizados

Cada item é um teste com id estável (`SEC-###`). "Verde" descreve o critério de aprovação. A suíte
vive em `backend/**/test/security/` (vitest) mais os scripts de banco; roda no gate do CI.

### A. Isolamento multi-tenant
- **SEC-001** Loja A não lê dado de Loja B por nenhum endpoint da api. *Verde:* request autenticada
  como membro de A pedindo recurso de B retorna 403/404, nunca o dado.
- **SEC-002** `loja_id` do corpo/token nunca sobrepõe o escopo resolvido pelo kernel (sem mass
  assignment de tenant). *Verde:* forjar `loja_id` no payload não muda a loja efetiva.
- **SEC-003** Operador da plataforma não acessa conteúdo de loja (conversas, pedidos, mensagens).
  *Verde:* endpoints de conteúdo negam escopo de operador; só métricas/billing passam.

### B. RLS deny-all
- **SEC-010** anon e authenticated não leem nenhuma tabela de `public` via PostgREST/supabase-js.
  *Verde:* select direto com a anon/user key retorna vazio ou erro de permissão em todas as tabelas.
- **SEC-011** Cobertura de RLS: toda tabela de `public` tem RLS habilitado. *Verde:*
  `scripts/check_rls_coverage.sh` passa (já no CI).

### C. Segredos (chaves e tokens)
- **SEC-020** A chave de LLM nunca aparece em nenhuma resposta de endpoint. *Verde:* varredura das
  respostas da api não encontra o texto claro; a tela de config só recebe provedor + `ultimos4`.
- **SEC-021** `whaviso_api` não consegue `SELECT` de `credenciais_llm.chave_cifrada`. *Verde:*
  `SET ROLE whaviso_api; select chave_cifrada ...` falha por privilégio (grant por coluna).
- **SEC-022** Só `whaviso_atendente` lê `chave_cifrada`; `whaviso_zap` não tem acesso. *Verde:*
  teste com `SET ROLE` confirma a matriz.
- **SEC-023** Cifrado em repouso: um `pg_dump` não contém o texto claro de chave/token/Pix. *Verde:*
  dump de um banco semeado com segredo conhecido não casa com o texto claro.
- **SEC-024** A chave nunca entra em log. *Verde:* a redaction cobre `chave`, `token`, `authorization`
  e campos aninhados; teste injeta segredo e confirma mascaramento na saída de log.
- **SEC-025** A anon key / service_role não vazam no bundle do front. *Verde:* grep no build não acha
  a service_role; só a anon key esperada está presente.
- **SEC-026** A chave da loja nunca é colocada no **prompt** enviado ao provedor (vai no header de
  auth, não no corpo). *Verde:* o `ClienteLLM` monta a request sem o segredo no texto do prompt.

### D. Privilégio mínimo dos roles
- **SEC-030** `whaviso_api` não tem DELETE em tabela de negócio/auditoria (exceção: `templates`).
  *Verde:* `SET ROLE` + delete falha nas tabelas de negócio e passa só em `templates`.
- **SEC-031** `whaviso_zap` só escreve as colunas do outbox que lhe cabem (grant por coluna em
  `envios` e no estado de saúde de `numeros_whatsapp`). *Verde:* update fora dessas colunas falha.
- **SEC-032** `whaviso_atendente` não toca billing/plataforma nem credencial da Meta. *Verde:*
  select/insert/update nessas tabelas falha para o role do atendente.
- **SEC-033** Trilhas append-only (`eventos`, `eventos_auth`, `*_lancamentos`, `uso_llm`) rejeitam
  UPDATE e não têm grant de DELETE. *Verde:* update dispara exceção; delete falha por privilégio.

### E. Autenticação e sessão
- **SEC-040** JWT validado localmente por JWKS; token inválido/expirado/assinatura trocada é rejeitado.
- **SEC-041** Membro não vira operador: não há endpoint nem payload que promova `membros` a
  `operadores`. *Verde:* tentativa de autoatribuição de papel falha.
- **SEC-042** Signup só onde deve: a superfície de criação de conta está fechada para abuso de spam.

### F. Webhook do WhatsApp
- **SEC-050** Assinatura do webhook da Meta é verificada; payload sem assinatura válida é descartado.
- **SEC-051** Idempotência por `wamid` (INSERT ON CONFLICT DO NOTHING); replay do mesmo evento não
  duplica mensagem nem pedido.

### G. Prompt injection e segurança da LLM
- **SEC-060** Uma mensagem do cliente não consegue fazer o `atendente` revelar a chave de LLM, dados
  de outra loja, nem o conteúdo do system prompt. *Verde:* bateria de prompts adversariais (red team)
  não extrai segredo nem cruza tenant.
- **SEC-061** A saída do modelo é tratada como **dados**, nunca como comando: não executa ação
  (confirmar pedido, mudar preço, enviar Pix) sem passar pelas regras determinísticas do fluxo.
- **SEC-062** O contexto dado ao modelo é escopado à loja: o RAG e o cardápio no prompt são só da
  loja da conversa. *Verde:* teste confirma que nenhum documento de outra loja entra no contexto.

### H. SSRF e provedores externos
- **SEC-070** Chamadas a LLM/mapas vão só para hosts allowlisted; sem seguir redirect para rede
  interna. *Verde:* URL de provedor é fixa/validada; teste de redirect para `169.254/localhost` falha.

### I. Injeção e entrada
- **SEC-080** Zero SQL por interpolação de string: toda query é parametrizada. *Verde:* lint/busca não
  acha concatenação em query; teste com entrada maliciosa não altera a query.
- **SEC-081** Validação Zod na borda da api rejeita payload fora do contrato (tipos, tamanho, enum).

### J. Transporte e cabeçalhos
- **SEC-090** HSTS, CSP e cabeçalhos de segurança presentes; CORS restrito ao `APP_URL`. *Verde:*
  teste de resposta confere os headers e nega origem estranha.

### K. Abuso e custo
- **SEC-100** Alerta de consumo anômalo de LLM por loja (pico de `uso_llm`) dispara investigação.
- **SEC-101** Rate limit nos endpoints sensíveis (login, config de chave, webhook) contra força bruta.

## 5. Como automatizar

- **Suíte `security/` no CI:** os SEC-### viram testes vitest que rodam no mesmo gate de
  lint/typecheck/test. PR não entra com um SEC vermelho.
- **Banco por `SET ROLE`:** a matriz de privilégio (categorias C e D) é testada conectando como cada
  role de serviço e afirmando o que passa e o que falha, mais `check_rls_coverage.sh` (já existe).
- **Teste de dump e de bundle:** SEC-023 e SEC-025 rodam `pg_dump`/`npm run build` e fazem grep do
  segredo conhecido; falham se o texto claro aparecer.
- **Red team por subagents especializados:** um loop periódico (um subagent dedicado por categoria,
  ex.: tenant-isolation, segredos, prompt-injection) tenta **quebrar** o catálogo contra o app rodando
  e abre um relatório por brecha encontrada, no mesmo espírito do chrome-qa-loop. O humano revisa; o
  que vira risco real vira um novo SEC-### com teste.

## 6. Checklist vivo (ameaça → teste → status)

| Ameaça | Testes | Status |
|---|---|---|
| Vazamento da chave de LLM | SEC-020..026, SEC-060 | a implementar |
| Cruzamento entre lojas (IDOR) | SEC-001..003, SEC-062 | a implementar |
| Bypass de RLS pela anon key | SEC-010, SEC-011 | SEC-011 verde (script) |
| Escalonamento de privilégio | SEC-030..033, SEC-041 | a implementar |
| Prompt injection | SEC-060..062 | a implementar |
| Replay/forja de webhook | SEC-050, SEC-051 | a implementar |
| Vazamento passivo (log/dump/bundle) | SEC-023..025 | a implementar |

## 7. Processo

Toda feature nova **atualiza este documento antes de entrar**: acrescenta os ativos que toca, as
ameaças que abre e os SEC-### correspondentes, e só faz merge com esses testes verdes. O catálogo é a
fonte da verdade do que "estar seguro" significa no whaviso; o CI é quem prova.
