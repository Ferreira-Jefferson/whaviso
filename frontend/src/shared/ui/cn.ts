import { twMerge } from 'tailwind-merge'

/**
 * Junta classes condicionais e resolve conflitos do Tailwind (o ultimo utilitario do
 * mesmo grupo vence). Sem isso, um `className` que sobrescreve um utilitario base do
 * componente (ex.: `max-w-2xl` sobre um `max-w-sm`) nao tinha efeito e a tela quebrava.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return twMerge(classes.filter(Boolean).join(' '))
}
