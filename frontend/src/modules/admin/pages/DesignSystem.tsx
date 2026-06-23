// Galeria do design system (owner-only, sob /admin/design). Referência viva dos
// tokens e componentes do shared/ui. NÃO é tela de produto; serve para conferir
// visualmente cores, raios, tipografia e os estados de cada componente num lugar
// só. Ao criar/alterar um componente em shared/ui, espelhe aqui o seu uso.
import { useState } from 'react'
import {
  Button,
  Card,
  Banner,
  Field,
  Input,
  Select,
  SegmentedControl,
  StatusBadge,
  Spinner,
  Skeleton,
  EmptyState,
  MoneyText,
  MoneyInput,
  PhoneInput,
  DateInput,
  ChavePixInput,
  DicaTipoChave,
  CopyLinkButton,
  Placeholder,
  Dialog,
  ConfirmDialog,
  TableResponsive,
  type ColunaTabela,
  StatCard,
  Recibo,
  CycleTimeline,
  WhatsAppPreview,
  GraficoBarras,
  PageHeader,
  BellLogo,
} from '@/shared/ui'
import { Inbox } from 'lucide-react'
import {
  statusAviso,
  type StatusAviso,
  type TipoChavePix,
  type Envio,
} from '@/shared/contracts'

// --- Tokens (espelham frontend/src/index.css) ------------------------------

const SUPERFICIES = [
  { token: 'papel', hex: '#faf7f0', uso: 'fundo geral' },
  { token: 'papel-2', hex: '#f3eee3', uso: 'superfícies/hover' },
  { token: 'cartao', hex: '#ffffff', uso: 'cards' },
  { token: 'linha', hex: '#e5decf', uso: 'bordas/hairlines' },
] as const

const TINTAS_MARCA = [
  { token: 'tinta', hex: '#20322a', uso: 'texto principal', escuro: true },
  { token: 'tinta-2', hex: '#5c6b62', uso: 'texto secundário', escuro: true },
  { token: 'salvia', hex: '#1e4d3b', uso: 'ações primárias/títulos', escuro: true },
  { token: 'salvia-claro', hex: '#dceae0', uso: 'destaque suave' },
  { token: 'folha', hex: '#3e7c5b', uso: 'sucesso/recebido', escuro: true },
] as const

const SEMANTICAS = [
  { token: 'ambar', hex: '#b97e22', uso: 'no ciclo', escuro: true },
  { token: 'ambar-claro', hex: '#f6ebd7', uso: 'fundo no ciclo' },
  { token: 'barro', hex: '#a4543f', uso: 'cancelado/destrutivo', escuro: true },
  { token: 'cinza-expirado', hex: '#8b9088', uso: 'encerrado', escuro: true },
  { token: 'revisao', hex: '#2f6f7a', uso: 'em revisão', escuro: true },
  { token: 'revisao-claro', hex: '#d9eaed', uso: 'fundo em revisão' },
] as const

function Swatch({
  token,
  hex,
  uso,
  escuro,
}: {
  token: string
  hex: string
  uso: string
  escuro?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-card border border-linha bg-cartao">
      <div
        className={`flex h-16 items-end p-2 text-xs font-medium ${escuro ? 'text-papel' : 'text-tinta'}`}
        style={{ backgroundColor: hex }}
      >
        {hex}
      </div>
      <div className="px-3 py-2">
        <p className="font-mono text-xs text-tinta">{token}</p>
        <p className="text-xs text-tinta-2">{uso}</p>
      </div>
    </div>
  )
}

// --- Seção genérica --------------------------------------------------------

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl text-salvia">{titulo}</h2>
      {children}
    </section>
  )
}

const TODOS_STATUS = statusAviso.options

// --- Dados fictícios para os componentes de dados ---------------------------

interface LinhaDemo {
  id: string
  nome: string
  valor: number
  status: StatusAviso
}

const LINHAS_TABELA: LinhaDemo[] = [
  { id: 'l1', nome: 'Maria Silva', valor: 12000, status: 'programado' },
  { id: 'l2', nome: 'João Souza', valor: 45000, status: 'pago' },
  { id: 'l3', nome: 'Ana Lima', valor: 8900, status: 'aguardando_aceite' },
]

const COLUNAS_TABELA: ReadonlyArray<ColunaTabela<LinhaDemo>> = [
  { chave: 'nome', titulo: 'Quem', principal: true, render: (l) => l.nome },
  {
    chave: 'valor',
    titulo: 'Valor',
    alinhar: 'direita',
    render: (l) => <MoneyText centavos={l.valor} />,
  },
  {
    chave: 'status',
    titulo: 'Situação',
    ocultarRotuloMobile: true,
    render: (l) => <StatusBadge status={l.status} />,
  },
]

