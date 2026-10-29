# Modulo: hook_otp (zap)

Endpoint do **Send SMS Hook** do Supabase. O login por telefone do app chama
`supabase.auth.signInWithOtp({ phone })`; o Supabase Auth gera o OTP e o POSTa em
`POST /hooks/send-code`. Aqui validamos a assinatura (Standard Webhooks, segredo
`SEND_CODE_HOOK_SECRET = whsec_...`) e entregamos o codigo pelo **nosso WhatsApp** via
template AUTHENTICATION da Meta Cloud API (`ClienteWhats.enviarTemplateAutenticacao`,
nome em `META_OTP_TEMPLATE`), sem provedor de SMS pago.

**Remetente:** o numero da PLATAFORMA (credenciais `META_*` do proprio zap), nao um numero
de loja: o login nao tem contexto de loja.

**Contrato:** corpo `{ user: { phone }, sms: { otp } }`; resposta vazia `200` = sucesso;
nao-200 = falha (o usuario pede o codigo de novo). Sem `SEND_CODE_HOOK_SECRET` -> `503`;
assinatura invalida -> `401`; sem telefone/codigo -> `400`. Responde `200` na hora e entrega
em background (o Supabase encerra o hook em ~5 s; o envio pela Meta pode levar mais).

**Auditoria:** `otp_solicitado` ao receber, `otp_entregue`/`otp_falha_envio` apos o envio
(tabela `eventos_auth`, append-only). Telefone SO como sha256; o codigo NUNCA e auditado.

**Env:** `SEND_CODE_HOOK_SECRET` (sem ele a rota fica desligada), `META_OTP_TEMPLATE`,
`META_OTP_IDIOMA`, e as `META_*` essenciais ja exigidas no boot.

O `zap` precisa estar **publico** (a nuvem do Supabase chama o hook): VPS em prod, tunel em
dev. A entrega exige um template AUTHENTICATION aprovado na Meta e a empresa verificada
(igual aos demais envios). Templates AUTHENTICATION tem formato fixo da Meta: o codigo vai no
corpo E no botao de copiar/auto-preencher.

> Nunca logar telefone nem o codigo (Regras de Ouro). Fronteira: modulo nunca importa modulo.
> Registro: o app-root liga via `registrarHookOtp(app, deps)` (ver src/app.ts).
