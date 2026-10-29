// Console do operador: Acessos. Grade permissao x papel (Console e Loja). O admin liga/desliga
// celulas e salva; o servidor decide e a tela edita a mesma grade. Papel fixo (admin/dono) e
// permissao travada (acessos:gerir) nao sao editaveis.
import { useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { ApiError } from '@/shared/api_client'
import { Badge, Banner, Button, Card, ErrorState, PageHeader, Skeleton, Switch, useToast } from '@/shared/ui'
import { useAcessos, useSalvarAcessos } from '../api'
import type { AcessosSaida, EscopoAcesso, PermissaoDTO } from '../schemas'

const ROTULO_PAPEL: Record<string, string> = {
  convidado: 'Convidado',
  suporte: 'Suporte',
  financeiro: 'Financeiro',
  operador: 'Operador',
  admin: 'Admin',
  atendente: 'Atendente',
  gerente: 'Gerente',
  dono: 'Dono',
}

const GRUPOS: ReadonlyArray<{ escopo: EscopoAcesso; titulo: string; descricao: string }> = [
  { escopo: 'console', titulo: 'Console da plataforma', descricao: 'Equipe Whaviso: o que cada papel faz no console.' },
  { escopo: 'loja', titulo: 'Loja', descricao: 'Membros do restaurante: o que cada papel faz na loja.' },
]

const chaveCelula = (escopo: string, papel: string, permissao: string) => `${escopo}|${papel}|${permissao}`

function mensagem(e: unknown, padrao: string): string {
  return e instanceof ApiError ? e.message : padrao
}

interface GrupoProps {
  escopo: EscopoAcesso
  titulo: string
  descricao: string
  dados: AcessosSaida
  /** Valor efetivo de cada celula (servidor + rascunho). */
  valor: (escopo: string, papel: string, permissao: string) => boolean
  alterado: (escopo: string, papel: string, permissao: string) => boolean
  aoMudar: (escopo: EscopoAcesso, papel: string, permissao: string, permitido: boolean) => void
  desabilitado: boolean
}

function GrupoGrade({ escopo, titulo, descricao, dados, valor, alterado, aoMudar, desabilitado }: GrupoProps) {
  const papeis = dados.papeis[escopo]
  const fixo = dados.fixos[escopo]
  const permissoes = dados.permissoes.filter((p: PermissaoDTO) => p.escopo === escopo)
  return (
    <Card className="p-0">
      <div className="border-b border-linha px-5 py-4">
        <h2 className="text-lg font-bold text-tinta">{titulo}</h2>
        <p className="mt-0.5 text-sm text-tinta-2">{descricao}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption className="sr-only">{`Permissões por papel: ${titulo}`}</caption>
          <thead>
            <tr className="border-b border-linha text-xs uppercase tracking-wider text-tinta-2">
              <th scope="col" className="px-5 py-3 font-bold">Permissão</th>
              {papeis.map((papel) => (
                <th key={papel} scope="col" className="px-3 py-3 text-center font-bold">
                  {ROTULO_PAPEL[papel] ?? papel}
                  {papel === fixo && <span className="block text-[10px] font-medium normal-case tracking-normal">sempre tudo</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissoes.map((p) => (
              <tr key={p.chave} className="border-b border-linha last:border-b-0">
                <th scope="row" className="px-5 py-2 font-medium text-tinta">
                  {p.rotulo}
                  {p.travada && <Badge tom="neutro" className="ml-2">só admin</Badge>}
                </th>
                {papeis.map((papel) => {
                  const travada = papel === fixo || p.travada
                  const ligado = valor(escopo, papel, p.chave)
                  return (
                    <td key={papel} className={alterado(escopo, papel, p.chave) ? 'bg-ambar-claro text-center' : 'text-center'}>
                      <Switch
                        ligado={ligado}
                        disabled={travada || desabilitado}
                        rotulo={`${ROTULO_PAPEL[papel] ?? papel}: ${p.rotulo}`}
                        onMudar={(v) => aoMudar(escopo, papel, p.chave, v)}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export default function Acessos() {
  const consulta = useAcessos()
  const salvar = useSalvarAcessos()
  const { mostrarToast } = useToast()
  /** Rascunho: so celulas diferentes do servidor. */
  const [rascunho, setRascunho] = useState<Map<string, boolean>>(new Map())

  const base = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const c of consulta.data?.grade ?? []) m.set(chaveCelula(c.escopo, c.papel, c.permissao), c.permitido)
    return m
  }, [consulta.data])

  const valor = (escopo: string, papel: string, permissao: string) => {
    const k = chaveCelula(escopo, papel, permissao)
    return rascunho.get(k) ?? base.get(k) ?? false
  }
  const alterado = (escopo: string, papel: string, permissao: string) => rascunho.has(chaveCelula(escopo, papel, permissao))

  const aoMudar = (escopo: EscopoAcesso, papel: string, permissao: string, permitido: boolean) => {
    const k = chaveCelula(escopo, papel, permissao)
    setRascunho((atual) => {
      const novo = new Map(atual)
      if (base.get(k) === permitido) novo.delete(k)
      else novo.set(k, permitido)
      return novo
    })
  }

  const aoSalvar = () => {
    const celulas = [...rascunho.entries()].map(([k, permitido]) => {
      const [escopo, papel, permissao] = k.split('|') as [EscopoAcesso, string, string]
      return { escopo, papel, permissao, permitido }
    })
    salvar.mutate(celulas, {
      onSuccess: (n) => {
        setRascunho(new Map())
        mostrarToast(n === 1 ? 'Alteração salva.' : `${n} alterações salvas.`, { tom: 'sucesso' })
      },
      onError: (e) => mostrarToast(mensagem(e, 'Não foi possível salvar. Confira a grade e tente de novo.'), { tom: 'erro' }),
    })
  }

  if (consulta.isError) {
    const proibido = consulta.error instanceof ApiError && consulta.error.isForbidden
    return proibido ? (
      <ErrorState titulo="Acesso restrito ao admin" descricao="Só o admin da plataforma gerencia os acessos." />
    ) : (
      <ErrorState aoTentarDeNovo={() => void consulta.refetch()} />
    )
  }

  const pendentes = rascunho.size
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Acessos"
        descricao="Defina o que cada papel pode fazer. A grade vale para todas as contas."
        acoes={
          <>
            <Button variante="secondary" disabled={pendentes === 0 || salvar.isPending} onClick={() => setRascunho(new Map())}>
              Descartar
            </Button>
            <Button disabled={pendentes === 0} loading={salvar.isPending} onClick={aoSalvar}>
              {pendentes > 0 ? `Salvar (${pendentes})` : 'Salvar'}
            </Button>
          </>
        }
      />
      <Banner tom="info">
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-4 flex-none" aria-hidden />
          Admin e Dono sempre têm tudo e não podem ser alterados. A gestão de acessos é só do admin.
        </span>
      </Banner>
      {consulta.isPending || !consulta.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        GRUPOS.map((g) => (
          <GrupoGrade
            key={g.escopo}
            {...g}
            dados={consulta.data}
            valor={valor}
            alterado={alterado}
            aoMudar={aoMudar}
            desabilitado={salvar.isPending}
          />
        ))
      )}
    </div>
  )
}
