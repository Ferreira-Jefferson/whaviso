// API publica do kernel compartilhado de acesso assistido (consentimento da loja para o operador
// ver o conteudo). Dono UNICO das tabelas `acessos_suporte` e `acessos_suporte_log` na api: o
// modulo `suporte` (rotas de loja e console) consome este kernel; a PONTE do operador (shared/
// tenant) usa `acessoAtivo` + `registrarUso`. Nenhum consumidor escreve nas tabelas direto nem
// importa o modulo `suporte` (fronteira feature-first). Sem DELETE (SEC-030); log append-only.
export * as servicoAcessoSuporte from './service'
export type {
  EntradaConceder,
  EntradaRevogar,
  EntradaUso,
} from './service'
