#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// meta_sink: servidor de CAPTURA da Meta Cloud API, só para DEV.
//
// Por quê: exercitar o pipeline REAL do zap (scheduler → enviarTemplate →
// POST HTTP) sem depender de (a) entrega real ao WhatsApp brasileiro (bloqueada
// até a verificação de empresa, erro 130497) nem (b) templates registrados/
// aprovados na Meta. Aqui o destino é local: recebemos a MESMA requisição que
// o meta_client monta, imprimimos o payload e devolvemos um wamid válido para
// o pipeline completar (marcar 'enviado').
//
// Não é código de produção. Ativa-se SÓ pela env do zap:
//   META_GRAPH_URL=http://localhost:4000   → captura (este servidor)
//   META_GRAPH_URL=https://graph.facebook.com → Meta real
//
// Uso:  node scripts/meta_sink.mjs        (porta 4000; ou PORT=xxxx)
// ─────────────────────────────────────────────────────────────────────────
import { createServer } from 'node:http'

const PORT = Number(process.env.PORT ?? 4000)
let contador = 0

const sep = '─'.repeat(72)

function resumirTemplate(body) {
  // body.template = { name, language:{code}, components:[{type:'body',parameters},{type:'button',...}] }
  const t = body.template
  if (!t) return null
  const corpo = (t.components ?? []).find((c) => c.type === 'body')
  const botoes = (t.components ?? []).filter((c) => c.type === 'button')
  return {
    para: body.to,
    template: t.name,
    idioma: t.language?.code,
    variaveis_corpo: (corpo?.parameters ?? []).map((p) => p.text),
    botoes: botoes.map((b) => ({
      slot: b.index,
      tipo: b.sub_type,
      payload: b.parameters?.[0]?.payload,
    })),
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('meta_sink ok\n')
    return
  }

  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    let body = {}
    try {
      body = JSON.parse(raw)
    } catch {
      // mantém raw
    }
    contador += 1
    const wamid = `wamid.SINK-${contador}-${req.url?.split('/').pop() ?? ''}`

    console.log(`\n${sep}`)
    console.log(`📨  CAPTURA #${contador}   ${req.method} ${req.url}`)
    const resumo = resumirTemplate(body)
    if (resumo) {
      console.log(`    → para:      ${resumo.para}`)
      console.log(`    → template:  ${resumo.template}  (${resumo.idioma})`)
      console.log(`    → variáveis: ${JSON.stringify(resumo.variaveis_corpo)}`)
      console.log(`    → botões:`)
      for (const b of resumo.botoes) {
        console.log(`        [slot ${b.slot}] ${b.tipo} → ${b.payload}`)
      }
    } else if (body.type === 'text') {
      console.log(`    → para: ${body.to}   (texto livre)`)
      console.log(`    → corpo: ${body.text?.body}`)
    }
    console.log(`    ── payload bruto ──`)
    console.log(raw ? JSON.stringify(JSON.parse(raw || '{}'), null, 2) : '(vazio)')
    console.log(`    ✅ respondendo wamid=${wamid}`)
    console.log(sep)

    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(
      JSON.stringify({
        messaging_product: 'whatsapp',
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: wamid }],
      }),
    )
  })
})

server.listen(PORT, () => {
  console.log(`\n🪝  meta_sink escutando em http://localhost:${PORT}`)
  console.log(`    Aponte o zap com: META_GRAPH_URL=http://localhost:${PORT}`)
  console.log(`    Cada lembrete enviado pelo scheduler aparece aqui.\n`)
})
