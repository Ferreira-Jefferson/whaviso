# credenciais_plataforma

## Proposito
Credenciais de operacao da PLATAFORMA (nao de loja, nao de cliente): o numero oficial do
whaviso no WhatsApp (ainda sem consumidor real; feature futura de OTP/notificacao vai usar) e a
chave do Resend (e-mail transacional, ja consumida pelo dreno de e-mail do zap). Hoje ambas so
existiam via `.env` + redeploy; este modulo torna as duas administraveis em runtime pelo
console `/plataforma/configuracoes`.

## Entry points
- `index.ts`: `credenciaisPlataformaRoutes` (registry, prefixo `credenciais-plataforma`) e
  `criarRotasCredenciaisPlataforma()` (teste).
- Rotas (`/v1/credenciais-plataforma`, so operador com `chaves_api:gerir`):
  `GET/PUT whatsapp-oficial`, `GET/PUT email`.

## Invariantes
- Segredo (SEC-020/021/023): `access_token_cifrado`/`api_key_cifrada` cifrados com a MESMA
  `MASTER_KEY` do token da Meta/chave Pix (kernel `@whaviso/shared/cifra`). A api e write-only:
  so grava, nunca seleciona a coluna cifrada de volta (repo projeta so metadado). GET nunca
  devolve o segredo; PUT nunca ecoa o corpo no log.
- Sem DELETE (SEC-030): credencial se sobrescreve (UPDATE da linha singleton), nunca some.
- Quem decifra e o `zap` (grant `select` na tabela), para efetivamente usar as credenciais no
  envio; a api nunca decifra.

## Tabelas
- escreve: `credenciais_whatsapp_oficial` (UPDATE, singleton `id = 1`, semeado pela migration
  0096), `credenciais_email_plataforma` (idem).
- le: as mesmas (so metadado, nunca a coluna cifrada).

## Fora de escopo (deliberado)
`META_APP_SECRET`/`META_VERIFY_TOKEN` continuam em `.env` do zap: sao segredo do App Meta /
handshake do webhook (`/webhook/whatsapp`), compartilhados por todos os numeros (loja e oficial),
nao uma credencial do numero oficial especificamente. Nao ha ainda nenhum endpoint que CONSUMA a
credencial do numero oficial (ex.: `/hooks/send-code` do OTP) - este modulo so guarda e deixa
administravel, pronto para quando essa feature for construida.
