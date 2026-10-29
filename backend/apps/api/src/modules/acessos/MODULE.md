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

## Invariantes
- `admin` (console) e `dono` (loja) sao sempre tudo e nao editaveis (CHECK no banco + service +
  `permite()` ignora a grade para eles). `acessos:gerir` nunca e delegavel.
- Os guards leem a grade pelo kernel (`shared/tenant`: `permite`, `exigirPermissao`) com cache por
  processo (TTL 30s) invalidado a cada save. Sem leitura do banco, vale o padrao do catalogo.
- Cada save grava `eventos` (`plataforma.acesso_alterado`, so chaves/ids, sem dado pessoal).
- Fonte dos padroes: `shared/tenant/catalogo.ts` (espelhada na migration 0072; teste confere paridade).

## Tabelas
- le: `permissoes`, `papel_permissoes`. escreve: `papel_permissoes` (INSERT/UPDATE, sem DELETE), `eventos`.
