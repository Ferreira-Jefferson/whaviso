import { useCallback, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router'
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
} from '@/shared/ui'
import { ApiError } from '@/shared/api_client'
import type {
  CriarAvisoResposta,
  DirecaoAviso,
  EtapaEnvio,
  RecorrenciaInput,
} from '@/shared/contracts'
import { usePerfil } from '@/shared/auth'
import { useSemSaldo } from '@/shared/plano'
import { SeletorChavePix } from '@/shared/pix'
import { hojeIso } from '@/shared/format'
import { useCriarAviso } from '../api'
import { novoAvisoSchema, MAX_MOTIVO_CARACTERES, type NovoAvisoForm } from '../schemas'
import { AvisoCriado } from '../components/AvisoCriado'
import { RepetirCombinado } from '../components/RepetirCombinado'
import { CadenciaLembretes } from '../components/CadenciaLembretes'

const OPCOES_DIRECAO: ReadonlyArray<{ value: DirecaoAviso; label: string }> = [
  { value: 'receber', label: 'Vou receber' },
  { value: 'pagar', label: 'Vou pagar' },
]

export default function NovoAvisoPage() {
  const navigate = useNavigate()
  const criar = useCriarAviso()
  const perfil = usePerfil()
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
      nome_devedor: '',
      motivo: '',
      data_combinada: '',
      telefone_devedor: null,
      pix_chave: '',
      pix_titular: '',
      pix_banco: '',
    },
  })

  const direcao = watch('direcao')
  // H4.1: o modo (gerar convite agora x só salvar) não é mais um seletor à parte;
  // ele é definido pelo botão de ação clicado no rodapé do formulário.
  const modo = watch('modo')
  // Contador ao vivo do "Sobre o quê" (caracteres). O maxLength já trava a digitação
  // em MAX_MOTIVO_CARACTERES; o schema valida por garantia (paste etc.).
  const motivoLen = (watch('motivo') ?? '').length
  const ehReceber = direcao === 'receber'

  // Cada botão escolhe o modo e dispara o submit. O schema valida conforme o modo
  // (telefone/Pix só obrigatórios ao gerar o convite), então setamos antes de validar.
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
        descricao="Combine os detalhes. No fim, gere o convite ou só salve o combinado."
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
              ? 'A outra pessoa recebe um convite no WhatsApp para revisar e confirmar o combinado.'
              : 'Quem vai receber recebe um convite para confirmar; os lembretes chegam para você.'}
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
            dica="Necessário para gerar o convite. Sem ele, dá para só salvar."
            erro={errors.telefone_devedor?.message}
          >
            <Controller
              control={control}
              name="telefone_devedor"
              render={({ field }) => (
                <PhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  invalido={Boolean(errors.telefone_devedor)}
                />
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
            <Field label="Valor" erro={errors.valor_centavos?.message}>
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
                para gerar o convite e enviar lembretes,{' '}
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
                Salvar e gerar convite
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  )
}
