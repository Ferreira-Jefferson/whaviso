// Formulario de perfil da loja (criar ou editar): nome, endereco, horarios e area de entrega.
// Monta o payload no formato do contrato e valida com os schemas Zod ANTES de enviar
// (LojaCriarEntrada / LojaAtualizarEntrada); a api valida de novo no servidor.
// Cores/logo (branding) e numeros de WhatsApp tem fluxos proprios (fora deste formulario).
import { useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { Banner, Button, Dialog, Field, Input } from '@/shared/ui'
import {
  LojaAtualizarEntrada,
  LojaCriarEntrada,
  type LojaSaida as Loja,
} from '@/shared/contracts/_generated/lojas'
import { useAtualizarLoja, useCriarLoja } from '../api'
import {
  AREA_VAZIA,
  areaParaForm,
  enderecoParaForm,
  montarArea,
  montarEndereco,
  type AreaForm,
  type EnderecoForm,
} from '../campos'
import { EditorEndereco } from './EditorEndereco'
import { EditorAreaEntrega } from './EditorAreaEntrega'

function mensagemDeIssue(issue: { path: ReadonlyArray<PropertyKey>; message: string }): string {
  const campo = issue.path[0]
  if (campo === 'nome') return 'Informe um nome de 2 a 100 caracteres.'
  if (campo === 'endereco')
    return 'Revise o endereço: rua, número, bairro, cidade, UF (2 letras) e CEP (8 dígitos) são obrigatórios.'
  if (campo === 'area_entrega')
    return issue.message === 'bairros repetidos'
      ? 'Há bairros repetidos na área de entrega.'
      : 'Revise a área de entrega: raio entre 0 e 50 km e coordenadas válidas.'
  return 'Revise os campos destacados e tente de novo.'
}

export function FormularioLoja({ loja, onFechar }: { loja: Loja | null; onFechar: () => void }) {
  const ehEdicao = loja != null
  const criar = useCriarLoja()
  const atualizar = useAtualizarLoja()
  const salvando = criar.isPending || atualizar.isPending

  const [nome, setNome] = useState(loja?.nome ?? '')
  const [endereco, setEndereco] = useState<EnderecoForm>(() => enderecoParaForm(loja?.endereco ?? null))
  const [area, setArea] = useState<AreaForm>(() => (loja ? areaParaForm(loja.area_entrega) : { ...AREA_VAZIA }))
  const [erro, setErro] = useState<string | null>(null)

  function aoEnviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const nomeLimpo = nome.trim()
    const enderecoDto = montarEndereco(endereco)
    const areaDto = montarArea(area)

    if (ehEdicao) {
      const corpo = { nome: nomeLimpo, endereco: enderecoDto, area_entrega: areaDto }
      const r = LojaAtualizarEntrada.safeParse(corpo)
      if (!r.success) return setErro(mensagemDeIssue(r.error.issues[0]!))
      atualizar.mutate(
        { id: loja!.id, body: r.data },
        { onSuccess: onFechar, onError: (e2) => setErro(e2 instanceof ApiError ? e2.message : 'Não foi possível salvar a loja.') },
      )
      return
    }

    const corpo = {
      nome: nomeLimpo,
      ...(enderecoDto ? { endereco: enderecoDto } : {}),
      ...(areaDto ? { area_entrega: areaDto } : {}),
    }
    const r = LojaCriarEntrada.safeParse(corpo)
    if (!r.success) return setErro(mensagemDeIssue(r.error.issues[0]!))
    criar.mutate(r.data, {
      onSuccess: onFechar,
      onError: (e2) => setErro(e2 instanceof ApiError ? e2.message : 'Não foi possível criar a loja.'),
    })
  }

  return (
    <Dialog
      aberto
      onFechar={salvando ? () => undefined : onFechar}
      titulo={ehEdicao ? 'Editar loja' : 'Nova loja'}
      className="max-h-[88vh] max-w-2xl overflow-y-auto"
    >
      <form onSubmit={aoEnviar} className="flex flex-col gap-6 text-left">
        {erro && <Banner tom="erro">{erro}</Banner>}

        <Field label="Nome da loja">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Cantina da Praça"
            maxLength={100}
            autoComplete="off"
            autoFocus
          />
        </Field>

        <Secao titulo="Endereço" descricao="Onde a loja fica. Deixe em branco se não quiser informar.">
          <EditorEndereco valor={endereco} onChange={setEndereco} />
        </Secao>

        <Secao titulo="Área de entrega" descricao="Até onde a loja entrega, por raio ou por bairro.">
          <EditorAreaEntrega
            valor={area}
            onChange={setArea}
            endereco={{
              logradouro: endereco.logradouro,
              numero: endereco.numero,
              bairro: endereco.bairro,
              cidade: endereco.cidade,
              uf: endereco.uf,
              cep: endereco.cep,
            }}
          />
        </Secao>

        <div className="flex flex-col-reverse gap-2 border-t border-linha pt-6 sm:flex-row sm:justify-end">
          <Button type="button" variante="secondary" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button type="submit" loading={salvando}>
            {ehEdicao ? 'Salvar' : 'Criar loja'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-linha pt-6">
      <div>
        <h3 className="font-display text-base font-semibold text-tinta">{titulo}</h3>
        <p className="mt-0.5 text-xs text-tinta-2">{descricao}</p>
      </div>
      {children}
    </section>
  )
}
