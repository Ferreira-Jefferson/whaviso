-- Enums do domínio whaviso. Mantidos em sincronia com packages/shared/src/contracts/enums.ts.

create type direcao_aviso as enum ('receber', 'pagar');

create type status_aviso as enum (
  'aguardando_aceite',
  'pendente',
  'pago',
  'cancelado',
  'expirado'
);

create type etapa_envio as enum ('d_menos_2', 'd_menos_1', 'd', 'd_mais_1');

-- 'processando' é o claim do scheduler (FOR UPDATE SKIP LOCKED); o frontend o exibe como 'agendado'.
create type status_envio as enum (
  'agendado',
  'processando',
  'enviado',
  'falhou',
  'cancelado'
);

create type entrega_status as enum ('sent', 'delivered', 'read', 'failed');

create type role_usuario as enum ('owner', 'cobrador', 'devedor');

create type tipo_evento as enum (
  'criado',
  'aceite',
  'ja_paguei_devedor',
  'confirmado_cobrador',
  'desmarcado_cobrador',
  'optout',
  'cancelado_cobrador',
  'expirado'
);

create type ator_evento as enum ('cobrador', 'devedor', 'sistema', 'admin');

create type status_meta_template as enum ('pendente', 'aprovado', 'rejeitado');
