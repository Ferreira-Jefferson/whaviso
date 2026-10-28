// Editor de UMA loja, em abas (Dialog modal): Perfil (nome + endereco), Entrega (zonas) e
// Horarios (disponibilidade). Perfil monta o payload no formato do contrato e valida com os
// schemas Zod ANTES de enviar (LojaCriarEntrada / LojaAtualizarEntrada); a api revalida.
// Entrega e Horarios operam na LOJA ATIVA do shell (apis escopadas por header x-loja-id): abrir
// o editor torna a loja ativa (selecionarLoja). Numa loja NOVA, Entrega/Horarios so valem depois
// que a loja existe (criar-depois-configurar): cria o perfil, torna a nova loja ativa e libera as
// abas no mesmo editor. Cores/logo (branding) e numeros de WhatsApp tem fluxos proprios.
import { useEffect, useState } from 'react'
import { ApiError } from '@/shared/api_client'
import { useTenant } from '@/shared/tenant'
import { Banner, Button, Dialog, Field, Input, Tabs, useToast, type TabItem } from '@/shared/ui'
import {
  LojaAtualizarEntrada,
  LojaCriarEntrada,
  type LojaSaida as Loja,
} from '@/shared/contracts/_generated/lojas'
import { useAtualizarLoja, useCriarLoja } from '../api'
import { enderecoParaForm, montarEndereco, type EnderecoForm } from '../campos'
import { GestaoEntrega } from '../entrega/GestaoEntrega'
import { PainelDisponibilidade } from '../disponibilidade/Painel'
import { EditorEndereco } from './EditorEndereco'

function mensagemDeIssue(issue: { path: ReadonlyArray<PropertyKey>; message: string }): string {
  const campo = issue.path[0]
  if (campo === 'nome') return 'Informe um nome de 2 a 100 caracteres.'
  if (campo === 'endereco')
    return 'Revise o endereço: rua, número, bairro, cidade, UF (2 letras) e CEP (8 dígitos) são obrigatórios.'
  return 'Revise os campos destacados e tente de novo.'
}

type Aba = 'perfil' | 'entrega' | 'horarios'

export function FormularioLoja({ loja, onFechar }: { loja: Loja | null; onFechar: () => void }) {
  const { lojas, lojaAtiva, selecionarLoja } = useTenant()
  const { mostrarToast } = useToast()

  // Loja em edicao: a loja do prop; numa loja nova, null ate ser criada (criar-depois-configurar).
  const [lojaAtual, setLojaAtual] = useState<Loja | null>(loja)
  const [aba, setAba] = useState<Aba>('perfil')
  // Loja que deve virar ativa (para Entrega/Horarios operarem nela). A selecao so acontece quando
  // a lista de lojas do tenant ja a conhece (apos criar, ela chega pela invalidacao de ['lojas']).
  const [alvoSelecao, setAlvoSelecao] = useState<string | null>(loja?.id ?? null)

  useEffect(() => {
    if (alvoSelecao && lojas.some((l) => l.id === alvoSelecao)) selecionarLoja(alvoSelecao)
  }, [alvoSelecao, lojas, selecionarLoja])

  // Entrega/Horarios so renderizam quando a loja em edicao JA e a ativa do shell (senao as apis
  // escopadas por header consultariam a loja errada).
  const prontaParaConfig = lojaAtual != null && lojaAtiva?.id === lojaAtual.id

  const criar = useCriarLoja()
  const atualizar = useAtualizarLoja()
  const salvando = criar.isPending || atualizar.isPending

  const [nome, setNome] = useState(loja?.nome ?? '')
  const [endereco, setEndereco] = useState<EnderecoForm>(() => enderecoParaForm(loja?.endereco ?? null))
  const [erro, setErro] = useState<string | null>(null)

  function aoEnviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    const nomeLimpo = nome.trim()
    const enderecoDto = montarEndereco(endereco)

    if (lojaAtual) {
      const corpo = { nome: nomeLimpo, endereco: enderecoDto }
      const r = LojaAtualizarEntrada.safeParse(corpo)
      if (!r.success) return setErro(mensagemDeIssue(r.error.issues[0]!))
      atualizar.mutate(
        { id: lojaAtual.id, body: r.data },
        {
          onSuccess: (atualizada) => {
            setLojaAtual(atualizada)
            mostrarToast('Perfil da loja salvo.', { tom: 'sucesso' })
          },
          onError: (e2) => setErro(e2 instanceof ApiError ? e2.message : 'Não foi possível salvar a loja.'),
        },
      )
      return
    }

    const corpo = {
      nome: nomeLimpo,
      ...(enderecoDto ? { endereco: enderecoDto } : {}),
    }
    const r = LojaCriarEntrada.safeParse(corpo)
    if (!r.success) return setErro(mensagemDeIssue(r.error.issues[0]!))
    criar.mutate(r.data, {
      onSuccess: (nova) => {
        // Criar-depois-configurar: passa para modo edicao, torna a nova loja ativa (quando a lista
        // do tenant a conhecer) e libera Entrega/Horarios no mesmo editor.
        setLojaAtual(nova)
        setAlvoSelecao(nova.id)
        mostrarToast('Loja criada. Agora configure a entrega e os horários.', { tom: 'sucesso' })
      },
      onError: (e2) => setErro(e2 instanceof ApiError ? e2.message : 'Não foi possível criar a loja.'),
    })
  }

  const dicaConfig = (
    <div className="rounded-card border border-linha bg-papel-2 p-4 text-sm text-tinta-2">
      Salve o perfil para configurar a entrega e os horários desta loja.
    </div>
  )

  const preparando = (
    <div className="rounded-card border border-linha bg-papel-2 p-4 text-sm text-tinta-2">Preparando a loja...</div>
  )

  const painelPerfil = (
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

      <section className="flex flex-col gap-3 border-t border-linha pt-6">
        <div>
          <h3 className="font-display text-base font-semibold text-tinta">Endereço</h3>
          <p className="mt-0.5 text-xs text-tinta-2">Onde a loja fica. Deixe em branco se não quiser informar.</p>
        </div>
        <EditorEndereco valor={endereco} onChange={setEndereco} />
      </section>

      <div className="flex flex-col-reverse gap-2 border-t border-linha pt-6 sm:flex-row sm:justify-end">
        <Button type="button" variante="secondary" onClick={onFechar} disabled={salvando}>
          {lojaAtual ? 'Fechar' : 'Cancelar'}
        </Button>
        <Button type="submit" loading={salvando}>
          {lojaAtual ? 'Salvar perfil' : 'Criar loja'}
        </Button>
      </div>
    </form>
  )

  const itens: TabItem[] = [
    { id: 'perfil', rotulo: 'Perfil', conteudo: painelPerfil },
    {
      id: 'entrega',
      rotulo: 'Entrega',
      conteudo: lojaAtual == null ? dicaConfig : prontaParaConfig ? <GestaoEntrega /> : preparando,
    },
    {
      id: 'horarios',
      rotulo: 'Horários',
      conteudo:
        lojaAtual == null ? dicaConfig : prontaParaConfig ? <PainelDisponibilidade nomeLoja={lojaAtual.nome} /> : preparando,
    },
  ]

  return (
    <Dialog
      aberto
      onFechar={salvando ? () => undefined : onFechar}
      titulo={lojaAtual ? 'Editar loja' : 'Nova loja'}
      className="max-h-[88vh] max-w-3xl overflow-y-auto"
    >
      <Tabs itens={itens} ativa={aba} aoMudar={(id) => setAba(id as Aba)} ariaLabel="Seções da loja" />
    </Dialog>
  )
}
