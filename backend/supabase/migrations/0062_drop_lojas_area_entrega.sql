-- Remove a coluna legada public.lojas.area_entrega (jsonb). A entrega da loja passa a ser 100%
-- zonas_entrega (tabela ja por loja, operacional: bairro | poligono | raio, com taxa_cliente,
-- valor_motoboy, pedido_minimo e frete_gratis). A area_entrega era a versao cosmetica/capada: so
-- aparecia no perfil da loja, sem preco, e nunca foi usada operacionalmente (nenhum uso no atendente
-- nem no zap). As zonas a superam por completo. Nenhum consumidor restante le a coluna.
-- (if exists so por seguranca; a migration nao e idempotente por design.)
alter table public.lojas drop column if exists area_entrega;
