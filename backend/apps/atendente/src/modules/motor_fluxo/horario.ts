// Checagem PURA de janela ativa, em America/Sao_Paulo (dias 0=Dom..6=Sab, inicio/fim 'HH:MM').
// Usada SO pela PROGRAMACAO DE CATEGORIA do cardapio (agendamento de categoria, nao horario de
// loja: o modo do atendente vem da disponibilidade da loja, kernel `@whaviso/shared/disponibilidade`).
// `programacao` null ou de forma desconhecida = categoria sempre visivel (nao bloqueia por config
// ausente/invalida).
import { z } from 'zod'
import { TZ } from '@whaviso/shared/datas'

const Janela = z.object({
  dias: z.array(z.number().int().min(0).max(6)),
  inicio: z.string().regex(/^\d{2}:\d{2}$/),
  fim: z.string().regex(/^\d{2}:\d{2}$/),
})
const Horarios = z.object({ janelas: z.array(Janela) })

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DIAS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
const emMinutos = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

export function lojaAberta(horarios: unknown, agora: Date): boolean {
  const parsed = Horarios.safeParse(horarios)
  if (!parsed.success || parsed.data.janelas.length === 0) return true
  const partes = Object.fromEntries(fmt.formatToParts(agora).map((p) => [p.type, p.value]))
  const dia = DIAS[partes['weekday'] ?? ''] ?? 0
  const minuto = Number(partes['hour']) * 60 + Number(partes['minute'])
  const ontem = (dia + 6) % 7
  return parsed.data.janelas.some((j) => {
    const ini = emMinutos(j.inicio)
    const fim = emMinutos(j.fim)
    if (ini < fim) return j.dias.includes(dia) && minuto >= ini && minuto < fim
    // Janela que cruza a meia-noite (ex.: 18:00 -> 02:00).
    return (j.dias.includes(dia) && minuto >= ini) || (j.dias.includes(ontem) && minuto < fim)
  })
}
