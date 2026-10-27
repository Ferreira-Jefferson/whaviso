// Loja ativa enviada em `x-loja-id` (SEC-001/002). Mantida aqui (e nao em tenant) para o
// api_client nao depender de tenant; `shared/tenant` e o unico que escreve.
let lojaAtiva: string | null = null

export function definirLojaAtiva(id: string | null): void {
  lojaAtiva = id
}

export function lerLojaAtiva(): string | null {
  return lojaAtiva
}
