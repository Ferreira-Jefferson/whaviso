-- Credencial de recebimento da subconta (modelo B do split do Asaas) + cliente generico por loja.
-- Complementa a 0086. No modelo B a COBRANCA e criada autenticando como a SUBCONTA da loja (dona do
-- dinheiro); o split entrega so a taxa do whaviso. Para isso a api precisa, por loja:
--   api_key_cifrada  = API key da subconta no Asaas (SEGREDO; cifrada, nunca em claro/log). Devolvida
--                      uma unica vez pelo Asaas na criacao da conta; guardada aqui cifrada em repouso.
--   customer_ref     = id do cliente 'Consumidor final' (cus_...) usado como pagador das cobrancas da
--                      loja (o Asaas exige um customer por cobranca; nao e dado sensivel).
-- Colunas aditivas e nullable: subconta sem credencial segue 'pendente' e o caminho intermediado
-- continua barrado ate o operador provisionar a chave. Sem DELETE (estado, nao sumico).

alter table public.psp_subcontas
  add column api_key_cifrada bytea,
  add column customer_ref text;

-- Grants ja concedidos na 0086 (select/insert/update a whaviso_api); as colunas herdam a policy.
-- A leitura da cifra e DEDICADA no repo (nunca entra nas projecoes de status/leitura da subconta).
