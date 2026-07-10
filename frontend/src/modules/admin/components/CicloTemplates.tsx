// CicloTemplates: a seção do ciclo na tela /admin/templates como TRILHA
// (assinatura do app), não uma lista de cards. As 4 etapas (D-2 → D-1 → D → D+1)
// viram nós conectados; cada nó leva ao editor unificado da etapa
// (/admin/mensagens/ciclo.<etapa>).
//
// NÃO é o CycleTimeline do shared (aquele é data-driven por `Envio` reais de um
// aviso). Este é próprio do admin e moldado pelos templates unificados (chave
// 'ciclo.<etapa>', contexto padrao): versão ativa, propostas, ou sem versão.
//
// Dentro do nó vai só o código curto (D-2, D-1, D, D+1), extraído da MESMA
// fonte de rótulos (ROTULO_ETAPA, "D-2 · aviso antecipado") para não duplicar
// linguagem; o trecho descritivo fica embaixo. Linguagem das Regras de Ouro.
import { Link } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { ROTULO_ETAPA } from '@/shared/format'
import { etapaEnvio, type EtapaEnvio, type Template } from '@/shared/contracts'
import { cn } from '@/shared/ui'
import { situacaoTemplate } from '../situacao_template'

const ETAPAS = etapaEnvio.options

// Situação de uma etapa no catálogo (deriva do array de templates da etapa).
// 'ativo'/'vazio' são conceitos da etapa; os demais espelham a situação real do
// template (situacao_template), para a trilha distinguir "não enviado à Meta" de
// "em análise" e "recusado".
type Situacao = 'ativo' | 'em_analise' | 'rascunho' | 'rejeitado' | 'vazio'

// Família visual por situação. Espelha a paleta do CycleTimeline (verde = no ar,
// âmbar = em análise, terroso = recusado, cinza = inerte/não enviado), mantendo o
// tom calmo (sem alarme).
const COR_NODE: Record<Situacao, string> = {
  ativo: 'bg-salvia-claro border-folha text-folha',
  em_analise: 'bg-ambar-claro border-ambar text-ambar',
  rascunho: 'bg-papel-2 border-tinta-2 text-tinta-2',
  rejeitado: 'bg-papel-2 border-barro text-barro',
  vazio: 'bg-papel-2 border-linha text-cinza-expirado',
}

const COR_LINHA: Record<Situacao, string> = {
  ativo: 'bg-folha/40',
  em_analise: 'bg-ambar/40',
  rascunho: 'bg-tinta-2/30',
  rejeitado: 'bg-barro/40',
  vazio: 'bg-linha',
}

// Cor do texto de status embaixo do nó, por situação (mesma paleta dos nós).
const COR_TEXTO: Record<Situacao, string> = {
  ativo: 'text-folha',
  em_analise: 'text-ambar',
  rascunho: 'text-tinta-2',
  rejeitado: 'text-barro',
  vazio: 'text-tinta-2',
}

// Código curto (D-2) + descrição (aviso antecipado) da MESMA fonte de rótulos.
function partesEtapa(etapa: EtapaEnvio): { codigo: string; descricao: string } {
  const [codigo, descricao] = ROTULO_ETAPA[etapa].split(' · ')
  return { codigo: codigo ?? ROTULO_ETAPA[etapa], descricao: descricao ?? '' }
}

interface InfoEtapa {
  etapa: EtapaEnvio
  situacao: Situacao
  versaoAtiva: number | null
  // Quantas versões estão na situação vencedora (para o texto "N em análise", etc.).
  contagem: number
}

