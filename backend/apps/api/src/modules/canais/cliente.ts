// Ponte para a fronteira ClienteCanal do shared.
// TODO(integrador): apos `export * from './canais'`, './stub_canais' e './fakes/canais' em
// packages/shared/src/clientes/index.ts, trocar estes imports relativos por '@whaviso/shared/clientes'.
export type { ClienteCanal, BuscarPedidosEntrada } from '@whaviso/shared/clientes'
export { StubClienteCanal } from '@whaviso/shared/clientes'
export { CredencialResolvida } from '@whaviso/shared/clientes'
