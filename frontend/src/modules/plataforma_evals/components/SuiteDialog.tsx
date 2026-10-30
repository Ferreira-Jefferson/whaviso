// Cria ou edita uma suite. O tipo e imutavel depois de criada (os casos foram validados contra ele).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Select, Textarea, useToast } from '@/shared/ui'
import {
  evalFamilias,
  evalTipos,
  type EvalFamilia,
  type EvalSuite,
  type EvalTipo,
} from '@/shared/contracts/_generated/plataforma_evals'
import { useAtualizarSuite, useCriarSuite } from '../api'
import { ROTULO_FAMILIA, ROTULO_TIPO } from '../rotulos'

const OPCOES_TIPO = evalTipos.map((t) => ({ value: t, label: ROTULO_TIPO[t] }))
const OPCOES_FAMILIA = evalFamilias.map((f) => ({ value: f, label: ROTULO_FAMILIA[f] }))

export function SuiteDialog({ aberto, aoFechar, suite }: { aberto: boolean; aoFechar: () => void; suite: EvalSuite | null }) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo={suite ? 'Editar suite' : 'Nova suite'} className="max-w-md">
      {aberto && <FormSuite key={suite?.id ?? 'nova'} suite={suite} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function FormSuite({ suite, aoFechar }: { suite: EvalSuite | null; aoFechar: () => void }) {
  const [nome, setNome] = useState(suite?.nome ?? '')
  const [tipo, setTipo] = useState<EvalTipo>(suite?.tipo ?? 'nlu_intencao')
  const [familia, setFamilia] = useState<EvalFamilia>(suite?.familia ?? 'capability')
  const [descricao, setDescricao] = useState(suite?.descricao ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarSuite()
  const atualizar = useAtualizarSuite()
  const { mostrarToast } = useToast()
  const pendente = criar.isPending || atualizar.isPending

  const salvar = () => {
    const nomeLimpo = nome.trim()
    if (nomeLimpo === '') return setErro('Informe o nome da suite.')
    setErro(null)
    const opcoes = {
      onSuccess: () => {
        mostrarToast(suite ? 'Suite atualizada.' : 'Suite criada.', { tom: 'sucesso' })
        aoFechar()
      },
      onError: (e: Error) => setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar a suite.'),
    }
    if (suite) {
      atualizar.mutate({ id: suite.id, patch: { nome: nomeLimpo, familia, descricao: descricao.trim() || null } }, opcoes)
    } else {
      criar.mutate({ nome: nomeLimpo, tipo, familia, descricao: descricao.trim() || undefined }, opcoes)
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        salvar()
      }}
    >
      <Field label="Nome">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Tipo</span>
        <Select ariaLabel="Tipo da suite" value={tipo} onChange={setTipo} options={OPCOES_TIPO} disabled={suite != null} />
        {suite && <span className="text-xs text-tinta-2">O tipo não muda depois que a suite é criada.</span>}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-tinta">Família</span>
        <Select ariaLabel="Família da suite" value={familia} onChange={setFamilia} options={OPCOES_FAMILIA} />
      </div>
      <Field label="Descrição" dica="Opcional. Explique o que esta suite mede.">
        <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} rows={3} />
      </Field>
      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={pendente}>
          {suite ? 'Salvar' : 'Criar suite'}
        </Button>
        <Button type="button" variante="secondary" disabled={pendente} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
