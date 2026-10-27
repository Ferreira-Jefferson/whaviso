// Comanda do pedido, gerada SO do snapshot (nunca do cardapio vivo). Texto colunado para termica
// de 58 mm (32 colunas) ou 80 mm (48) e HTML com CSS de impressao. Sem telefone; hora em SP.
import { TZ, formatarValorBr } from '@whaviso/shared/datas'
import type { PedidoDetalheSaida } from './schemas'

const hora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})
export const horaSp = (iso: string): string => hora.format(new Date(iso))

const ativos = (p: PedidoDetalheSaida) => p.itens.filter((i) => !i.cancelado)

function enderecoLinha(p: PedidoDetalheSaida): string[] {
  const e = p.endereco
  if (!e) return []
  const l1 = [e.logradouro, e.numero].filter(Boolean).join(', ')
  const l2 = [e.complemento, e.bairro].filter(Boolean).join(' - ')
  const l3 = [e.cidade, e.uf].filter(Boolean).join('/')
  return [l1, l2, l3, e.referencia ? `Ref: ${e.referencia}` : ''].filter((l) => l.length > 0)
}

function quebrar(texto: string, largura: number): string[] {
  const saida: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/)) {
    if (atual && atual.length + 1 + palavra.length > largura) {
      saida.push(atual)
      atual = palavra
    } else atual = atual ? `${atual} ${palavra}` : palavra
    while (atual.length > largura) {
      saida.push(atual.slice(0, largura))
      atual = atual.slice(largura)
    }
  }
  if (atual) saida.push(atual)
  return saida
}

function duasColunas(esq: string, dir: string, largura: number): string {
  const espaco = Math.max(1, largura - esq.length - dir.length)
  return esq.length + dir.length + 1 > largura ? `${esq}\n${dir.padStart(largura)}` : `${esq}${' '.repeat(espaco)}${dir}`
}

export function comandaTexto(p: PedidoDetalheSaida, largura: number): string {
  const tracos = '-'.repeat(largura)
  const L: string[] = []
  L.push(`PEDIDO ${p.codigo}`, horaSp(p.criado_em), p.modalidade === 'retirada' ? 'RETIRADA' : 'ENTREGA')
  if (p.cliente?.nome) L.push(...quebrar(`Cliente: ${p.cliente.nome}`, largura))
  L.push(...enderecoLinha(p).flatMap((l) => quebrar(l, largura)), tracos)
  for (const i of ativos(p)) {
    L.push(duasColunas(`${i.quantidade}x ${i.nome_snapshot}`, formatarValorBr(i.total_centavos), largura))
    for (const o of i.opcoes) {
      const preco = o.preco_centavos > 0 ? ` +${formatarValorBr(o.preco_centavos)}` : ''
      L.push(...quebrar(`  + ${o.nome_snapshot}${preco}`, largura))
    }
    if (i.observacao) L.push(...quebrar(`  Obs: ${i.observacao}`, largura))
  }
  L.push(tracos, duasColunas('Subtotal', formatarValorBr(p.subtotal_centavos), largura))
  if (p.modalidade === 'entrega') L.push(duasColunas('Entrega', formatarValorBr(p.taxa_entrega_centavos), largura))
  L.push(duasColunas('TOTAL', formatarValorBr(p.total_centavos), largura))
  if (p.observacao) L.push(tracos, ...quebrar(`Obs: ${p.observacao}`, largura))
  return L.join('\n')
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export function comandaHtml(p: PedidoDetalheSaida): string {
  const linhas = ativos(p).map((i) => {
    const ops = i.opcoes
      .map((o) => `<li>${esc(o.nome_snapshot)}${o.preco_centavos > 0 ? ` +${esc(formatarValorBr(o.preco_centavos))}` : ''}</li>`)
      .join('')
    const obs = i.observacao ? `<p class="obs">Obs: ${esc(i.observacao)}</p>` : ''
    return `<div class="item"><div class="l"><span>${i.quantidade}x ${esc(i.nome_snapshot)}</span><span>${esc(formatarValorBr(i.total_centavos))}</span></div>${ops ? `<ul>${ops}</ul>` : ''}${obs}</div>`
  })
  const end = enderecoLinha(p).map((l) => `<div>${esc(l)}</div>`).join('')
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido ${esc(p.codigo)}</title>
<style>@page{margin:4mm}body{font-family:monospace;font-size:12px;width:76mm;margin:0}h1{font-size:16px;margin:0}
.l{display:flex;justify-content:space-between}ul{margin:0;padding-left:14px}hr{border:0;border-top:1px dashed #000}
.obs{margin:0}.tot{font-weight:bold}@media print{body{width:auto}}</style></head><body>
<h1>PEDIDO ${esc(p.codigo)}</h1><div>${esc(horaSp(p.criado_em))}</div><div>${p.modalidade === 'retirada' ? 'RETIRADA' : 'ENTREGA'}</div>
${p.cliente?.nome ? `<div>Cliente: ${esc(p.cliente.nome)}</div>` : ''}${end}<hr>${linhas.join('')}<hr>
<div class="l"><span>Subtotal</span><span>${esc(formatarValorBr(p.subtotal_centavos))}</span></div>
${p.modalidade === 'entrega' ? `<div class="l"><span>Entrega</span><span>${esc(formatarValorBr(p.taxa_entrega_centavos))}</span></div>` : ''}
<div class="l tot"><span>TOTAL</span><span>${esc(formatarValorBr(p.total_centavos))}</span></div>
${p.observacao ? `<hr><div>Obs: ${esc(p.observacao)}</div>` : ''}</body></html>`
}
