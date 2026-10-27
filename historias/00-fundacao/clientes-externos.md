# F2 clientes-externos

- **ID:** F2  ·  **Área:** F  ·  **Onda:** 0
- **Modelo sugerido:** Sonnet  ·  **Status:** `FEITO (aguarda revisao/commit)`
- **Reivindicado por:** F2-agent

## Objetivo

Definir, como contratos tipados e com **stubs funcionais**, as três fronteiras de provedor externo:
`ClienteWhats` (transporte WhatsApp, usado pelo `zap`), `ClienteLLM` (modelo de linguagem, usado pelo
`atendente`) e `ClienteMapas` (geocode, matriz, rota, usado pela `api`). "Pronto" observável: cada
interface existe com seus tipos de entrada/saída em Zod, tem um stub determinístico (e um fake
configurável para testes), e os módulos futuros dependem **só da interface**. Trocar de provedor depois
(Meta versão X, OpenRouter para Anthropic, Nominatim para Google) é mudança pontual numa implementação,
sem tocar consumidor. Nenhuma implementação real de provedor entra aqui (ZAP-meta, AT-llm e
API-roteiriza implementam).

## Dependências

- `F1`: tipos de entrada/saída são contratos Zod no kernel (mesma convenção, mesmo barrel).

## Contratos e tabelas que toca

Nenhuma tabela. Contratos (em `packages/shared/src/clientes/`):

- **`ClienteWhats`** (multi-WABA, credencial por número): `enviarTexto`, `enviarTemplate`,
  `enviarInterativo` (botões/lista), `enviarMidia`, `baixarMidia(mediaId)`, `marcarLida`,
  `verificarAssinatura(rawBody, header)` (webhook). Entrada leva `numero` (phone_number_id + referência
  à credencial resolvida pelo chamador), saída `{ wamid }` ou erro tipado (`JanelaExpirada`,
  `TemplateNaoAprovado`, `RateLimit`, `Transitorio`, `Permanente`). O erro tipado é o que permite o
  outbox decidir retry (ZAP-enviar).
- **`ClienteLLM`**: `completar({ mensagens, ferramentas?, formatoSaida? , modelo? })`,
  `transcrever(audio)` (STT), `descreverImagem(imagem)` (para importar cardápio), `embutir(textos)`
  (embeddings p/ RAG). A credencial **não** entra no corpo do prompt: a interface recebe uma
  `CredencialResolvida` opaca que a implementação usa só no header de auth (SEC-026). Retorna uso
  (`tokens_in`, `tokens_out`, `custo_estimado_centavos`) para `uso_llm`.
- **`ClienteMapas`**: `geocodificar(endereco) -> {lat,lng,precisao}`, `matriz(origens, destinos)`,
  `rota(paradas)`. Provedor-padrão gratuito (Nominatim + OSRM/ORS), Google opcional.
- **Erros e utilitários comuns:** `ErroProvedor` (hierarquia), `Resultado<T,E>`, política de timeout e
  retry como dado (não espalhada), allowlist de hosts por cliente.

## Arquivos (escopo de edição)

- `backend/packages/shared/src/clientes/**` (interfaces, tipos Zod, erros, fakes de teste)
- `backend/packages/shared/package.json` (export `./clientes`)
- `backend/apps/zap/src/shared/whats_stub/**` (stub de `ClienteWhats`)
- `backend/apps/api/src/shared/mapas_client/**` (stub de `ClienteMapas`; só interface+stub, a real é API-roteiriza)
- `backend/apps/atendente/src/shared/llm_client/stub/**` (stub de `ClienteLLM`; cria o diretório do app
  `atendente` só com este arquivo se o app ainda não existir; scaffold completo é de AT-motor-min)
- `frontend/**` **não** é tocado (cliente externo é só backend).

## Etapas

- [x] 1. Erros e utilitários comuns: `ErroProvedor` (e subtipos), `Resultado`, `PoliticaRetry` como dado,
  tipo `HostPermitido`. Testes de unidade.
  (commit: `feat(shared): erros tipados e politica de retry para clientes externos`)
- [x] 2. Interface `ClienteWhats` + Zod de entrada/saída + erros específicos (`JanelaExpirada`...).
  Documentar a regra de janela 24h como **responsabilidade do chamador**: o cliente apenas reporta o erro.
  (commit: `feat(shared): interface ClienteWhats`)
- [x] 3. Fake `ClienteWhats` em memória (grava chamadas, permite programar falha por chamada) em
  `packages/shared/src/clientes/fakes`, para testes de ZAP-enviar/ZAP-webhook.
  (commit: `feat(shared): fake de ClienteWhats para testes`)
- [x] 4. Stub de `ClienteWhats` em `apps/zap/src/shared/whats_stub` (responde `wamid` sintético, loga
  sem dado sensível). (commit: `feat(zap): stub de ClienteWhats`)
- [x] 5. Interface `ClienteLLM` + `CredencialResolvida` opaca + tipo de uso + fake determinístico.
  (commit: `feat(shared): interface ClienteLLM e fake`)
