// `sql` tagged template: valores interpolados viram SEMPRE parametros ($1, $2, ...), nunca
// texto da query (SEC-080). Para texto dinamico legitimo (nome de coluna de uma lista
// fechada) use `sqlBruto('...')` com literal controlado pelo codigo.
const MARCA = Symbol('whaviso.consulta')

export interface Consulta {
  readonly [MARCA]: true
  readonly text: string
  readonly values: readonly unknown[]
}

export function ehConsulta(v: unknown): v is Consulta {
  return typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[MARCA] === true
}

function montar(text: string, values: unknown[]): Consulta {
  return { [MARCA]: true, text, values }
}

/** Fragmento de SQL literal vindo do codigo (nunca de entrada externa). */
export function sqlBruto(literal: string): Consulta {
  return montar(literal, [])
}

export function sql(partes: TemplateStringsArray, ...valores: unknown[]): Consulta {
  let text = partes[0] ?? ''
  const values: unknown[] = []
  valores.forEach((v, i) => {
    const proximo = partes[i + 1] ?? ''
    if (ehConsulta(v)) {
      // Fragmento aninhado: renumera os placeholders do filho a partir do offset atual.
      const base = values.length
      text += v.text.replace(/\$(\d+)/g, (_, n: string) => `$${Number(n) + base}`)
      values.push(...v.values)
    } else {
      values.push(v)
      text += `$${values.length}`
    }
    text += proximo
  })
  return montar(text, values)
}
