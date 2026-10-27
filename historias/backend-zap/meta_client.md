# ZAP-meta meta_client

- **ID:** ZAP-meta  ·  **Área:** ZAP  ·  **Onda:** 1
- **Modelo sugerido:** Opus  ·  **Status:** `A FAZER`
- **Reivindicado por:** (ninguem)

## Objetivo

Implementar a interface `ClienteWhats` (contrato definido em F2) sobre a Meta Cloud API oficial, em modo
**multi-WABA**: cada número de loja tem credencial e `phone_number_id` próprios, e o cliente roteia por
`phone_number_id` tanto no envio quanto no inbound. "Pronto" observável: dado um `numero_whatsapp_id`, o
cliente decifra o token daquela loja só no instante da chamada, envia texto, botões, lista, template e mídia
com tratamento de erro tipado; verifica a assinatura do webhook; e normaliza o payload de entrada em eventos
do kernel. Nenhum token da Meta é logado nem sai do processo.

## Dependências

- `F2` (clientes-externos): define a interface `ClienteWhats` e o stub; este módulo é a implementação real.

## Contratos e tabelas que toca

- Contrato: `ClienteWhats` e os eventos normalizados de inbound/recibo (kernel, F1/F2). Este módulo não
  redefine contrato, só implementa.
- Tabela `numeros_whatsapp`: **leitura** de `phone_number_id`, `waba_id`, `token_cifrado`, `status`
  (resolução de credencial por loja) e **escrita só do estado de saúde** permitido ao `whaviso_zap` por grant
  por coluna (SEC-031). Nenhuma outra tabela.
- Nenhum acesso a `envios`/`mensagens`: isso é de `ZAP-enviar` e `ZAP-webhook`. Este módulo é biblioteca
  de transporte, sem regra de fila.

## Arquivos (escopo de edição)

- `backend/apps/zap/src/shared/meta_client/**` (existe base legada de cobrança: `graph.ts`, `inbound.ts`,
  `verificar_assinatura.ts`, `erros.ts`, `tipos.ts`; adaptar o que serve, não reescrever do zero)
- `backend/apps/zap/src/shared/meta_client/tests/**`
- `backend/apps/zap/src/shared/credenciais/**` (decifra de `token_cifrado`, novo, local ao zap)
- Kernel compartilhado só se combinado: `backend/packages/shared/...` (helper de cifra, se ainda não existir
  em F1; senão reusar)

## Etapas

- [ ] Auditar a base legada de `meta_client/` e listar o que se reaproveita (graph, assinatura, erros) e o
      que sai (`template_payload` acoplado ao domínio de cobrança)  (commit: `docs(zap): inventario do meta_client legado`)
- [ ] Resolver de credencial por loja: dado `numero_whatsapp_id` ou `phone_number_id`, ler `numeros_whatsapp`
      (via `shared/db`, query parametrizada) e decifrar `token_cifrado` **no uso**, sem cachear o token em
      claro além da chamada  (commit: `feat(zap): resolver de credencial por numero`)
- [ ] Cliente HTTP do Graph API: base URL e versão fixas em config, allowlist de host (somente
      `graph.facebook.com`), `redirect: 'error'`, timeout, token no header `Authorization`, nunca na URL
      nem no corpo  (commit: `feat(zap): cliente graph com allowlist e timeout`)
- [ ] `enviarTexto` e `enviarMidia` (imagem, documento) roteados por `phone_number_id`  (commit: `feat(zap): envio de texto e midia`)
- [ ] `enviarInterativo`: botões de resposta (até 3) e lista (até 10 linhas), validando limites de tamanho
      de título/id antes de chamar a Meta (erro de contrato local, sem round-trip)  (commit: `feat(zap): envio de botoes e lista`)
- [ ] `enviarTemplate` (mensagens fora da janela de 24h): monta componentes e parâmetros a partir de payload
      do kernel  (commit: `feat(zap): envio de template`)
- [ ] Mapeamento de erros da Meta para erros tipados do kernel: `transitorio` (rede, 429, 5xx, retentável),
      `permanente` (número inválido, template não aprovado), `janela_24h_expirada`, `credencial_invalida`
      (401/190, sinaliza saúde do número)  (commit: `feat(zap): erros tipados da meta`)
- [ ] Sinalizar saúde do número: em `credencial_invalida` persistente, atualizar só a coluna de saúde
      permitida pelo grant; nunca apagar token  (commit: `feat(zap): estado de saude do numero`)
- [ ] `verificarAssinatura(rawBody, headerSha256, appSecret)`: HMAC-SHA256 com comparação em tempo
      constante; rejeita header ausente ou malformado  (commit: `feat(zap): verificacao de assinatura do webhook`)
- [ ] `normalizarInbound(payload)`: payload da Meta em eventos do kernel (texto, botão/lista selecionados,
      áudio, imagem, localização; recibos sent/delivered/read/failed) **incluindo `phone_number_id`,
      `wamid` e o `from` ainda bruto** (quem consome faz o hash)  (commit: `feat(zap): normalizacao de inbound`)
- [ ] Download de mídia recebida (áudio/imagem) por `media_id`: busca a URL na Meta e baixa com o token da
      loja, com limite de tamanho e de tipo; devolve buffer/stream sem persistir  (commit: `feat(zap): download de midia da meta`)
- [ ] Testes de unidade (ver abaixo)  (commit: `test(zap): meta_client`)
- [ ] Revisão (Opus) contra SEGURANCA.md (segredo, SSRF, assinatura)

## Testes e segurança exigidos

- Unidade com Graph API simulado (servidor HTTP local ou fetch injetado): payload de cada tipo de envio,
  roteamento por `phone_number_id`, mapeamento de cada classe de erro, normalização de cada tipo de inbound
  (fixtures reais anonimizadas), download de mídia.
- **SEC-050**: assinatura inválida, ausente ou com corpo alterado é rejeitada; comparação em tempo constante.
- **SEC-070** (aplicável ao transporte): host fixo; teste de redirect para `169.254.x`/`localhost` falha.
- **SEC-024**: injetar token conhecido e confirmar que não aparece em nenhuma linha de log nem em mensagem
  de erro propagada.
- **SEC-031**: o zap só escreve a coluna de saúde de `numeros_whatsapp` permitida; qualquer outra falha
  por privilégio.
- Sem token em URL, em query string nem em corpo de log.

## Notas e decisões

- Decisão: este módulo é **biblioteca**, não serviço. Quem agenda e retenta é `ZAP-enviar`; quem recebe HTTP
  é `ZAP-webhook`. Mantém a fronteira "módulo não importa módulo" (ambos consomem `shared/meta_client`).
- Decisão: o token é decifrado a cada chamada (ou por TTL curto em memória, a definir na etapa 2 e
  registrar aqui); nunca persistido em claro, nunca em cache de longa duração.
- Decisão: o `appSecret` da Meta é um só por app (config do processo), distinto do token por loja.
- Pendência a registrar: a cifra de `token_cifrado` usa o mesmo esquema de envelope de F1/`credenciais_llm`;
  se F1 ainda não expôs o helper, escalar a um especialista antes de inventar outro esquema.