function resumoEtapa(etapa: EtapaEnvio, templates: Template[]): InfoEtapa {
  // Conta só o contexto 'padrao' (a variante 'revisao' é editada à parte).
  const daEtapa = templates.filter((t) => t.chave === `ciclo.${etapa}` && t.contexto === 'padrao')
  // "No ar" (verde) exige a versão ativa E aprovada na Meta; sem aprovação o envio
  // fica gated (E12), então a etapa mostra o estado da proposta, não "no ar".
  const noAr = daEtapa.find((t) => t.ativo && t.status_meta === 'aprovado') ?? null
  if (noAr) return { etapa, situacao: 'ativo', versaoAtiva: noAr.versao, contagem: 0 }
  if (daEtapa.length === 0) return { etapa, situacao: 'vazio', versaoAtiva: null, contagem: 0 }
  // Sem versão no ar, resume pela situação que MAIS pede atenção do owner:
  // rejeitado (corrigir e reenviar) > em_analise (só esperar) > rascunho (enviar).
  const situacoes = daEtapa.map(situacaoTemplate)
  const situacao: Situacao = situacoes.includes('rejeitado')
    ? 'rejeitado'
    : situacoes.includes('em_analise')
      ? 'em_analise'
      : 'rascunho'
  const contagem = situacoes.filter((s) => s === situacao).length
  return { etapa, situacao, versaoAtiva: null, contagem }
}

function textoStatus(info: InfoEtapa): string {
  const plural = info.contagem === 1 ? '' : 's'
  switch (info.situacao) {
    case 'ativo':
      return `Ativo · v${info.versaoAtiva}`
    case 'em_analise':
      return `${info.contagem} em análise na Meta`
    case 'rascunho':
      return `${info.contagem} não enviada${plural} à Meta`
    case 'rejeitado':
      return `${info.contagem} recusada${plural} pela Meta`
    case 'vazio':
      return 'Sem versão ainda'
  }
}

function rotuloAria(info: InfoEtapa, descricao: string): string {
  return `${ROTULO_ETAPA[info.etapa]}, ${descricao}. ${textoStatus(info)}. Configurar esta etapa.`
}

interface CicloTemplatesProps {
  templates: Template[]
  className?: string
}

export function CicloTemplates({ templates, className }: CicloTemplatesProps) {
  const infos = ETAPAS.map((e) => resumoEtapa(e, templates))

  return (
    <ol
      className={cn('flex flex-col gap-0 sm:flex-row sm:gap-0', className)}
      aria-label="Ciclo de templates do lembrete"
    >
      {infos.map((info, i) => {
        const { codigo, descricao } = partesEtapa(info.etapa)
        const ehUltimo = i === infos.length - 1
        return (
          <li
            key={info.etapa}
            className="relative flex flex-1 pb-9 last:pb-0 sm:pb-0"
          >
            {/* Conector até o próximo nó: vertical no mobile, horizontal no sm+.
                Cor herda a situação DESTA etapa. Atrás do nó, sem capturar clique. */}
            {!ehUltimo && (
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute left-[31px] top-16 h-[calc(100%-4rem)] w-0.5 sm:left-[calc(50%+2rem)] sm:top-[31px] sm:h-0.5 sm:w-[calc(100%-4rem)]',
                  COR_LINHA[info.situacao],
                )}
              />
            )}

            <Link
              to={`/admin/mensagens/ciclo.${info.etapa}`}
              aria-label={rotuloAria(info, descricao)}
              className="group relative z-10 flex flex-1 items-start gap-4 rounded-card px-1 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-salvia sm:flex-col sm:items-center sm:gap-3 sm:text-center"
            >
              <span
                className={cn(
                  'flex size-16 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg font-semibold tracking-tight transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_8px_20px_-8px_rgba(30,77,59,0.35)]',
                  COR_NODE[info.situacao],
                )}
              >
                {codigo}
              </span>

              <span className="min-w-0 sm:flex sm:flex-col sm:items-center">
                <span className="block text-sm font-medium text-tinta">{descricao}</span>
                <span className={cn('mt-0.5 block text-xs', COR_TEXTO[info.situacao])}>
                  {textoStatus(info)}
                </span>
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-tinta-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Configurar
                  <ArrowRight strokeWidth={1.75} className="size-3" />
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
