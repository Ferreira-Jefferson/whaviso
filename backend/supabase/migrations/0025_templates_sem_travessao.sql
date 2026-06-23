-- Regra de ouro nº2 no banco (E13/H13.2): nenhum TRAVESSÃO em template.
-- Defesa em profundidade junto da API (lintConteudo) e do lint/teste de varredura.
-- Sincroniza o TERCEIRO padrão de linguagem com os espelhos de código:
--   - banco:  este CHECK (templates.conteudo)
--   - backend: TRAVESSAO_PATTERN em packages/shared/src/contracts/linguagem.ts
--   - front:   TRAVESSAO_PATTERN em frontend/src/shared/contracts/linguagem.ts
--
-- Casa SÓ em dash (—, U+2014) e en dash (–, U+2013). NUNCA o hífen ASCII `-`
-- (U+002D), que é legítimo em `midia.url` e em `acao` com underscore: o padrão
-- abaixo lista apenas os dois caracteres de travessão, então `pagar-agora` ou
-- `https://x/a-b` passam intactos. (Já existe o CHECK de vocabulário proibido na 0022.)
alter table public.templates
  add constraint templates_unif_sem_travessao
    check (conteudo::text !~ '[—–]');
