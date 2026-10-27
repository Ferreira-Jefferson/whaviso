-- Seed de DESENVOLVIMENTO LOCAL. Nunca roda no cloud (o db push pula o seed): catálogo de
-- produção (ex.: templates-padrão) vai em migration, não aqui.

-- Senhas dev dos roles de serviço (coincidem com .env.example; em produção vêm do painel).
alter role whaviso_api       with password 'whaviso_api_dev';
alter role whaviso_zap       with password 'whaviso_zap_dev';
alter role whaviso_atendente with password 'whaviso_atendente_dev';

-- Só em dev/teste: deixa o catálogo de templates-padrão enviável (em produção o status vem da Meta).
update public.templates set ativo = true, status_meta = 'aprovado' where loja_id is null;

-- Identidade de login de teste (dona da conta de exemplo).
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'dono@exemplo.test')
on conflict (id) do nothing;

-- Conta, loja e número de teste.
insert into public.contas (id, dono_user_id, nome)
values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Conta Exemplo');

insert into public.lojas (id, conta_id, nome, cores, horarios)
values ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-0000000000c1',
        'Pizzaria Exemplo', '{"primaria":"#c0392b"}'::jsonb,
        '{"fuso":"America/Sao_Paulo","dias":[
           {"dia":0,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]},
           {"dia":1,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]},
           {"dia":2,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]},
           {"dia":3,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]},
           {"dia":4,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]},
           {"dia":5,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]},
           {"dia":6,"fechado":false,"faixas":[{"abre":"18:00","fecha":"23:30"}]}
         ]}'::jsonb);

insert into public.membros (conta_id, loja_id, user_id, papel)
values ('00000000-0000-4000-8000-0000000000c1', null, '00000000-0000-4000-8000-0000000000a1', 'dono');

insert into public.numeros_whatsapp (id, loja_id, phone_number_id, waba_id, numero_hash, verificado)
values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1',
        'dev-phone-number-id', 'dev-waba-id',
        encode(digest('+5511999990000', 'sha256'), 'hex'), true);

-- Cardápio mínimo: pizzas com tamanho (obrigatório), borda (adicional dependente do tamanho
-- grande) e uma bebida sem grupos.
insert into public.grupos_opcoes (id, loja_id, nome, tipo, obrigatorio, min_escolhas, max_escolhas) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000d1', 'Tamanho', 'tamanho', true, 1, 1),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000d1', 'Borda', 'adicional', false, 0, 1);

insert into public.opcoes (id, loja_id, grupo_id, nome, preco_centavos, padrao, ordem) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000101', 'Média', 0, true, 1),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000101', 'Grande', 1000, false, 2),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000102', 'Catupiry', 800, false, 1),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000102', 'Cheddar', 800, false, 2);

-- A borda só se oferece quando o tamanho Grande foi escolhido.
update public.grupos_opcoes
   set aplica_a_opcao_id = '00000000-0000-4000-8000-000000000202'
 where id = '00000000-0000-4000-8000-000000000102';

insert into public.categorias (id, loja_id, nome, ordem) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000d1', 'Pizzas', 1),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000d1', 'Bebidas', 2);

insert into public.categoria_grupos (categoria_id, grupo_id, loja_id, ordem) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000d1', 1),
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000d1', 2);

insert into public.itens (id, loja_id, categoria_id, nome, descricao, preco_centavos, sugerivel, ordem) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000301', 'Margherita', 'Molho de tomate, mussarela e manjericão', 4500, false, 1),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000301', 'Calabresa', 'Calabresa fatiada e cebola', 4800, false, 2),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000302', 'Refrigerante 2L', null, 1200, true, 1);

-- Uma zona de entrega para ter o que precificar.
insert into public.zonas_entrega (loja_id, nome, tipo, bairro, taxa_cliente_centavos, valor_motoboy_centavos)
values ('00000000-0000-4000-8000-0000000000d1', 'Centro', 'bairro', 'Centro', 500, 400);
