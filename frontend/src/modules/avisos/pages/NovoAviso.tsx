import { useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import {
  Banner,
  Button,
  Card,
  DateInput,
  Field,
  InfoHint,
  Input,
  MoneyText,
  PageHeader,
  PhoneInput,
  SegmentedControl,
  Spinner,
  ToastProvider,
  useToast,
  WhatsAppPreview,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type {
  CombinadoPreviewBody,
  CriarAvisoResposta,
  DirecaoAviso,
  EtapaEnvio,
  RecorrenciaInput,
} from '@/shared/contracts'
import { somaItensCentavos } from '@/shared/contracts'
import { usePerfil } from '@/shared/auth'
import { useSemSaldo } from '@/shared/plano'
import { SeletorChavePix } from '@/shared/pix'
import { ROTULO_DIRECAO, dataPtBR, hojeIso, telefone as fmtTelefone } from '@/shared/format'
import {
  useBuscarPessoaPorTelefone,
  useCategorias,
  useCombinadoPreview,
  useCriarAviso,
} from '../api'
import { novoAvisoSchema, MAX_MOTIVO_CARACTERES, type NovoAvisoForm } from '../schemas'
import { AvisoCriado } from '../components/AvisoCriado'
import { RepetirCombinado } from '../components/RepetirCombinado'
import { CadenciaLembretes } from '../components/CadenciaLembretes'
import { ItensPedido } from '../components/ItensPedido'
import { SeletorCategorias } from '../components/SeletorCategorias'

const OPCOES_DIRECAO: ReadonlyArray<{ value: DirecaoAviso; label: string }> = [
  { value: 'receber', label: 'Vou receber' },
  { value: 'pagar', label: 'Vou pagar' },
]

// ToastProvider isolado aqui (não há Provider global de toast ainda): esta é a única
// tela desta wave que consome `useToast`. Ao escopo local, o provider não reseta ao
// trocar para a tela de sucesso (AvisoCriado), porque ele envolve as duas por fora.
export default function NovoAvisoPage() {
  return (
    <ToastProvider>
      <NovoAvisoConteudo />
    </ToastProvider>
  )
}

function NovoAvisoConteudo() {
  const navigate = useNavigate()
  const location = useLocation()
  const criar = useCriarAviso()
  const perfil = usePerfil()
  const { mostrarToast } = useToast()
  // E16 (multi): categorias do usuário, só para exibir os NOMES na revisão. A seleção/criação
  // vive dentro do SeletorCategorias (componente controlado).
  const categorias = useCategorias()
  // E15 H15.5: quando cheguei da tela da pessoa, o nome + telefone vêm por STATE de
  // navegação (nunca na URL, H15.7) e pré-preenchem o formulário.
  const pessoaPrefill = (location.state as { pessoa?: { nome?: string; telefone?: string | null } } | null)
    ?.pessoa
  // E15 H15.6: autocomplete de contato. O 6º dígito nacional liga a busca por prefixo; a
  // sugestão escolhida preenche nome + telefone. Telefone só no corpo do POST (H15.7).
  const [prefixoTel, setPrefixoTel] = useState<string | null>(null)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const sugestoes = useBuscarPessoaPorTelefone(prefixoTel)
  const itensSugestao = sugestoes.data?.itens ?? []
  // E11 H11.2: recorrência, cadência e o envio são UNIVERSAIS (liberados para todos); o
  // único limite é o SALDO de créditos. Lemos o saldo livre só para antecipar o teto do
  // seletor de repetições (cada ocorrência reserva 1 crédito). A AUTORIDADE é o servidor:
  // sem saldo, a ativação volta `saldo_insuficiente` e o form mostra o Banner.
  const { semSaldo, saldoLivre } = useSemSaldo()
  // Teto do nº de repetições = créditos livres da conta (cada ocorrência reserva 1). Quando
  // 0, deixamos undefined (sem teto numérico no seletor; o servidor barra na ativação).
  const enviosDisponiveis = saldoLivre > 0 ? saldoLivre : undefined
  const [resultado, setResultado] = useState<CriarAvisoResposta | null>(null)
  // Revisão do combinado antes de concluir: abre um modal com o resumo + preview da mensagem.
  const [revisando, setRevisando] = useState(false)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [limiteAtingido, setLimiteAtingido] = useState<string | null>(null)
  // E6 H6.10 / E11 H11.2: recorrência e cadência são UNIVERSAIS (liberadas para todos). A
  // cadência é do PRÓPRIO combinado (vale repetindo ou não); a recorrência só multiplica as
  // ocorrências (cada uma reserva 1 crédito). undefined = simples / ciclo completo.
  const [recorrencia, setRecorrencia] = useState<RecorrenciaInput | undefined>(undefined)
  const [cadenciaEtapas, setCadenciaEtapas] = useState<EtapaEnvio[] | undefined>(undefined)
  // Estáveis p/ os efeitos dos filhos não dispararem a cada render.
  const aoMudarRecorrencia = useCallback((v: RecorrenciaInput | undefined) => setRecorrencia(v), [])
  const aoMudarCadencia = useCallback((v: EtapaEnvio[] | undefined) => setCadenciaEtapas(v), [])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<NovoAvisoForm>({
    resolver: zodResolver(novoAvisoSchema),
    defaultValues: {
      direcao: 'receber',
      modo: 'enviar',
      nome_devedor: pessoaPrefill?.nome ?? '',
      motivo: '',
      data_combinada: '',
      telefone_devedor: pessoaPrefill?.telefone ?? null,
      pix_chave: '',
      pix_titular: '',
      pix_banco: '',
      categoria_ids: [],
      // Itens obrigatórios: começa com uma linha vazia (o valor do combinado vem da soma).
      itens: [{ descricao: '', qtd: 1, valor_unit_centavos: 0, produto_id: null }],
    },
  })

  const direcao = watch('direcao')
  // H4.1: o modo (enviar o combinado agora x só salvar) não é mais um seletor à parte;
  // ele é definido pelo botão de ação escolhido na revisão do combinado.
  // Contador ao vivo do "Sobre o quê" (caracteres). O maxLength já trava a digitação
  // em MAX_MOTIVO_CARACTERES; o schema valida por garantia (paste etc.).
  const motivoLen = (watch('motivo') ?? '').length
  const ehReceber = direcao === 'receber'
  // Item 12: os lembretes pelo WhatsApp exigem Pix; sem chave (opcional em agenda/pagar) o
  // seletor de cadência mostra o gate visual.
  const pixPresente = Boolean(watch('pix_chave')?.trim())

  // Cada botão escolhe o modo e dispara o submit. O schema valida conforme o modo
  // (telefone/Pix só obrigatórios ao enviar o combinado), então setamos antes de validar.
  function salvar(modoEscolhido: 'enviar' | 'agenda') {
    setValue('modo', modoEscolhido)
    void handleSubmit(onSubmit)()
  }

  async function onSubmit(dados: NovoAvisoForm) {
    setErroGeral(null)
    setLimiteAtingido(null)
    const pix = dados.pix_chave?.trim() ? dados.pix_chave.trim() : null
    try {
      // receber: o convidado é o devedor. pagar (invertido): EU sou o devedor e o
      // convidado é o cobrador → o nome/telefone do formulário viram os do cobrador,
      // e o nome do devedor é o meu (do perfil).
      const payload = ehReceber
        ? {
            direcao: dados.direcao,
            modo: dados.modo,
            nome_devedor: dados.nome_devedor,
            telefone_devedor: dados.telefone_devedor,
            pix_chave: pix,
            // H2.1: titular + banco obrigatórios no receber (opcionais na agenda).
            pix_titular: dados.pix_titular?.trim() || null,
            pix_banco: dados.pix_banco?.trim() || null,
          }
        : {
            direcao: dados.direcao,
            modo: dados.modo,
            nome_devedor: perfil?.nome?.trim() || 'Eu',
            // Na agenda os dados do cobrador são opcionais (cobrados ao ativar).
            nome_cobrador: dados.nome_devedor?.trim() || null,
            telefone_cobrador: dados.telefone_devedor,
            pix_chave: pix,
          }
      const r = await criar.mutateAsync({
        ...payload,
        motivo: dados.motivo,
        data_combinada: dados.data_combinada,
        // E16 (multi): categorias (0..N). Internas; nunca vão ao devedor.
        categoria_ids: dados.categoria_ids ?? [],
        // Itens obrigatórios: o servidor DERIVA o valor combinado da soma deles.
        itens: dados.itens,
        // E6 H6.10: recorrência (facilitador, todos os planos) + cadência (gated por plano
        // no servidor). undefined = combinado simples / ciclo completo. O servidor é a
        // autoridade: expande as ocorrências e valida vagas/cadência.
        recorrencia: recorrencia ?? null,
        cadencia_etapas: cadenciaEtapas ?? null,
      })
      setResultado(r)
      mostrarToast(dados.modo === 'enviar' ? 'Combinado enviado' : 'Combinado salvo na agenda')
    } catch (e) {
      if (e instanceof ApiError && e.isLimiteDeSaldo) {
        setLimiteAtingido(e.message)
        return
      }
      setErroGeral(
        e instanceof ApiError
          ? e.message
          : 'Não foi possível criar o aviso. Tente novamente.',
      )
    }
  }

  // Tela de sucesso após criar.
  if (resultado) {
    return (
      <AvisoCriado
        resultado={resultado}
        onNovo={() => {
          setResultado(null)
        }}
      />
    )
  }

  return (
    <div className="animate-rise">
      <PageHeader
        titulo="Novo aviso"
        descricao="Combine os detalhes. No fim, envie o combinado ou só salve."
        acoes={
          <Button variante="ghost" onClick={() => navigate('/app')}>
            <ArrowLeft strokeWidth={1.75} className="size-4" />
            Voltar
          </Button>
        }
      />

      <Card className="mx-auto max-w-xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5" noValidate>
          {limiteAtingido && (
            <Banner tom="info">
              {limiteAtingido}{' '}
              <Link to="/app/creditos" className="font-medium underline">
                Recarregar créditos
              </Link>
            </Banner>
          )}
          {erroGeral && <Banner tom="erro">{erroGeral}</Banner>}

          <Field label="Tipo de combinado">
            <Controller
              control={control}
              name="direcao"
              render={({ field }) => (
                <SegmentedControl
                  ariaLabel="Tipo de combinado"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v)
                    // Trocar a direção zera o Pix do form: cada modo (proprias x
                    // externa) tem origem diferente. Sem isso, a chave própria
                    // pré-selecionada em "receber" vazaria para o input de "pagar"
                    // (o seletor remonta via key, mas value vem do form).
                    setValue('pix_chave', '')
                    setValue('pix_titular', '')
                    setValue('pix_banco', '')
                  }}
                  options={OPCOES_DIRECAO}
                  className="self-end"
                />
              )}
            />
          </Field>

          <p className="-mt-2 text-xs text-tinta-2">
            {ehReceber
              ? 'A outra pessoa recebe o combinado no WhatsApp para revisar e confirmar.'
              : 'Quem vai receber recebe o combinado para confirmar; os lembretes chegam para você.'}
          </p>

          <Field
            label={ehReceber ? 'WhatsApp de quem vai pagar' : 'WhatsApp de quem vai receber'}
            dica="Necessário para enviar o combinado. Se já usou esse contato, o nome vem preenchido."
            erro={errors.telefone_devedor?.message}
          >
            <Controller
              control={control}
              name="telefone_devedor"
              render={({ field }) => (
                <div className="relative">
                  <PhoneInput
                    value={field.value}
                    onChange={field.onChange}
                    // H15.6: a partir do 6º dígito nacional, busca contatos já usados por
                    // prefixo (o número vai no corpo do POST, nunca na URL).
                    onDigitos={(nacional, e164Parcial) => {
                      const liga = nacional.length >= 6
                      setPrefixoTel(liga ? e164Parcial : null)
                      setMostrarSugestoes(liga)
                    }}
                    invalido={Boolean(errors.telefone_devedor)}
                  />
                  {mostrarSugestoes && itensSugestao.length > 0 && (
                    <ul
                      className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-input border border-linha bg-cartao py-1 shadow-lg"
                      role="listbox"
                      aria-label="Contatos já usados"
                    >
                      {itensSugestao.map((s) => (
                        <li key={`${s.telefone}:${s.nome}`}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-salvia-claro"
                            onClick={() => {
                              setValue('nome_devedor', s.nome, { shouldValidate: true })
                              field.onChange(s.telefone)
                              setMostrarSugestoes(false)
                              setPrefixoTel(null)
                            }}
                          >
                            <span className="truncate font-medium text-tinta">{s.nome}</span>
                            <span className="shrink-0 text-xs text-tinta-2">{fmtTelefone(s.telefone)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            />
          </Field>

          <Field
            label={ehReceber ? 'Nome de quem vai pagar' : 'Para quem você vai pagar'}
            erro={errors.nome_devedor?.message}
          >
            <Input
              placeholder="Ex.: Maria Silva"
              autoComplete="off"
              {...register('nome_devedor')}
            />
          </Field>

          {/* Campo montado à mão (não via Field) para sobrepor o contador de
              caracteres no canto inferior direito do input. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="campo-motivo" className="flex items-center gap-1.5 text-sm font-medium text-tinta">
              Sobre o quê
              <InfoHint
                texto="Um rótulo curto do combinado (ex.: aluguel de junho). Aparece na mensagem para a outra pessoa."
                rotulo="Sobre: Sobre o quê"
              />
            </label>
            <div className="relative">
              <Input
                id="campo-motivo"
                placeholder="Ex.: aluguel de junho"
                autoComplete="off"
                maxLength={MAX_MOTIVO_CARACTERES}
                invalido={Boolean(errors.motivo)}
                aria-describedby={errors.motivo ? 'campo-motivo-erro' : undefined}
                className="pr-14"
                {...register('motivo')}
              />
              <span className="pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums text-tinta-2">
                {motivoLen}/{MAX_MOTIVO_CARACTERES}
              </span>
            </div>
            {errors.motivo && (
              <p id="campo-motivo-erro" className="text-xs text-barro" role="alert">
                {errors.motivo.message}
              </p>
            )}
          </div>

          {/* Composição do pedido (o que foi vendido): OBRIGATÓRIA (>=1 item). O total dos
              itens É o valor do combinado (derivado; não há mais campo de valor avulso). Só a
              parte de itens é interna: a outra pessoa vê apenas o valor. */}
          <Controller
            control={control}
            name="itens"
            render={({ field }) => (
              <ItensPedido value={field.value} onChange={field.onChange} erro={errors.itens?.message} />
            )}
          />

          {/* E16 (multi): categorias (internas, nunca vão para a outra pessoa) ao lado da data
              combinada (do acordo). A data desceu para cá porque o valor avulso deixou de existir. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Categorias (opcional)"
              dica="Organize por marca ou linha. Pode escolher mais de uma. Não aparece para a outra pessoa."
            >
              <Controller
                control={control}
                name="categoria_ids"
                render={({ field }) => (
                  <SeletorCategorias
                    value={field.value ?? []}
                    onChange={field.onChange}
                    onErro={setErroGeral}
                  />
                )}
              />
              <Link
                to="/app/gestao/categorias"
                className="mt-1 self-start text-xs text-tinta-2 hover:underline"
              >
                Gerenciar categorias
              </Link>
            </Field>

            <Field
              label="Data combinada"
              dica="A data em que vocês combinaram o pagamento. Os lembretes se organizam em torno dela."
              erro={errors.data_combinada?.message}
            >
              {/* Controlado: o DateInput é um calendário próprio; o modo controlado mantém a
                  exibição em sincronia com o react-hook-form. */}
              <Controller
                control={control}
                name="data_combinada"
                render={({ field }) => (
                  <DateInput
                    value={field.value ?? ''}
                    onChange={(e) => field.onChange(e.target.value)}
                    onBlur={field.onBlur}
                    invalido={Boolean(errors.data_combinada)}
                    min={hojeIso()}
                  />
                )}
              />
            </Field>
          </div>

          {/* E6 H6.10: repetir o combinado (recorrência, todos os planos). Recolhido por
              padrão; o padrão segue sendo o combinado único. A data combinada é a âncora
              da 1ª repetição. */}
          <RepetirCombinado
            dataCombinada={watch('data_combinada')}
            maxOcorrencias={enviosDisponiveis}
            onChange={aoMudarRecorrencia}
          />

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-1.5 text-sm font-medium text-tinta">
              {ehReceber ? 'Chave Pix' : 'Chave Pix (opcional)'}
              <InfoHint
                texto={
                  ehReceber
                    ? 'Aparece para a outra pessoa pagar com facilidade.'
                    : 'A chave de quem vai receber. Quem confirmar pode ajustar.'
                }
                rotulo="Sobre: Chave Pix"
              />
            </span>
            <SeletorChavePix
              // remonta ao trocar a direção: limpa seleção/cadastro do modo anterior.
              key={direcao}
              modo={ehReceber ? 'proprias' : 'externa'}
              value={watch('pix_chave') ?? ''}
              onChange={(v) => setValue('pix_chave', v)}
              erro={errors.pix_chave?.message}
              // 0044: titular/banco pertencem à chave; o aviso herda da escolhida.
              onDetalhes={(titular, banco) => {
                setValue('pix_titular', titular)
                setValue('pix_banco', banco)
              }}
            />
          </div>

          {/* E6 H6.10: quais lembretes saem é do PRÓPRIO combinado (vale repetindo ou
              não), por isso fora do "Repetir". Universal (E11 H11.2): liberado para todos.
              Item 12: sem chave Pix (opcional em agenda/pagar) o seletor fica indisponível. */}
          <CadenciaLembretes onChange={aoMudarCadencia} pixPresente={pixPresente} />

          <div className="flex flex-col gap-2 pt-1">
            {/* E11 H11.9: sem saldo, antecipa a CTA de comprar créditos (a api ainda
                barra de fato na ativação; nada do que foi digitado se perde). */}
            {semSaldo && (
              <Banner tom="info">
                Você está sem saldo de envios. Pode salvar na agenda agora e ativar depois;
                para enviar o combinado e os lembretes,{' '}
                <Link to="/app/creditos" className="font-medium underline">
                  recarregue créditos
                </Link>
                .
              </Banner>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variante="ghost"
                onClick={() => navigate('/app')}
              >
                Cancelar
              </Button>
              {/* Concluir valida os campos SEMPRE obrigatórios (itens, nome, WhatsApp, motivo,
                  data) com modo=agenda; o Pix do caminho de envio é validado dentro do modal
                  (guarda de envio). Sem WhatsApp o botão nem habilita: ele identifica a outra
                  pessoa e é obrigatório mesmo na agenda (H4.1). Passando, abre a revisão. */}
              <Button
                type="button"
                variante="primary"
                disabled={watch('telefone_devedor') == null}
                title={
                  watch('telefone_devedor') == null
                    ? 'Informe o WhatsApp de quem combinou.'
                    : undefined
                }
                onClick={async () => {
                  setValue('modo', 'agenda')
                  const ok = await trigger()
                  if (ok) setRevisando(true)
                }}
              >
                Concluir
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {revisando && (
        <RevisarModal
          valores={getValues()}
          categoriaNomes={
            (getValues('categoria_ids') ?? [])
              .map((id) => categorias.data?.find((c) => c.id === id)?.nome)
              .filter((n): n is string => Boolean(n))
          }
          ehReceber={ehReceber}
          salvando={isSubmitting}
          onSalvar={salvar}
          onFechar={() => setRevisando(false)}
          // Item 13: oferece a chave Pix dentro da revisão quando falta (o watch('pix_chave')
          // no form principal faz o form re-renderizar e `valores` refletir a escolha).
          onMudarPixChave={(v) => setValue('pix_chave', v)}
          onMudarPixDetalhes={(titular, banco) => {
            setValue('pix_titular', titular)
            setValue('pix_banco', banco)
          }}
        />
      )}
    </div>
  )
}

// Revisão do combinado antes de concluir (H4.1): resumo do que foi digitado + preview da
// mensagem REAL que a outra pessoa recebe no WhatsApp (renderizada pelo backend). A checkbox
// "Enviar aceite" decide o modo: desmarcada salva na agenda; marcada envia o combinado agora.
// Mesmo padrão de overlay do EditarModal/AtivarModal (DetalheAviso).
function RevisarModal({
  valores,
  categoriaNomes,
  ehReceber,
  salvando,
  onSalvar,
  onFechar,
  onMudarPixChave,
  onMudarPixDetalhes,
}: {
  valores: NovoAvisoForm
  categoriaNomes: string[]
  ehReceber: boolean
  salvando: boolean
  onSalvar: (modo: 'enviar' | 'agenda') => void
  onFechar: () => void
  // Item 13: reportam a escolha da chave Pix embutida para o form principal (react-hook-form),
  // que é a fonte real submetida (o `valores` aqui é só uma leitura pontual via getValues()).
  onMudarPixChave: (chave: string) => void
  onMudarPixDetalhes: (titular: string, banco: string) => void
}) {
  const [enviarAceite, setEnviarAceite] = useState(false)
  const totalCentavos = somaItensCentavos(valores.itens)
  const semPix = !valores.pix_chave?.trim()

  // Item 9: sempre true (não só quando `enviarAceite`). O preview fica cacheado
  // (staleTime: 30s), então quando o usuário marca "Enviar aceite" ele já está pronto.
  const payload: CombinadoPreviewBody | null =
    valores.nome_devedor.trim().length > 0 && totalCentavos > 0
      ? {
          direcao: valores.direcao,
          nome_devedor: valores.nome_devedor,
          valor_centavos: totalCentavos,
          motivo: valores.motivo,
          data_combinada: valores.data_combinada,
          pix_chave: valores.pix_chave || null,
          pix_titular: valores.pix_titular || null,
          pix_banco: valores.pix_banco || null,
        }
      : null
  const preview = useCombinadoPreview(payload, true)

  // Guarda de envio: o WhatsApp já é exigido para chegar até aqui (Concluir bloqueia sem
  // ele), então só falta validar, no receber, o trio Pix (chave+titular+banco).
  const enviarPossivel =
    !ehReceber ||
    Boolean(
      valores.pix_chave?.trim() && valores.pix_titular?.trim() && valores.pix_banco?.trim(),
    )

  // Portal para o body: a página vive dentro de um `.animate-rise` cujo `transform`
  // (fill-mode both) vira bloco de contenção do `position: fixed`, prendendo o overlay
  // ao tamanho do form. No body o `inset-0` cobre a viewport inteira.
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-tinta/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Revisar combinado"
    >
      <Card className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto">
        <h2 className="text-lg text-salvia">Revisar combinado</h2>

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-tinta-2">Tipo</dt>
            <dd className="mt-0.5 text-tinta">{ROTULO_DIRECAO[valores.direcao]}</dd>
          </div>
          <div>
            <dt className="text-tinta-2">Nome</dt>
            <dd className="mt-0.5 text-tinta">{valores.nome_devedor}</dd>
          </div>
          <div>
            <dt className="text-tinta-2">Data combinada</dt>
            <dd className="mt-0.5 text-tinta">{dataPtBR(valores.data_combinada)}</dd>
          </div>
          <div>
            <dt className="text-tinta-2">{categoriaNomes.length > 1 ? 'Categorias' : 'Categoria'}</dt>
            <dd className="mt-0.5 text-tinta">
              {categoriaNomes.length > 0 ? categoriaNomes.join(', ') : 'Sem categoria'}
            </dd>
          </div>
          {valores.telefone_devedor && (
            <div>
              <dt className="text-tinta-2">Telefone</dt>
              <dd className="mt-0.5 text-tinta">{fmtTelefone(valores.telefone_devedor)}</dd>
            </div>
          )}
          {valores.pix_chave?.trim() && (
            <div className="col-span-2">
              <dt className="text-tinta-2">Chave Pix</dt>
              <dd className="mt-0.5 break-all text-tinta">{valores.pix_chave}</dd>
            </div>
          )}
          {valores.pix_titular?.trim() && (
            <div>
              <dt className="text-tinta-2">Titular da chave</dt>
              <dd className="mt-0.5 text-tinta">{valores.pix_titular}</dd>
            </div>
          )}
          {valores.pix_banco?.trim() && (
            <div>
              <dt className="text-tinta-2">Banco da chave</dt>
              <dd className="mt-0.5 text-tinta">{valores.pix_banco}</dd>
            </div>
          )}
        </dl>

        {/* Itens do pedido (interno) + total derivado. Mesmo layout do DetalheAviso. */}
        <div>
          <ul className="flex flex-col divide-y divide-linha">
            {valores.itens.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-tinta">
                  {item.qtd > 1 && <span className="text-tinta-2">{item.qtd}× </span>}
                  {item.descricao}
                </span>
                <MoneyText centavos={item.qtd * item.valor_unit_centavos} className="shrink-0 tabular" />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-linha pt-3 text-sm">
            <span className="text-tinta-2">Total</span>
            <MoneyText centavos={totalCentavos} className="font-medium tabular" />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-tinta">
          <input
            type="checkbox"
            className="size-4 accent-salvia"
            checked={enviarAceite}
            onChange={(e) => setEnviarAceite(e.target.checked)}
          />
          Enviar o combinado para {valores.nome_devedor || 'a outra pessoa'} confirmar no WhatsApp
        </label>

        {/* Item 13: sem chave Pix ao marcar "Enviar aceite", oferece o cadastro/escolha aqui
            mesmo. No receber é bloqueante (enviarPossivel abaixo); no pagar é só uma oferta,
            não impede o envio. */}
        {enviarAceite && semPix && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-tinta">Chave Pix</span>
            <SeletorChavePix
              modo={ehReceber ? 'proprias' : 'externa'}
              value={valores.pix_chave ?? ''}
              onChange={onMudarPixChave}
              onDetalhes={onMudarPixDetalhes}
            />
          </div>
        )}

        {/* Preview da mensagem: cinza/desabilitado até marcar "Enviar aceite". */}
        {!enviarAceite ? (
          <div className="rounded-card border border-linha bg-areia/30 p-4 text-sm text-tinta-2 opacity-70">
            Marque "Enviar aceite" para ver a mensagem que {valores.nome_devedor || 'a outra pessoa'}{' '}
            vai receber no WhatsApp.
          </div>
        ) : preview.isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : (preview.data?.render ?? '').trim().length > 0 ? (
          <WhatsAppPreview texto={preview.data?.render ?? ''} botoes={preview.data?.botoes ?? []} />
        ) : (
          <p className="text-sm text-tinta-2">
            O preview da mensagem não está disponível agora. Você ainda pode enviar o combinado.
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variante="secondary" onClick={onFechar}>
            Revisar
          </Button>
          {enviarAceite ? (
            <Button
              variante="primary"
              onClick={() => onSalvar('enviar')}
              loading={salvando}
              disabled={!enviarPossivel}
            >
              Salvar e enviar combinado
            </Button>
          ) : (
            <Button variante="primary" onClick={() => onSalvar('agenda')} loading={salvando}>
              Salvar na agenda
            </Button>
          )}
        </div>

        {enviarAceite && !enviarPossivel && (
          <p className="text-xs text-barro">
            Escolha ou cadastre uma chave Pix acima para enviar o combinado.
          </p>
        )}
      </Card>
    </div>,
    document.body,
  )
}
