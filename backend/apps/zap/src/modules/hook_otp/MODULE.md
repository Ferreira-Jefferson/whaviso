# Módulo: hook_otp (zap)

Endpoint do **Send SMS Hook** do Supabase: o login por telefone do app gera um OTP
no Supabase Auth, que o POSTa em `POST /hooks/send-code`. Aqui validamos a assinatura
(Standard Webhooks, `SEND_CODE_HOOK_SECRET = whsec_...`) e entregamos o código pelo
**nosso WhatsApp** (Baileys via `shared/baileys_client`), sem provedor de SMS pago.

**Contrato:** corpo `{ user: { phone }, sms: { otp } }`; resposta vazia `200` = sucesso;
não-200 = falha (o usuário pede o código de novo). Sem `SEND_CODE_HOOK_SECRET` → `503`.

**Env:** `SEND_CODE_HOOK_SECRET` (opcional; sem ele a rota fica desligada).

O `zap` precisa estar **público** (a nuvem do Supabase chama o hook): VPS em prod,
ngrok em dev. Como a entrega usa o nosso número (Baileys), o OTP **não depende da
Meta** (sem verificação de empresa nem template de Autenticação aprovado).
A copy varia LOGIN vs CADASTRO (H1.2/H1.3) conforme o número já tem cadastro
(consulta `profiles.telefone`); na Fase 2 ambas viram template editável no admin.

> Nunca logar telefone nem o código (Regras de Ouro). Fronteira: módulo nunca importa módulo.
