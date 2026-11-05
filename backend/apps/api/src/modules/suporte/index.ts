// API publica do modulo `suporte`. O registry (routes.ts) usa dois plugins (um prefixo cada):
//   { prefixo: 'suporte', plugin: suporteRoutes },                      // vira /v1/suporte/*
//   { prefixo: 'plataforma-suporte', plugin: plataformaSuporteRoutes }, // vira /v1/plataforma-suporte/*
// Dono das tabelas `chamados_suporte`/`chamados_suporte_mensagens`; a parte de acesso assistido
// (grants) vem do kernel compartilhado `shared/acesso_suporte`.
export {
  suporteRoutes,
  plataformaSuporteRoutes,
  criarRotasSuporte,
  criarRotasPlataformaSuporte,
} from './routes'