// Envios fictícios para o CycleTimeline (a etapa/estado viriam do backend).
const ENVIOS_DEMO: Envio[] = [
  { id: 'env-1', aviso_id: 'av-1', etapa: 'd_menos_2', status: 'enviado', agendado_para: new Date('2026-06-08T12:00:00'), enviado_em: new Date('2026-06-08T12:00:03'), tentativas: 1, proxima_tentativa_em: null, wamid: 'wamid.1', entrega_status: 'delivered', erro: null },
  { id: 'env-2', aviso_id: 'av-1', etapa: 'd_menos_1', status: 'enviado', agendado_para: new Date('2026-06-09T12:00:00'), enviado_em: new Date('2026-06-09T12:00:02'), tentativas: 1, proxima_tentativa_em: null, wamid: 'wamid.2', entrega_status: 'read', erro: null },
  { id: 'env-3', aviso_id: 'av-1', etapa: 'd', status: 'agendado', agendado_para: new Date('2026-06-10T12:00:00'), enviado_em: null, tentativas: 0, proxima_tentativa_em: null, wamid: null, entrega_status: null, erro: null },
  { id: 'env-4', aviso_id: 'av-1', etapa: 'd_mais_1', status: 'agendado', agendado_para: new Date('2026-06-11T12:00:00'), enviado_em: null, tentativas: 0, proxima_tentativa_em: null, wamid: null, entrega_status: null, erro: null },
]

