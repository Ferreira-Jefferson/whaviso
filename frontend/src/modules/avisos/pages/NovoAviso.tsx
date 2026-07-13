import { useCallback, useState } from 'react'
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
  Input,
  MoneyInput,
  PageHeader,
  PhoneInput,
  SegmentedControl,
  Select,
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type {
  CriarAvisoResposta,
  DirecaoAviso,
  EtapaEnvio,
  ItemPedido,
  RecorrenciaInput,
} from '@/shared/contracts'
import { usePerfil } from '@/shared/auth'
import { useSemSaldo } from '@/shared/plano'
import { SeletorChavePix } from '@/shared/pix'
import { hojeIso, telefone as fmtTelefone } from '@/shared/format'
import { useBuscarPessoaPorTelefone, useCategorias, useCriarAviso, useCriarCategoria } from '../api'
import { novoAvisoSchema, MAX_MOTIVO_CARACTERES, type NovoAvisoForm } from '../schemas'
import { AvisoCriado } from '../components/AvisoCriado'
import { RepetirCombinado } from '../components/RepetirCombinado'
import { CadenciaLembretes } from '../components/CadenciaLembretes'
import { ItensPedido } from '../components/ItensPedido'

const OPCOES_DIRECAO: ReadonlyArray<{ value: DirecaoAviso; label: string }> = [
  { value: 'receber', label: 'Vou receber' },
  { value: 'pagar', label: 'Vou pagar' },
]

