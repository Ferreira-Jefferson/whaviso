// /app/conta: conta do COBRADOR: perfil (nome, telefone) via GET/PATCH /v1/perfil
// e gerenciador de chaves Pix (N por usuário, 1 padrão) via shared/pix. Reusa helpers
// do shared, sem importar o módulo auth nem o devedor (fronteira do lint). Login é sem
// senha (Google/WhatsApp), então não há troca de senha aqui. Linguagem: só "combinado".
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Star, Trash2 } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  ChavePixInput,
  ConfirmDialog,
  Field,
  Input,
  PageHeader,
  PhoneInput,
  SegmentedControl,
  Spinner,
} from '@/shared/ui'
import { ROTULO_TIPO_CHAVE } from '@/shared/format'
import type { TipoChavePix } from '@/shared/contracts'
import { useAuth, usePerfil, atualizarPerfil, mensagemDeErroAuth } from '@/shared/auth'
import { atualizarTelefone, verificarNovoTelefone } from '@/shared/supabase'
import {
  useChavesPix,
  useAtualizarChavePix,
  useCadastrarChavePix,
  type ChavePix,
} from '@/shared/pix'
import { ApiError } from '@/shared/api_client'
import { perfilFormSchema, type PerfilForm } from '../schemas'

export default function ContaPage() {
  const { status, recarregarPerfil } = useAuth()
  const perfil = usePerfil()

  if (status === 'carregando') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-salvia">
        <Spinner className="size-6" />
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <PageHeader titulo="Minha conta" descricao="Seus dados e acesso." />
      <div className="grid gap-6">
        <FormularioPerfil
          key={perfil?.id ?? 'sem-perfil'}
          onSalvo={recarregarPerfil}
        />
        <GerenciadorChavesPix />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function FormularioPerfil({ onSalvo }: { onSalvo: () => Promise<void> }) {
  const perfil = usePerfil()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Passo de verificação OTP quando o telefone muda.
  const [verificandoPhone, setVerificandoPhone] = useState(false)
  const [codigoPhone, setCodigoPhone] = useState('')
  const [dadosParaSalvar, setDadosParaSalvar] = useState<PerfilForm | null>(null)
  const [salvandoCodigo, setSalvandoCodigo] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PerfilForm>({ resolver: zodResolver(perfilFormSchema) })

  useEffect(() => {
    if (perfil) {
      reset({
        nome: perfil.nome || '',
        telefone: perfil.telefone ?? null,
      })
    }
  }, [perfil, reset])

  async function salvarPerfil(dados: PerfilForm) {
    await atualizarPerfil({ nome: dados.nome, telefone: dados.telefone })
    await onSalvo()
    setFeedback('Dados salvos.')
    setVerificandoPhone(false)
    setDadosParaSalvar(null)
    setCodigoPhone('')
  }

  async function onSubmit(dados: PerfilForm) {
    setFeedback(null)
    setErro(null)
    const phoneChanged = dados.telefone && dados.telefone !== perfil?.telefone
    if (phoneChanged) {
      // Telefone novo: verificar posse via OTP antes de salvar.
      const { error } = await atualizarTelefone(dados.telefone!)
      if (error) {
        setErro(mensagemDeErroAuth(error))
        return
      }
      setDadosParaSalvar(dados)
      setVerificandoPhone(true)
      return
    }
    try {
      await salvarPerfil(dados)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente novamente.')
    }
  }

  async function confirmarCodigo() {
    if (!dadosParaSalvar?.telefone) return
    setErro(null)
    setSalvandoCodigo(true)
    try {
      const { error } = await verificarNovoTelefone(dadosParaSalvar.telefone, codigoPhone)
      if (error) {
        setErro(mensagemDeErroAuth(error))
        return
      }
      await salvarPerfil(dadosParaSalvar)
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente novamente.')
    } finally {
      setSalvandoCodigo(false)
    }
  }

  return (
    <Card>
      <h2 className="mb-1 text-lg text-salvia">Perfil</h2>
      <p className="mb-4 text-sm text-tinta-2">Seu nome aparece nos combinados a receber.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        {feedback && <Banner tom="sucesso">{feedback}</Banner>}
        {erro && <Banner tom="erro">{erro}</Banner>}

        <Field label="Seu nome" erro={errors.nome?.message}>
          <Input autoComplete="name" placeholder="Como devemos te chamar?" {...register('nome')} />
        </Field>

        <Field label="Telefone (opcional)" erro={errors.telefone?.message}>
          <Controller
            control={control}
            name="telefone"
            render={({ field }) => (
              <PhoneInput
                value={field.value}
                onChange={field.onChange}
                autoComplete="tel"
                invalido={Boolean(errors.telefone)}
              />
            )}
          />
        </Field>

        {verificandoPhone && dadosParaSalvar?.telefone && (
          <Field label="Código recebido no WhatsApp">
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={codigoPhone}
                onChange={(e) => setCodigoPhone(e.target.value)}
              />
              <Button
                type="button"
                loading={salvandoCodigo}
                onClick={confirmarCodigo}
              >
                Confirmar
              </Button>
            </div>
            <p className="mt-1 text-xs text-tinta-2">
              Enviamos um código para {dadosParaSalvar.telefone} para confirmar a troca.
            </p>
          </Field>
        )}

        {!verificandoPhone && (
          <div className="flex justify-end pt-1">
            <Button type="submit" loading={isSubmitting}>
              Salvar perfil
            </Button>
          </div>
        )}
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function GerenciadorChavesPix() {
  const { data: chaves, isLoading } = useChavesPix()
  const atualizar = useAtualizarChavePix()
  const { cadastrar, salvando } = useCadastrarChavePix()
  const [erro, setErro] = useState<string | null>(null)
  const [aArquivar, setAArquivar] = useState<ChavePix | null>(null)

  // Estado do form de cadastro (cada tela monta o seu; salvar vem do hook).
  const [tipo, setTipo] = useState<TipoChavePix | ''>('')
  const [chave, setChave] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [titular, setTitular] = useState('')
  const [banco, setBanco] = useState('')
  const [padrao, setPadrao] = useState(false)
  // Aba do card: 'chaves' (lista) | 'cadastrar' (form). null = antes de inicializar.
  const [aba, setAba] = useState<'chaves' | 'cadastrar' | null>(null)

  const lista = chaves ?? []

  // Sem nenhuma chave, abre direto na aba de cadastro; senão, na lista.
  useEffect(() => {
    if (aba !== null || isLoading) return
    setAba(lista.length === 0 ? 'cadastrar' : 'chaves')
  }, [aba, isLoading, lista.length])

  async function adicionar() {
    setErro(null)
    try {
      // sem outras chaves, a primeira vira padrão automaticamente.
      await cadastrar({ tipo, chave, rotulo, titular, banco, padrao: lista.length > 0 ? padrao : true })
      setTipo('')
      setChave('')
      setRotulo('')
      setTitular('')
      setBanco('')
      setPadrao(false)
      setAba('chaves') // mostra a chave recém-adicionada na lista
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível adicionar a chave.')
    }
  }

  async function tornarPadrao(c: ChavePix) {
    setErro(null)
    try {
      await atualizar.mutateAsync({ id: c.id, body: { padrao: true } })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível definir a chave padrão.')
    }
  }

  async function arquivar(c: ChavePix) {
    setErro(null)
    try {
      await atualizar.mutateAsync({ id: c.id, body: { arquivada: true } })
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível remover a chave.')
    } finally {
      setAArquivar(null)
    }
  }

  const abaAtiva = aba ?? 'chaves'

  return (
    <Card>
      <h2 className="mb-1 text-lg text-salvia">Minhas chaves Pix</h2>
      <p className="mb-4 text-sm text-tinta-2">
        Cadastre suas chaves para escolhê-las ao criar um combinado a receber. A padrão
        vem pré-selecionada.
      </p>

      {erro && <Banner tom="erro">{erro}</Banner>}

      <SegmentedControl
        ariaLabel="Seções das chaves Pix"
        value={abaAtiva}
        onChange={(v) => setAba(v as 'chaves' | 'cadastrar')}
        options={[
          { value: 'chaves', label: 'Minhas chaves' },
          { value: 'cadastrar', label: 'Cadastrar' },
        ]}
        className="mb-4"
      />

      {abaAtiva === 'cadastrar' ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nome do titular da chave">
              <Input
                placeholder="Ex.: Maria Silva"
                autoComplete="off"
                value={titular}
                onChange={(e) => setTitular(e.target.value)}
              />
            </Field>
            <Field label="Banco da chave">
              <Input
                placeholder="Ex.: Nubank"
                autoComplete="off"
                value={banco}
                onChange={(e) => setBanco(e.target.value)}
              />
            </Field>
          </div>
          <ChavePixInput
            orientacao="linha"
            tipo={tipo}
            onTipoChange={setTipo}
            chave={chave}
            onChaveChange={setChave}
          />
          <Field label="Apelido (opcional)">
            <Input
              placeholder="Ex.: Nubank, conta principal"
              autoComplete="off"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
            />
          </Field>
          {lista.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-tinta-2">
              <input
                type="checkbox"
                className="size-4 accent-salvia"
                checked={padrao}
                onChange={(e) => setPadrao(e.target.checked)}
              />
              Definir como chave padrão
            </label>
          )}
          <Button
            type="button"
            variante="secondary"
            className="self-end"
            loading={salvando}
            onClick={adicionar}
          >
            Adicionar chave
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-6 text-salvia">
          <Spinner className="size-5" />
        </div>
      ) : lista.length === 0 ? (
        <p className="py-4 text-center text-sm text-tinta-2">Nenhuma chave registrada.</p>
      ) : (
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
          {lista.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-linha px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-tinta">
                    {[c.banco, ROTULO_TIPO_CHAVE[c.tipo]].filter(Boolean).join(' · ')}
                  </span>
                  {c.padrao && (
                    <span className="shrink-0 rounded-full bg-salvia/10 px-2 py-0.5 text-xs text-salvia">
                      padrão
                    </span>
                  )}
                </div>
                {c.titular && (
                  <span className="block truncate text-xs text-tinta-2">{c.titular}</span>
                )}
                <span className="block truncate text-xs text-tinta-2">
                  {c.chave}
                  {c.rotulo ? ` · ${c.rotulo}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!c.padrao && (
                  <Button
                    type="button"
                    variante="ghost"
                    onClick={() => tornarPadrao(c)}
                    disabled={atualizar.isPending}
                  >
                    <Star strokeWidth={1.75} className="size-4" />
                    Tornar padrão
                  </Button>
                )}
                <Button
                  type="button"
                  variante="ghost"
                  onClick={() => setAArquivar(c)}
                  disabled={atualizar.isPending}
                  aria-label="Remover chave"
                >
                  <Trash2 strokeWidth={1.75} className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        aberto={aArquivar !== null}
        titulo="Remover esta chave?"
        textoConfirmar="Sim, remover"
        textoCancelar="Voltar"
        variante="destructive"
        carregando={atualizar.isPending}
        onConfirmar={() => aArquivar && arquivar(aArquivar)}
        onCancelar={() => setAArquivar(null)}
      >
        A chave deixa de aparecer ao criar novos combinados. Combinados já criados não mudam.
      </ConfirmDialog>
    </Card>
  )
}
