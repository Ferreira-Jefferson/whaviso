import { cn } from './cn'

// Logo da marca: o sino (lucide bell) dentro de um circulo vazado.
// Usa currentColor para herdar a cor pela classe (ex.: text-dourado), igual
// aos icones do lucide. Espelha o public/bell.svg usado como favicon.
export function BellLogo({
  className,
  strokeWidth = 1.75,
}: {
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="-4 -5.85 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(className)}
    >
      <circle cx="12" cy="10.15" r="15" />
      <path d="M10.7 1.15a1.3 1.3 0 0 1 2.6 0" />
      <path d="M10.15 19.2a2 2 0 0 0 3.7 0" />
      <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
    </svg>
  )
}
