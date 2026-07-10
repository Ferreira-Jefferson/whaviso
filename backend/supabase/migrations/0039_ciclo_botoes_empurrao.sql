-- E6 (Ciclo de lembretes), H6.2/H6.3/H6.5: rótulos dos botões e empurrãozinho de D+1.
--
-- 1) RÓTULOS DOS BOTÕES (H6.2/H6.3, divergências): os TRÊS botões aparecem em TODAS as
--    etapas do ciclo. Atualiza os rótulos no `conteudo.botoes` dos templates `ciclo.*`:
--      ver_pix : "Ver chave Pix" -> "Chave Pix"  (a precaução de evitar a palavra "Pix"
--                era da época do WhatsApp não oficial; resolvida com a migração para a
--                Meta Cloud API oficial e aprovada, que não bloqueia o termo).
--      optout  : "Não quero mais lembretes" -> "Desativar lembretes".
--    (Rótulos são editáveis pelo owner via E12; aqui só atualizamos o padrão de catálogo.)
--
-- 2) EMPURRÃOZINHO DE D+1 (H6.5): em `informado_pago` o ciclo normal PARA; a ÚNICA
--    mensagem possível depois é o empurrãozinho de D+1 (se o cobrador ainda não confirmou).
--    Reaproveita a variante `revisao` de `ciclo.d_mais_1` (já existia na 0024 com texto de
--    "desconsidere"); troca o texto pelo empurrãozinho da história, neutro de gênero e sem
--    travessão, e a ATIVA (status_meta='aprovado', ativo=true): agora é texto vigente.
--    A variável "quem recebe" ({{cobrador}}/{{4}}) resolve o nome de quem recebe nos dois
--    fluxos (no invertido o cobrador é o convidado; o texto não fica sem sentido).
--
-- 3) APOSENTA a variante `revisao` de `ciclo.d` (texto "desconsidere"): o ciclo normal não
--    roda mais em `informado_pago`, então a única revisao usada é a de d_mais_1. Desativa
--    sem apagar (preserva histórico; o owner pode reativar/editar pela tela de templates).
--
-- Numeração: última migration = 0038 (horario_reservado); esta é 0039.

-- ---------------------------------------------------------------------------------------
-- 1) Rótulos dos botões em TODAS as etapas do ciclo (qualquer contexto).
-- ---------------------------------------------------------------------------------------
update public.templates
  set conteudo = jsonb_set(
        conteudo,
        '{botoes}',
        (
          select jsonb_agg(
            case
              when b->>'acao' = 'ver_pix' then jsonb_set(b, '{rotulo}', '"Chave Pix"')
              when b->>'acao' = 'optout'  then jsonb_set(b, '{rotulo}', '"Desativar lembretes"')
              else b
            end
          )
          from jsonb_array_elements(conteudo->'botoes') as b
        )
      )
  where chave like 'ciclo.%'
    and conteudo ? 'botoes'
    and jsonb_typeof(conteudo->'botoes') = 'array';

-- ---------------------------------------------------------------------------------------
-- 2) Empurrãozinho de D+1 (variante revisao de ciclo.d_mais_1): novo texto + ATIVA.
--    Variáveis: {{1}}=nome de quem recebe os lembretes (devedor), {{2}}=motivo,
--               {{3}}=valor, {{4}}=quem recebe o pagamento (cobrador).
--    Se a linha não existir (banco onde a 0024 não semeou a revisao), insere.
-- ---------------------------------------------------------------------------------------
update public.templates
  set conteudo = jsonb_build_object(
        'texto',
          E'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{4}} ainda não confirmou. Qualquer coisa, manda um oi pra {{4}}. 🙂',
        'botoes', conteudo->'botoes'
      ),
      variaveis = '["nome_devedor","motivo","valor","cobrador"]'::jsonb,
      status_meta = 'aprovado',
      ativo = true
  where chave = 'ciclo.d_mais_1' and contexto = 'revisao';

insert into public.templates (chave, contexto, nome_meta, idioma, conteudo, variaveis, status_meta, ativo)
select 'ciclo.d_mais_1', 'revisao', 'whaviso_d1_empurraozinho', 'pt_BR',
       jsonb_build_object(
         'texto',
           E'Oi, {{1}}. A data do pagamento foi ontem. Você já informou que pagou, mas {{4}} ainda não confirmou. Qualquer coisa, manda um oi pra {{4}}. 🙂',
         'botoes', jsonb_build_array(
           jsonb_build_object('acao','ja_paguei','rotulo','Já paguei'),
           jsonb_build_object('acao','ver_pix','rotulo','Chave Pix'),
           jsonb_build_object('acao','optout','rotulo','Desativar lembretes')
         )
       ),
       '["nome_devedor","motivo","valor","cobrador"]'::jsonb, 'aprovado', true
where not exists (
  select 1 from public.templates where chave = 'ciclo.d_mais_1' and contexto = 'revisao'
);

-- ---------------------------------------------------------------------------------------
-- 3) Aposenta a variante revisao de ciclo.d (não mais usada).
-- ---------------------------------------------------------------------------------------
update public.templates
  set ativo = false
  where chave = 'ciclo.d' and contexto = 'revisao';