export default function DesignSystemPage() {
  const [seg, setSeg] = useState<'receber' | 'pagar'>('receber')
  const [sel, setSel] = useState<StatusAviso | 'todos'>('todos')
  const [tipoPix, setTipoPix] = useState<TipoChavePix | ''>('')
  const [chavePix, setChavePix] = useState('')
  const [tel, setTel] = useState<string | null>(null)
  const [valor, setValor] = useState<number | null>(null)
  const [dialogAberto, setDialogAberto] = useState(false)
  const [confirmAberto, setConfirmAberto] = useState(false)
  const [visao, setVisao] = useState<'geral' | 'meus'>('geral')

  return (
    <div className="animate-rise flex flex-col gap-10">
      <PageHeader
        titulo="Design system"
        descricao="Referência viva dos tokens e componentes do whaviso (owner)."
      />

      {/* ---- TOKENS ---- */}
      <Secao titulo="Cores · superfícies">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUPERFICIES.map((c) => (
            <Swatch key={c.token} {...c} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Cores · tinta e marca">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {TINTAS_MARCA.map((c) => (
            <Swatch key={c.token} {...c} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Cores · semânticas">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {SEMANTICAS.map((c) => (
            <Swatch key={c.token} {...c} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Tipografia">
        <Card className="flex flex-col gap-3">
          <p className="font-display text-3xl text-tinta">Fraunces · display</p>
          <p className="text-base text-tinta">
            Karla · texto corrido (font-sans). O tom é de papelaria fina, nunca fintech.
          </p>
          <p className="tabular text-2xl text-tinta">R$ 1.234,56 · tabular-nums 700</p>
        </Card>
      </Secao>

      <Secao titulo="Raios">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col items-center gap-2">
            <div className="size-20 rounded-input border border-linha bg-cartao" />
            <span className="text-xs text-tinta-2">rounded-input · 8px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="size-20 rounded-card border border-linha bg-cartao" />
            <span className="text-xs text-tinta-2">rounded-card · 12px</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div className="size-20 rounded-pill border border-linha bg-cartao" />
            <span className="text-xs text-tinta-2">rounded-pill · full</span>
          </div>
        </div>
      </Secao>

      <Secao titulo="Logo · marca">
        <Card className="flex w-fit flex-col gap-4">
          <span className="inline-flex items-center gap-2 text-salvia">
            <BellLogo className="size-9 text-dourado" />
            <span className="font-display text-3xl font-semibold">whaviso</span>
          </span>
          <div className="border-t border-linha pt-3 text-sm text-tinta-2">
            <p>
              <span
                className="mr-2 inline-block size-3.5 rounded-[3px] align-middle"
                style={{ backgroundColor: '#b8860b' }}
              />
              <span className="font-mono font-semibold text-tinta">#b8860b</span>{' '}
              · dourado (ouro velho)
            </p>
            <p className="mt-1 text-xs">
              Sino lucide + alça + badalo dentro de um círculo vazado.
              Componente <span className="font-mono">BellLogo</span>; cor pelo token{' '}
              <span className="font-mono">--color-dourado</span> (classe{' '}
              <span className="font-mono">text-dourado</span>).
            </p>
          </div>
        </Card>
      </Secao>

      {/* ---- COMPONENTES ---- */}
      <Secao titulo="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variante="secondary">Secondary</Button>
          <Button variante="ghost">Ghost</Button>
          <Button variante="destructive">Destructive</Button>
          <Button loading>Carregando</Button>
          <Button disabled>Desabilitado</Button>
        </div>
      </Secao>

      <Secao titulo="StatusBadge (todos os status)">
        <div className="flex flex-wrap gap-2">
          {TODOS_STATUS.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Secao>

      <Secao titulo="Banner">
        <div className="flex flex-col gap-3">
          <Banner tom="info">Mensagem informativa, tom calmo.</Banner>
          <Banner tom="sucesso">Tudo certo, combinado salvo.</Banner>
          <Banner tom="erro">Não foi possível salvar. Tente de novo.</Banner>
        </div>
      </Secao>

      <Secao titulo="Field + Input">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" dica="Como a pessoa será chamada.">
            <Input placeholder="Maria" />
          </Field>
          <Field label="E-mail" erro="Informe um e-mail válido.">
            <Input type="email" defaultValue="invalido" />
          </Field>
        </div>
      </Secao>

      <Secao titulo="Select">
        <div className="sm:w-64">
          <Select<StatusAviso | 'todos'>
            ariaLabel="Exemplo de select"
            value={sel}
            onChange={setSel}
            options={[
              { value: 'todos', label: 'Todos' },
              ...TODOS_STATUS.map((s) => ({ value: s, label: s })),
            ]}
          />
          <p className="mt-2 text-xs text-tinta-2">Selecionado: {sel}</p>
        </div>
      </Secao>

      <Secao titulo="SegmentedControl">
        <SegmentedControl<'receber' | 'pagar'>
          ariaLabel="Exemplo de segmented"
          value={seg}
          onChange={setSeg}
          options={[
            { value: 'receber', label: 'A receber' },
            { value: 'pagar', label: 'A pagar' },
          ]}
        />
      </Secao>

      <Secao titulo="GraficoBarras">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-lg text-salvia">Combinados por status</h3>
            <GraficoBarras
              cor="var(--color-salvia)"
              dados={[
                { rotulo: 'No ciclo', valor: 42 },
                { rotulo: 'Recebido', valor: 28 },
                { rotulo: 'Aguardando aceite', valor: 11 },
                { rotulo: 'Cancelado', valor: 4 },
              ]}
            />
          </Card>
          <Card>
            <h3 className="mb-4 text-lg text-salvia">Lembretes por status</h3>
            <GraficoBarras
              cor="var(--color-folha)"
              dados={[
                { rotulo: 'Enviado', valor: 130 },
                { rotulo: 'Na fila', valor: 9 },
                { rotulo: 'Falhou', valor: 3 },
              ]}
            />
          </Card>
          <Card>
            <h3 className="mb-4 text-lg text-salvia">Sem dados</h3>
            <GraficoBarras dados={[]} />
          </Card>
        </div>
      </Secao>

      <Secao titulo="MoneyText">
        <div className="flex flex-wrap items-baseline gap-6">
          <MoneyText centavos={120000} className="text-3xl text-tinta" />
          <MoneyText centavos={990} className="text-xl text-folha" />
          <MoneyText centavos={0} className="text-base text-tinta-2" />
        </div>
      </Secao>

      <Secao titulo="Card">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="text-lg text-tinta">Título do card</h3>
            <p className="mt-1 text-sm text-tinta-2">
              Conteúdo de exemplo dentro de um Card.
            </p>
          </Card>
          <Card className="bg-papel-2">
            <h3 className="text-lg text-tinta">Card elevado</h3>
            <p className="mt-1 text-sm text-tinta-2">Variação com bg-papel-2.</p>
          </Card>
        </div>
      </Secao>

      <Secao titulo="Loading · Spinner e Skeleton">
        <div className="flex flex-col gap-4">
          <Spinner className="size-6 text-salvia" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3 rounded-input" />
            <Skeleton className="h-4 w-1/2 rounded-input" />
            <Skeleton className="h-16 w-full rounded-card" />
          </div>
        </div>
      </Secao>

      <Secao titulo="EmptyState">
        <EmptyState
          icone={<Inbox strokeWidth={1.5} className="size-10" />}
          titulo="Nenhum aviso por aqui"
          descricao="Crie seu primeiro combinado para gerar o convite."
          acao={<Button>Novo aviso</Button>}
        />
      </Secao>

      <Secao titulo="ChavePixInput">
        <div className="flex flex-col gap-3">
          <ChavePixInput
            orientacao="linha"
            tipo={tipoPix}
            onTipoChange={setTipoPix}
            chave={chavePix}
            onChaveChange={setChavePix}
          />
          <p className="text-xs text-tinta-2">
            Detecção como auxílio de UX (não bloqueia). DicaTipoChave avulsa:
          </p>
          <DicaTipoChave chave="maria@email.com" />
          <DicaTipoChave chave="11999998888" tipo="cpf" />
        </div>
      </Secao>

      <Secao titulo="PhoneInput">
        <div className="sm:w-96">
          <PhoneInput value={tel} onChange={setTel} />
          <p className="mt-2 text-xs text-tinta-2">E.164: {tel ?? '(incompleto)'}</p>
        </div>
      </Secao>

      <Secao titulo="MoneyInput">
        <div className="sm:w-64">
          <MoneyInput value={valor} onChange={setValor} />
          <p className="mt-2 text-xs text-tinta-2">Centavos: {valor ?? '(vazio)'}</p>
        </div>
      </Secao>

      <Secao titulo="DateInput">
        <div className="sm:w-64">
          <DateInput defaultValue="2026-06-10" />
          <p className="mt-2 text-xs text-tinta-2">Data de negócio pura (YYYY-MM-DD).</p>
        </div>
      </Secao>

      <Secao titulo="CopyLinkButton">
        <CopyLinkButton link="https://whaviso.app/aceite/exemplo-de-token" />
      </Secao>

      <Secao titulo="Dialog e ConfirmDialog">
        <div className="flex flex-wrap gap-3">
          <Button variante="secondary" onClick={() => setDialogAberto(true)}>
            Abrir Dialog
          </Button>
          <Button variante="destructive" onClick={() => setConfirmAberto(true)}>
            Abrir ConfirmDialog
          </Button>
        </div>
        <Dialog
          aberto={dialogAberto}
          onFechar={() => setDialogAberto(false)}
          titulo="Exemplo de Dialog"
          acoes={<Button onClick={() => setDialogAberto(false)}>Entendi</Button>}
        >
          Modal central acessível (fecha em Esc ou no fundo).
        </Dialog>
        <ConfirmDialog
          aberto={confirmAberto}
          titulo="Remover esta chave?"
          textoConfirmar="Sim, remover"
          variante="destructive"
          onConfirmar={() => setConfirmAberto(false)}
          onCancelar={() => setConfirmAberto(false)}
        >
          A chave deixa de aparecer ao criar novos combinados.
        </ConfirmDialog>
      </Secao>

      <Secao titulo="StatCard">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard rotulo="A receber" centavos={250000} detalhe="3 combinados" tom="salvia" />
          <StatCard rotulo="Recebido no mês" centavos={89000} detalhe="5 combinados" tom="folha" />
          <StatCard rotulo="No ciclo" centavos={42000} detalhe="2 combinados" tom="ambar" />
        </div>
      </Secao>

      <Secao titulo="TableResponsive">
        <TableResponsive
          legenda="Exemplo de combinados"
          colunas={COLUNAS_TABELA}
          linhas={LINHAS_TABELA}
          chaveLinha={(l) => l.id}
        />
      </Secao>

      <Secao titulo="CycleTimeline">
        <Card>
          <CycleTimeline envios={ENVIOS_DEMO} />
        </Card>
      </Secao>

      <Secao titulo="WhatsAppPreview">
        <div className="sm:w-96">
          <WhatsAppPreview
            texto={'Oi Maria! Passando para lembrar do nosso combinado de R$ 120,00 (aluguel de junho).'}
            botoes={['Já paguei', 'Sair dos lembretes']}
          />
        </div>
      </Secao>

      <Secao titulo="Recibo">
        <Recibo
          tom="sucesso"
          titulo="Combinado confirmado"
          acoes={<Button>Voltar ao início</Button>}
        >
          Tudo certo, o combinado foi confirmado.
        </Recibo>
      </Secao>

      <Secao titulo="AlternarVisaoOwner">
        <p className="text-xs text-tinta-2">
          Só aparece para o owner; em produção, ao clicar navega entre /admin e /app.
          Aqui é só demonstração visual (não redireciona).
        </p>
        <div className="mb-6">
          <SegmentedControl<'geral' | 'meus'>
            ariaLabel="Alternar entre a visão geral e os seus combinados"
            value={visao}
            onChange={setVisao}
            options={[
              { value: 'geral', label: 'Visão geral' },
              { value: 'meus', label: 'Meus combinados' },
            ]}
          />
        </div>
      </Secao>

      <Secao titulo="Placeholder">
        <Placeholder titulo="Tela em construção" />
      </Secao>
    </div>
  )
}
