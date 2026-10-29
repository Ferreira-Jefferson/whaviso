# acessos

## Proposito
Motor de autorizacao editavel por tela: a grade `papel x permissao` vive no banco e o admin da
plataforma liga/desliga celulas. Grade GLOBAL (todas as contas). Papeis sao fixos.
- Console: `convidado`, `suporte`, `financeiro`, `operador`, `admin`.
- Loja: `convidado` (so leitura), `atendente`, `gerente`, `dono`.

## Entry points
- `index.ts`: `acessosRoutes` (registry, prefixo `acessos`) e `criarAcessosRoutes()` (teste).
- `GET /v1/acessos`: catalogo + grade efetiva. `PATCH /v1/acessos/grade`: uma celula
  `{escopo, papel, permissao, permitido}`. Ambas exigem `acessos:gerir` (so admin).
- `GET /v1/acessos/minhas`: permissoes de loja do proprio usuario em cada loja do escopo (qualquer membro; so a UI usa para nao oferecer o que o servidor negaria).

## Invariantes
- A grade e GLOBAL (plataforma-wide) por desenho: `papel_permissoes` nao tem `conta_id`, entao o admin
  que edita uma celula muda o comportamento de TODAS as contas de uma vez (nao e per-tenant, e nao e
  burlavel por usuario de loja: so o admin fixo tem `acessos:gerir`).
- `admin` (console) e `dono` (loja) sao sempre tudo e nao editaveis (CHECK no banco + service +
  `permite()` ignora a grade para eles). `acessos:gerir` nunca e delegavel.
- Os guards leem a grade pelo kernel (`shared/tenant`: `permite`, `exigirPermissao`) com cache por
  processo (TTL 30s, so rede de seguranca). Cada save emite `NOTIFY grade_permissoes` (mesma transacao);
  todo processo da api faz `LISTEN` (conexao dedicada, `DATABASE_URL_LISTEN`) e invalida o cache na hora:
  efeito imediato em qualquer instancia. Reconexao recarrega a grade.
- Entrar no console = ter vinculo em `operadores` (`GET /plataforma-painel/eu`, sem permissao da grade);
  `painel:ver` so gateia o CONTEUDO do painel. Desligar `painel:ver` nao expulsa ninguem.
- Granularidade (0073): cada modulo de loja tem `:ver`/`:gerir` (+ `:operar`/`:configurar`/`:disponibilidade`).
  `loja:gerir` resta so no onboarding. `convidado` so tem `:ver` (cardapio, estoque, disponibilidade, zonas). Sem leitura do banco, vale o padrao do catalogo.
- Cada save grava `eventos` (`plataforma.acesso_alterado`, so chaves/ids, sem dado pessoal).
- Fonte dos padroes: `shared/tenant/catalogo.ts` (espelhada na migration 0072; teste confere paridade).

## Tabelas
- le: `permissoes`, `papel_permissoes`. escreve: `papel_permissoes` (INSERT/UPDATE, sem DELETE), `eventos`.
