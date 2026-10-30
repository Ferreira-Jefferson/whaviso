// Cria ou edita um caso. Os campos mudam conforme o tipo da suite (ver casoForm.ts).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input, Textarea, useToast } from '@/shared/ui'
import type { EvalCaso, EvalTipo } from '@/shared/contracts/_generated/plataforma_evals'
import { useAtualizarCaso, useCriarCaso } from '../api'
import { FORM_VAZIO, formDeCaso, montarPayload, type FormCaso } from './casoForm'

export function CasoDialog({
  aberto,
  aoFechar,
  suiteId,
  tipo,
  caso,
}: {
  aberto: boolean
  aoFechar: () => void
  suiteId: string
  tipo: EvalTipo
  caso: EvalCaso | null
}) {
  return (
    <Dialog aberto={aberto} onFechar={aoFechar} titulo={caso ? 'Editar caso' : 'Novo caso'} className="max-w-lg">
      {aberto && <FormCasoEval key={caso?.id ?? 'novo'} suiteId={suiteId} tipo={tipo} caso={caso} aoFechar={aoFechar} />}
    </Dialog>
  )
}

function Marca({ rotulo, marcado, aoMudar }: { rotulo: string; marcado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm text-tinta">
      <input type="checkbox" checked={marcado} onChange={(e) => aoMudar(e.target.checked)} className="size-4 accent-salvia" />
      {rotulo}
    </label>
  )
}

function FormCasoEval({ suiteId, tipo, caso, aoFechar }: { suiteId: string; tipo: EvalTipo; caso: EvalCaso | null; aoFechar: () => void }) {
  const [f, setF] = useState<FormCaso>(caso ? formDeCaso(caso) : FORM_VAZIO)
  const [erro, setErro] = useState<string | null>(null)
  const criar = useCriarCaso(suiteId)
  const atualizar = useAtualizarCaso(suiteId)
  const { mostrarToast } = useToast()
  const pendente = criar.isPending || atualizar.isPending
  const set = <K extends keyof FormCaso>(k: K, v: FormCaso[K]) => setF((a) => ({ ...a, [k]: v }))

  if (tipo === 'rag_retrieval') {
    return (
      <div className="flex flex-col gap-4">
        <Banner tom="info">Esta suite usa o conjunto de perguntas e respostas de referência da loja-alvo. Não há casos para adicionar aqui.</Banner>
        <Button variante="secondary" onClick={aoFechar}>
          Fechar
        </Button>
      </div>
    )
  }

  const salvar = () => {
    const r = montarPayload(tipo, f)
    if (!r.ok) return setErro(r.erro)
    setErro(null)
    const opcoes = {
      onSuccess: () => {
        mostrarToast(caso ? 'Caso atualizado.' : 'Caso criado.', { tom: 'sucesso' })
        aoFechar()
      },
      onError: (e: Error) => setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o caso.'),
    }
    if (caso) {
      atualizar.mutate({ id: caso.id, patch: { nome: r.nome, peso: r.peso, entrada: r.entrada, esperado: r.esperado } }, opcoes)
    } else {
      criar.mutate({ nome: r.nome, peso: r.peso, entrada: r.entrada, esperado: r.esperado, origem: 'manual' }, opcoes)
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
      <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
        <Field label="Nome do caso">
          <Input value={f.nome} onChange={(e) => set('nome', e.target.value)} maxLength={120} />
        </Field>
        <Field label="Peso" dica="Quanto este caso pesa no score. Maior que 0, até 100.">
          <Input inputMode="decimal" value={f.peso} onChange={(e) => set('peso', e.target.value)} />
        </Field>
      </div>

      {tipo === 'nlu_intencao' && (
        <>
          <Field label="Mensagem de entrada">
            <Textarea value={f.texto} onChange={(e) => set('texto', e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <Field label="Tipo de intenção esperado" dica="Ex.: pedido, duvida, reclamacao.">
            <Input value={f.nluTipo} onChange={(e) => set('nluTipo', e.target.value)} maxLength={60} />
          </Field>
          <Field label="Itens esperados" dica="Opcional. Um item por linha.">
            <Textarea value={f.nluItens} onChange={(e) => set('nluItens', e.target.value)} rows={3} />
          </Field>
          <Marca rotulo="A mensagem está fora do escopo do atendente" marcado={f.foraDeEscopo} aoMudar={(v) => set('foraDeEscopo', v)} />
        </>
      )}

      {tipo === 'harness_turno' && (
        <>
          <Field label="Mensagem da pessoa">
            <Textarea value={f.texto} onChange={(e) => set('texto', e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <Field label="Persona" dica="Opcional. Como a pessoa se comporta na conversa.">
            <Input value={f.persona} onChange={(e) => set('persona', e.target.value)} maxLength={200} />
          </Field>
          <Field label="Histórico" dica='Opcional. Um turno por linha, no formato "autor: texto".'>
            <Textarea value={f.historico} onChange={(e) => set('historico', e.target.value)} rows={4} placeholder={'cliente: Oi\natendente: Olá!'} />
          </Field>
          <Field label="Desfecho esperado" dica="Opcional.">
            <Input value={f.desfecho} onChange={(e) => set('desfecho', e.target.value)} maxLength={120} />
          </Field>
          <Field label="Rubrica" dica="Opcional. Critérios que o avaliador usa para julgar a resposta.">
            <Textarea value={f.rubrica} onChange={(e) => set('rubrica', e.target.value)} rows={3} maxLength={2000} />
          </Field>
          <div className="flex flex-col">
            <Marca rotulo="Não pode vazar dado sensível" marcado={f.naoVaza} aoMudar={(v) => set('naoVaza', v)} />
            <Marca rotulo="Deve chamar atendimento humano" marcado={f.handoffEsperado} aoMudar={(v) => set('handoffEsperado', v)} />
            <Marca rotulo="Deve manter o escopo (só venda)" marcado={f.scopeLock} aoMudar={(v) => set('scopeLock', v)} />
          </div>
        </>
      )}

      {tipo === 'rag_faithfulness' && (
        <>
          <Field label="Consulta">
            <Textarea value={f.consulta} onChange={(e) => set('consulta', e.target.value)} rows={3} maxLength={4000} />
          </Field>
          <Field label="Rubrica" dica="Opcional. O que a resposta deve (ou não) afirmar com base nos documentos.">
            <Textarea value={f.rubrica} onChange={(e) => set('rubrica', e.target.value)} rows={3} maxLength={2000} />
          </Field>
        </>
      )}

      {erro && <Banner tom="erro">{erro}</Banner>}
      <div className="flex flex-col gap-2">
        <Button type="submit" loading={pendente}>
          {caso ? 'Salvar' : 'Criar caso'}
        </Button>
        <Button type="button" variante="secondary" disabled={pendente} onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