export default function NovoAvisoPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const criar = useCriarAviso()
  const perfil = usePerfil()
  // E16: categorias do usuário para o SELECT + criação inline de uma nova categoria.
  const categorias = useCategorias()
  const criarCategoria = useCriarCategoria()
  const [mostrarNovaCat, setMostrarNovaCat] = useState(false)
  const [novaCatNome, setNovaCatNome] = useState('')
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
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [limiteAtingido, setLimiteAtingido] = useState<string | null>(null)
  // E6 H6.10 / E11 H11.2: recorrência e cadência são UNIVERSAIS (liberadas para todos). A
  // cadência é do PRÓPRIO combinado (vale repetindo ou não); a recorrência só multiplica as
  // ocorrências (cada uma reserva 1 crédito). undefined = simples / ciclo completo.
  const [recorrencia, setRecorrencia] = useState<RecorrenciaInput | undefined>(undefined)
  const [cadenciaEtapas, setCadenciaEtapas] = useState<EtapaEnvio[] | undefined>(undefined)
  // Fase A: composição opcional do pedido (itens). Estado local (como recorrência/cadência);
  // vai no corpo do POST. Quando há itens, o total deles alimenta o valor combinado.
  const [itens, setItens] = useState<ItemPedido[]>([])
  // Estáveis p/ os efeitos dos filhos não dispararem a cada render.
  const aoMudarRecorrencia = useCallback((v: RecorrenciaInput | undefined) => setRecorrencia(v), [])
  const aoMudarCadencia = useCallback((v: EtapaEnvio[] | undefined) => setCadenciaEtapas(v), [])

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
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
      categoria_id: '',
    },
  })

  // Cria uma categoria inline e já a seleciona no formulário (H16.1/H16.3).
  async function criarCategoriaInline() {
    const nome = novaCatNome.trim()
    if (!nome) return
    try {
      const c = await criarCategoria.mutateAsync({ nome })
      setValue('categoria_id', c.id)
      setNovaCatNome('')
      setMostrarNovaCat(false)
    } catch (e) {
      setErroGeral(e instanceof ApiError ? e.message : 'Não foi possível criar a categoria.')
    }
  }

  const direcao = watch('direcao')
  // H4.1: o modo (enviar o combinado agora x só salvar) não é mais um seletor à parte;
  // ele é definido pelo botão de ação clicado no rodapé do formulário.
  const modo = watch('modo')
  // Contador ao vivo do "Sobre o quê" (caracteres). O maxLength já trava a digitação
  // em MAX_MOTIVO_CARACTERES; o schema valida por garantia (paste etc.).
  const motivoLen = (watch('motivo') ?? '').length
  const ehReceber = direcao === 'receber'
  const temItens = itens.length > 0

  // Fase A: ao mexer nos itens, o total deles vira o valor combinado (o whaviso soma por
  // você). O valor segue editável para ajustar (ex.: desconto); a autoridade do acordo é o
  // valor, não a soma (o backend não exige igualdade). Só sobrescreve quando há itens.
  function aoMudarItens(novos: ItemPedido[]) {
    setItens(novos)
    if (novos.length > 0) {
      const total = novos.reduce((s, it) => s + it.qtd * it.valor_unit_centavos, 0)
      setValue('valor_centavos', total, { shouldValidate: true })
    }
  }

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
        valor_centavos: dados.valor_centavos,
        data_combinada: dados.data_combinada,
        // E16 / Fase A: categoria ('' = sem categoria) e custo interno (opcional).
        categoria_id: dados.categoria_id ? dados.categoria_id : null,
        valor_custo_centavos: dados.valor_custo_centavos ?? null,
        // Fase A: itens do pedido (opcional). null quando não usou o editor.
        itens: itens.length > 0 ? itens : null,
        // E6 H6.10: recorrência (facilitador, todos os planos) + cadência (gated por plano
        // no servidor). undefined = combinado simples / ciclo completo. O servidor é a
        // autoridade: expande as ocorrências e valida vagas/cadência.
        recorrencia: recorrencia ?? null,
        cadencia_etapas: cadenciaEtapas ?? null,
      })
      setResultado(r)
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
            label={ehReceber ? 'Nome de quem vai pagar' : 'Para quem você vai pagar'}
            erro={errors.nome_devedor?.message}
          >
            <Input
              placeholder="Ex.: Maria Silva"
              autoComplete="off"
              {...register('nome_devedor')}
            />
          </Field>

          <Field
            label={ehReceber ? 'WhatsApp de quem vai pagar' : 'WhatsApp de quem vai receber'}
            dica="Necessário para enviar o combinado. Sem ele, dá para só salvar."
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

          {/* Campo montado à mão (não via Field) para sobrepor o contador de
              caracteres no canto inferior direito do input. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="campo-motivo" className="text-sm font-medium text-tinta">
              Sobre o quê
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

          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Valor"
              erro={errors.valor_centavos?.message}
              dica={temItens ? 'Somado dos itens abaixo. Você pode ajustar (ex.: desconto).' : undefined}
            >
              <Controller
                control={control}
                name="valor_centavos"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value ?? null}
                    onChange={(c) => field.onChange(c ?? undefined)}
                    invalido={Boolean(errors.valor_centavos)}
                  />
                )}
              />
            </Field>

            <Field label="Data combinada" erro={errors.data_combinada?.message}>
              {/* Controlado (como o Valor): o DateInput é um calendário próprio, e o modo
                  controlado mantém a exibição em sincronia com o react-hook-form. */}
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

          {/* Fase A: composição do pedido (o que foi vendido). Opcional e INTERNA: nunca
              aparece para a outra pessoa; o total soma no valor acima. */}
          <ItensPedido value={itens} onChange={aoMudarItens} />

          {/* E16 / Fase A: organização (categoria) + resultado (custo). Ambos opcionais e
              INTERNOS: nunca aparecem para a outra pessoa. */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Categoria (opcional)"
              dica="Organize por marca ou linha. Não aparece para a outra pessoa."
            >
              <Controller
                control={control}
                name="categoria_id"
                render={({ field }) => (
                  <Select
                    ariaLabel="Categoria"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    options={[
                      { value: '', label: 'Sem categoria' },
                      ...(categorias.data ?? []).map((c) => ({ value: c.id, label: c.nome })),
                    ]}
                  />
                )}
              />
              {!mostrarNovaCat ? (
                <button
                  type="button"
                  className="mt-1 self-start text-xs font-medium text-salvia hover:underline"
                  onClick={() => setMostrarNovaCat(true)}
                >
                  + Nova categoria
                </button>
              ) : (
                <div className="mt-1 flex gap-2">
                  <Input
                    value={novaCatNome}
                    onChange={(e) => setNovaCatNome(e.target.value)}
                    placeholder="Ex.: Natura"
                    maxLength={40}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variante="secondary"
                    loading={criarCategoria.isPending}
                    onClick={criarCategoriaInline}
                  >
                    Criar
                  </Button>
                </div>
              )}
              <Link
                to="/app/categorias"
                className="mt-1 self-start text-xs text-tinta-2 hover:underline"
              >
                Gerenciar categorias
              </Link>
            </Field>

            <Field
              label="Custo (opcional)"
              dica="Quanto o produto te custou. Fica só para você, para ver o resultado."
            >
              <Controller
                control={control}
                name="valor_custo_centavos"
                render={({ field }) => (
                  <MoneyInput
                    value={field.value ?? null}
                    onChange={(c) => field.onChange(c ?? undefined)}
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
            <span className="text-sm font-medium text-tinta">
              {ehReceber ? 'Chave Pix' : 'Chave Pix (opcional)'}
            </span>
            <p className="text-xs text-tinta-2">
              {ehReceber
                ? 'Aparece para a outra pessoa pagar com facilidade.'
                : 'A chave de quem vai receber. Quem confirmar pode ajustar.'}
            </p>
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
              não), por isso fora do "Repetir". Universal (E11 H11.2): liberado para todos. */}
          <CadenciaLembretes onChange={aoMudarCadencia} />

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
              <Button
                type="button"
                variante="secondary"
                loading={isSubmitting && modo === 'agenda'}
                onClick={() => salvar('agenda')}
              >
                Apenas salvar
              </Button>
              {/* Envio é universal (liberado para todos); o que limita é o saldo. A api
                  recusa com saldo_insuficiente se faltar crédito. */}
              <Button
                type="button"
                variante="primary"
                loading={isSubmitting && modo === 'enviar'}
                onClick={() => salvar('enviar')}
              >
                Salvar e enviar combinado
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  )
}
