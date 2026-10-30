-- Planos de referencia (catalogo inicial Whaviso -> restaurante). Semeados por MIGRATION como
-- UPSERT idempotente, porque o seed NAO roda no cloud (ver CLAUDE.md) e a tabela nasce vazia (0071).
-- Sao EDITAVEIS no console /plataforma/planos: 'on conflict do nothing' preserva qualquer ajuste
-- feito pela equipe (nunca sobrescreve nome/preco/itens/taxa ja existentes). Em recriacao de banco,
-- voltam ao estado abaixo. Taxa de intermediacao por plano decresce com o tier (50 -> 40 -> 30),
-- fora da taxa da plataforma de pagamento; ver [[whaviso-taxa-pagamento-intermediado]].
insert into public.planos (nome, valor_centavos, inclui, ativo, taxa_intermediacao_centavos)
values
  ('Essencial', 8990, ARRAY[
    '1 loja',
    'Pedidos pelo WhatsApp',
    'Cardápio digital',
    'Painel de pedidos ao vivo',
    'Caixa e formas de pagamento',
    'Pix na sua conta, sem taxa por pedido',
    'R$ 0,50 por transação intermediada'
  ], true, 50),
  ('Profissional', 17990, ARRAY[
    'Tudo do Essencial',
    'Até 3 lojas',
    'Atendente com IA no WhatsApp',
    'Salão, mesas e comandas',
    'Estoque e ficha técnica',
    'Campanhas, promoções e fidelidade',
    'Relatórios e dashboard',
    'R$ 0,40 por transação intermediada'
  ], true, 40),
  ('Rede', 34990, ARRAY[
    'Tudo do Profissional',
    'Lojas ilimitadas',
    'Equipe, cargos e escalas',
    'Pagamento intermediado (Pix e cartão)',
    'Emissão fiscal',
    'Suporte prioritário',
    'R$ 0,30 por transação intermediada'
  ], true, 30)
on conflict (lower(btrim(nome))) do nothing;
