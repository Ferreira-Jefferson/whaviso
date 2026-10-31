# enviar_email (ZAP-enviar-email)

Dreno da outbox de e-mail: drena `emails_outbox` (migration 0082) e envia cada item por e-mail
transacional (Resend), atras da interface `ClienteEmail`. A api so PRODUZ (enfileira); o zap
DRENA e envia. Espelha o padrao de `ZAP-enviar` (claim `FOR UPDATE SKIP LOCKED`, recuperacao de
orfaos, retentativa com backoff, gravacao so das colunas de transporte, SEC-031).

## Fiacao (app-root; o modulo nao se auto-registra)

Chamado pelo scheduler, como `ZAP-enviar`. Em `src/server.ts`, A CADA TICK (nao uma vez no
boot): le `credenciais_email_plataforma` (migration 0096, `shared/credenciais_plataforma/repo.ts`),
decifra com a MASTER_KEY e, se configurada, constroi o `ClienteEmail` via
`criarClienteResend({ apiKey, remetente, logger })`; senao passa `cliente: undefined`.

**Sem credencial configurada o boot NAO quebra:** o dreno recebe `cliente: undefined`, devolve
`idle: true` e deixa os e-mails na fila (enviados no primeiro tick apos o admin configurar em
`/plataforma/configuracoes`, sem precisar reiniciar o processo).

## Propriedade de dados

- **Le/escreve `emails_outbox`:** so as colunas de transporte concedidas a `whaviso_zap` (status,
  enviado_em, tentativas, proxima_tentativa_em, provider_id, erro). Nunca toca `para`/`payload`.
- **Reivindica** com `status = 'processando'` + `for update skip locked`; **recupera** orfaos
  (`processando` velho) voltando a `agendado` sem consumir tentativa (entrega at-least-once).

## Isolamento do provedor

`ClienteEmail` e a fronteira (como `ClienteWhats`): `criarClienteResend` e a unica implementacao
real (POST `https://api.resend.com/emails`). A `ZAP_RESEND_API_KEY` nunca e logada; o e-mail do
destinatario nao vai para log (so `provider_id` e o codigo de erro). 4xx (exceto 429) e permanente;
429/5xx/rede sao retentaveis.

## Templates

Renderizados EM CODIGO (`template.ts`), o zap e so transporte. Linguagem neutra quanto a genero,
sem travessao, sem emoji. Chave atual: `boas_vindas` (acesso de login liberado).

## Credencial

Nao e env: `credenciais_email_plataforma` (singleton, `id = 1`), administrada pelo operador em
`/plataforma/configuracoes` (modulo api `credenciais_plataforma`). Ausente/zerada -> dreno idle.
