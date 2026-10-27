# fiscal

## Proposito
Emissao de NFC-e/NFS-e por um EMISSOR DE TERCEIRO (`ClienteFiscal`), sem motor fiscal por UF.
A loja cadastra o emissor (credencial cifrada, CNPJ, regime, series, ambiente); um pedido pede
um documento; o emissor emite; guardamos status, chave e link.

## DECISAO PENDENTE DO DONO
Qual provedor de emissor usar ainda NAO foi escolhido. Hoje `config.ts` liga o stub
`emissorNaoConfigurado` (erro Permanente `emissor_nao_configurado`: o documento fica `erro`).
Escolhido o provedor, implementar `ClienteFiscal` (com `fetchSeguro` + allowlist de host) e trocar
em `config.ts`. A suite `contratoClienteFiscal` (`@whaviso/shared/clientes/testing`) valida a impl.

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
