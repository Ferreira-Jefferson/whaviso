# fiscal

## Proposito
Emissao de NFC-e/NFS-e por um EMISSOR DE TERCEIRO (`ClienteFiscal`), sem motor fiscal por UF.
A loja cadastra o emissor (credencial cifrada, CNPJ, regime, series, ambiente); um pedido pede
um documento; o emissor emite; guardamos status, chave e link.

## Provedor de emissor (default: Focus NFe)
Provedor padrao escolhido (decisao de engenharia, 2026-10-27): **Focus NFe** (REST documentado,
idempotencia nativa por `ref`, ambiente por host, auth por token). A impl real
(`criarFiscalFocusDoAmbiente`, em `@whaviso/shared/clientes`, arquivo `fiscal_focus.ts`) entra atras
de `ClienteFiscal` via `config.ts`, GATED por ambiente: so com `API_FISCAL_PROVEDOR=focusnfe`. Sem
isso (dev/offline/testes), `config.ts` mantem o stub `emissorNaoConfigurado` (erro Permanente
`emissor_nao_configurado`: o documento fica `erro`). A suite `contratoClienteFiscal`
(`@whaviso/shared/clientes/testing`) valida stub, fake e a impl real (testes com HTTP mockado).
Trocar de provedor = nova impl atras de `ClienteFiscal`, sem tocar no resto do modulo.
**Go-live (honesto):** exige uma conta Focus NFe (token por loja) e os atributos fiscais por item
(NCM, CFOP, situacao tributaria) que o `ItemFiscal` minimo nao carrega hoje; a mecanica (ref,
consulta de status, mapeamento de erro, credencial, SSRF) esta verificada so por mock.

## Regras de ouro
- Credencial do emissor WRITE-ONLY na borda: so a entrada a carrega; saidas so tem `ultimos4`.
  Nunca em log (corpo do PUT nao e logado). A api decifra so para chamar o emissor, dentro de
  `CredencialResolvida` (opaca). Master key propria: `FISCAL_MASTER_KEY` (min 32).
- Emissao idempotente: unique `(pedido_id, tipo)`; `reservar` e atomico (ON CONFLICT). Retry so
  apos `erro` (ou `pendente` parado ha 5 min). Emitido/em andamento => 409.
- Erro do emissor nunca e ecoado cru: vira `emissor: <codigo>`. Link so `https://`.
- Pedido lido por SQL (nao importa o modulo pedidos). Rascunho e sem itens nao emitem.
- Config e escrita so pelo `dono`; leitura/emissao por `loja:gerir`.

## Entry points
`index.ts` -> `fiscalRoutes` (prefixo `fiscal`): `GET/PUT/PATCH /config`,
`POST/GET /documentos`, `GET /documentos/:id`.

## Tabelas
`fiscal_config` (unique loja), `documentos_fiscais` (unique pedido+tipo). Sem DELETE.
