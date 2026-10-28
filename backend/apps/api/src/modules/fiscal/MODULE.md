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
**Dado fiscal por item (catalogo):** a NFC-e exige por item NCM, CFOP, origem, unidade e a situacao
tributaria (CSOSN p/ Simples/MEI, CST p/ regime normal). Isso e DADO de cadastro (tabela
`itens_fiscais`, por loja+item), nao calculo: a api valida a presenca e repassa ao emissor
(`ItemFiscal` agora carrega esses campos). Um item sem o dado NAO emite: a api barra antes de chamar
o emissor e lista os itens pendentes (`itens_sem_dado_fiscal`). NFS-e nao exige dado por item (o
emissor trata o pedido como um servico unico).

**Go-live (honesto):** exige uma conta Focus NFe (token por loja) e o dado fiscal cadastrado por
item; so entao a SEFAZ autoriza. A mecanica (ref idempotente, consulta de status, mapeamento de
erro, credencial, SSRF) e o mapeamento (NCM/CFOP/origem/situacao -> corpo da Focus) estao
verificados so por mock.

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
`index.ts` -> `fiscalRoutes` (prefixo `fiscal`): `GET/PUT/PATCH /config`, `POST/GET /documentos`,
`GET /documentos/:id`, `POST /documentos/auto` (emissao automatica em lote dos pedidos concluidos,
quando `auto_emitir` ligado), `GET /pedidos-emissiveis` (pedidos `entregue` sem NFC-e),
`GET /itens` + `PUT /itens/:itemId` (dado fiscal por item do catalogo). Dado fiscal e emissao:
`loja:gerir`; credencial do emissor (`PUT /config`): so o `dono`.

## Tabelas
`fiscal_config` (unique loja; `auto_emitir` governa a emissao automatica), `documentos_fiscais`
(unique pedido+tipo), `itens_fiscais` (unique loja+item: NCM/CFOP/origem/unidade/CSOSN|CST; sem
DELETE: desfazer e limpar na tela). Pedido e itens lidos por SQL (nao importa o modulo pedidos/
cardapio). Sem DELETE em nenhuma.