- [x] 6. Stub de `ClienteLLM` em `apps/atendente/src/shared/llm_client/stub` (resposta enlatada por
  chave de cenário). (commit: `feat(atendente): stub de ClienteLLM`)
- [x] 7. Interface `ClienteMapas` + fake (distância euclidiana sobre lat/lng fixas).
  (commit: `feat(shared): interface ClienteMapas e fake`)
- [x] 8. Stub de `ClienteMapas` em `apps/api/src/shared/mapas_client`.
  (commit: `feat(api): stub de ClienteMapas`)
- [x] 9. Allowlist de host + proteção de redirect: helper `fetchSeguro(host, opts)` (HTTPS only, sem
  seguir redirect para rede privada/localhost/169.254) usado por todas as implementações futuras.
  (commit: `feat(shared): fetchSeguro com allowlist e bloqueio de SSRF`)
- [x] 10. Teste de contrato reutilizável (`contratoClienteWhats(factory)` etc.): suíte parametrizável
  que stub, fake e a implementação real (nos módulos futuros) devem passar.
  (commit: `test(shared): suites de contrato para os clientes externos`)
- [x] 11. Regra de lint: nenhum módulo importa SDK/HTTP de provedor diretamente; só a interface.
  (commit: `chore(backend): lint barra uso direto de provedor fora do cliente`)
- [x] 12. `npm run lint`, `typecheck`, `test` verdes.

## Testes e segurança exigidos

- Unidade: erros tipados, fakes (programar falha, gravar chamadas), suítes de contrato passando para
  stub e fake de cada cliente.
- **SEC-070**: `fetchSeguro` rejeita host fora da allowlist, HTTP simples e redirect para
  `127.0.0.1`, `localhost`, `169.254.*`, `10.*`, `::1`. Teste com servidor local que redireciona.
- **SEC-026**: teste do `ClienteLLM` (fake e contrato) confirma que a credencial não aparece no corpo
  nem nas `mensagens` da requisição montada, só no header de auth.
- **SEC-024**: stubs não logam telefone, token nem chave (verificar com o logger de F4 quando existir;
  aqui, teste de que o stub não recebe nem repassa campos sensíveis ao `console`).

## Notas e decisões

- O ARQUITETURA.md posiciona `ClienteLLM` em `atendente/shared/llm_client` e `ClienteMapas` em
  `api/shared/mapas_client`, e `ClienteWhats` em `zap/shared/meta_client`. Decisão: as **interfaces e
  tipos** ficam no kernel (`packages/shared/src/clientes`), porque api/zap/atendente precisam dos mesmos
  tipos (ex.: o motor de fluxo no atendente descreve mensagens que o zap envia). As **implementações**
  ficam onde o ARQUITETURA.md manda; aqui entram só os stubs.
- Os stubs vivem em diretórios próprios (`whats_stub`, `mapas_client`, `llm_client/stub`) para que a
  implementação real (ZAP-meta, AT-llm, API-roteiriza) substitua sem conflito de arquivo.
- Já existe `apps/zap/src/shared/meta_client` e `.../whats` legados (Baileys/cobrança): não tocar aqui.
  ZAP-meta reescreve sobre a interface nova.
- `embutir` (embeddings) está em `ClienteLLM` por ser o mesmo provedor/credencial; se RAG.md decidir
  outro provedor de embedding, vira `ClienteEmbeddings` separado (registrar aqui).
- Implementação (F2-agent): kernel em `packages/shared/src/clientes` (export `@whaviso/shared/clientes`; suítes de contrato em `@whaviso/shared/clientes/testing`, separadas porque importam vitest). Stubs: `apps/zap/src/shared/whats_stub` (`criarWhatsStub`), `apps/api/src/shared/mapas_client` (`criarMapasStub`), `apps/atendente/src/shared/llm_client/stub` (`criarLlmStub`).
- Decisões: `apps/atendente` criado como workspace mínimo (package.json, tsconfig, vitest.config; package-lock não regenerado, rodar `npm install` quando conveniente). `CredencialResolvida` é classe com campo privado (toJSON/toString/inspect ocultos), segredo só via `revelar()`; `montarRequisicaoLlm` é o ponto único de headers/body (SEC-026). `ClienteLLM.completar` aceita `chaveCenario` opcional (só stubs/fakes usam). `fetchSeguro(url, opts)` lança `ErroSsrf` (Permanente), revalida cada salto de redirect manualmente, rejeita IP literal e exige DNS público; aceita `fetchImpl`/`resolverDns` para teste. Regra de lint (etapa 11): módulos não importam SDK/HTTP de provedor nem usam `fetch` global (implementações vivem em shared/ de app). Mapas: fake/stub usam distância euclidiana (30 km/h) e rota por vizinho mais próximo.
- SEC-024: o stub de whats loga só operação e wamid sintético; teste confirma ausência de telefone/token/texto.
