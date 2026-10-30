// Nova execucao: escolhe suite e loja-alvo (credencial e base de conhecimento que a execucao usa),
// com modelo/provedor opcionais e config (modelo avaliador, k da recuperacao). Ao enfileirar, a
// pagina leva para o detalhe da execucao.
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Select, Skeleton, useToast } from '@/shared/ui'
import type { EvalExecucaoCriar } from '@/shared/contracts/_generated/plataforma_evals'
import { useCriarExecucao, useLojasAlvo, useSuites } from '../api'
import { ROTULO_TIPO } from '../rotulos'
import { AreaErro } from './AreaErro'

export function NovaExecucaoDialog({
  aberto,
  aoFechar,
  suiteInicial,
  aoCriada,
}: {
  aberto: boolean
  aoFechar: () => void
  suiteInicial: string | null
  aoCriada: (execucaoId: string) => void
}) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo="Nova execução" className="max-w-md">
      {aberto && <FormExecucao suiteInicial={suiteInicial} aoFechar={aoFechar} aoCriada={aoCriada} />}
    </Dialog>
  )
}

function FormExecucao({ suiteInicial, aoFechar, aoCriada }: { suiteInicial: string | null; aoFechar: () => void; aoCriada: (id: string) => void }) {
  const suites = useSuites()
  const lojas = useLojasAlvo()
  const criar = useCriarExecucao()
  const { mostrarToast } = useToast()
  const [suiteId, setSuiteId] = useState(suiteInicial ?? '')
  const [lojaId, setLojaId] = useState('')
  const [modelo, setModelo] = useState('')
  const [provedor, setProvedor] = useState('')
  const [judge, setJudge] = useState('')
  const [k, setK] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  if (suites.isError) return <AreaErro erro={suites.error} aoTentarDeNovo={() => void suites.refetch()} />
  if (lojas.isError) return <AreaErro erro={lojas.error} aoTentarDeNovo={() => void lojas.refetch()} />
  if (suites.isPending || lojas.isPending) return <Skeleton className="h-40 w-full" />

  const ativas = suites.data.filter((s) => s.ativo)
  const opcoesSuite = [
    { value: '', label: 'Escolha a suite' },
    ...ativas.map((s) => ({ value: s.id, label: `${s.nome} (${ROTULO_TIPO[s.tipo]})` })),
  ]
  const opcoesLoja = [{ value: '', label: 'Escolha a loja-alvo' }, ...lojas.data.map((l) => ({ value: l.id, label: l.nome }))]

  const enfileirar = () => {
    if (suiteId === '') return setErro('Escolha a suite.')
    if (lojaId === '') return setErro('Escolha a loja-alvo.')
    const kNum = k.trim() === '' ? undefined : Number(k)
    if (kNum !== undefined && (!Number.isInteger(kNum) || kNum < 1 || kNum > 50)) return setErro('O k deve ser um inteiro de 1 a 50.')
    setErro(null)
    const config: Record<string, unknown> = {}
    if (judge.trim() !== '') config.judgeModelo = judge.trim()
    if (kNum !== undefined) config.k = kNum
    const body: EvalExecucaoCriar = {
      suiteId,
      lojaAlvoId: lojaId,
      modelo: modelo.trim() || undefined,
      provedor: provedor.trim() || undefined,
      config: Object.keys(config).length > 0 ? config : undefined,
    }
    criar.mutate(body, {
      onSuccess: (e) => {
        mostrarToast('Execução enfileirada.', { tom: 'sucesso' })
        aoFechar()
        aoCriada(e.id)
      },
      onError: (e) => setErro(e instanceof ApiError ? e.message : 'Não foi possível enfileirar a execução.'),
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        enfileirar()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Suite</span>
        <Select ariaLabel="Suite" value={suiteId} onChange={setSuiteId} options={opcoesSuite} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Loja-alvo</span>
        <Select ariaLabel="Loja-alvo" value={lojaId} onChange={setLojaId} options={opcoesLoja} />
        <span className="text-xs text-tinta-2">Define a chave de IA e a base de conhecimento usadas na execução.</span>
      </div>
      <Field label="Modelo" dica="Opcional. Vazio usa o modelo configurado na loja-alvo.">
        <Input value={modelo} onChange={(e) => setModelo(e.target.value)} maxLength={120} autoComplete="off" spellCheck={false} />
      </Field>
      <Field label="Provedor" dica="Opcional. Vazio usa o provedor configurado na loja-alvo.">
        <Input value={provedor} onChange={(e) => setProvedor(e.target.value)} maxLength={60} autoComplete="off" spellCheck={false} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Modelo avaliador" dica="Opcional. Modelo que julga as respostas (suites com rubrica).">
          <Input value={judge} onChange={(e) => setJudge(e.target.value)} maxLength={120} autoComplete="off" spellCheck={false} />
        </Field>
        <Field label="k da recuperação" dica="Opcional. Quantos documentos entram na conta do acerto (hit@k).">
          <Input inputMode="numeric" value={k} onChange={(e) => setK(e.target.value)} />
        </Field>
      </div>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={criar.isPending}>
          Executar
        </Button>
        <Button type="button" variante="secondary" disabled={criar.isPending} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
