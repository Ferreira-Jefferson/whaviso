// Cobranca da plataforma. Default = console do OPERADOR (faturas, assinaturas, rotinas):
// pagina: lazy(() => import('@/modules/plataforma_cobranca')).
// `MinhaFaturaPage` = visao do DONO DA LOJA (escopo de loja), para encaixar no shell da loja.
// Reexport direto (sem lazy aqui): o rotas.ts ja envolve em lazy. Dois lazy sobre o mesmo
// componente quebram em runtime ("wrapped in React.lazy() more than once").
export { default } from './pages/Cobranca'
export { default as MinhaFaturaPage } from './pages/MinhaFatura'
export { default as PlanosPage } from './pages/Planos'
