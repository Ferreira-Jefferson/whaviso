// QA harness (dev-only, fora do build de producao): dados FAKES para popular cada tela do
// painel sem backend nem login. Casam com os contratos em @/shared/contracts/_generated, mas
// como o apiClient fake ignora o schema Zod, o objetivo e so cobrir os campos que a UI le.
// Nada aqui entra em producao (ver vite.config: alias so no mode 'qa'; qa.html nao e input do build).

/** UUID v4 valido e estavel a partir de um numero. */
export function u(n: number): string {
  const h = n.toString(16).padStart(12, '0')
  return `11111111-1111-4111-8111-${h}`
}

const agora = Date.now()
/** ISO com offset, deslocado `min` minutos no passado. */
function iso(minAtras = 0): string {
  return new Date(agora - minAtras * 60_000).toISOString()
}

// ---------------------------------------------------------------- pedidos
function card(n: number, over: Record<string, unknown>) {
  return {
    id: u(1000 + n),
    codigo: `#${1040 + n}`,
    status: 'novo',
    origem: 'whatsapp',
    modalidade: 'entrega',
    total_centavos: 4890,
    qtd_itens: 2,
    cliente_nome: 'Cliente',
    problema_motivo: null,
    motoboy_nome: null,
    corrida_id: null,
    ordem_parada: null,
    zona_id: null,
    criado_em: iso(8),
    destinos: ['em_preparo', 'problema'],
    ...over,
  }
}

const pedidosKanban = {
  colunas: {
    novo: {
      itens: [
        card(1, { codigo: '#1041', cliente_nome: 'Mariana Lopes', total_centavos: 5890, qtd_itens: 3, criado_em: iso(4) }),
        card(2, { codigo: '#1042', cliente_nome: 'Joao Vitor', modalidade: 'retirada', total_centavos: 2990, qtd_itens: 1, criado_em: iso(11) }),
      ],
      proximoCursor: null,
    },
    em_preparo: {
      itens: [
        card(3, { codigo: '#1039', status: 'em_preparo', cliente_nome: 'Paula Reis', total_centavos: 7450, qtd_itens: 4, criado_em: iso(18), destinos: ['saiu_entrega', 'problema'] }),
      ],
      proximoCursor: null,
    },
    saiu_entrega: {
      itens: [
        card(4, { codigo: '#1037', status: 'saiu_entrega', cliente_nome: 'Carlos Henrique', motoboy_nome: 'Rafael (moto)', total_centavos: 6120, qtd_itens: 2, criado_em: iso(34), destinos: ['entregue', 'problema'] }),
      ],
      proximoCursor: null,
    },
    entregue: {
      itens: [
        card(5, { codigo: '#1033', status: 'entregue', origem: 'ifood', cliente_nome: 'Luiza Martins', total_centavos: 3990, qtd_itens: 1, criado_em: iso(62), destinos: [] }),
        card(6, { codigo: '#1031', status: 'entregue', origem: 'manual', modalidade: 'retirada', cliente_nome: 'Pedro Alves', total_centavos: 8800, qtd_itens: 5, criado_em: iso(75), destinos: [] }),
      ],
      proximoCursor: null,
    },
    problema: {
      itens: [
        card(7, { codigo: '#1029', status: 'problema', cliente_nome: 'Sem nome', problema_motivo: 'Endereco nao encontrado', total_centavos: 4500, qtd_itens: 2, criado_em: iso(90), destinos: ['em_preparo'] }),
      ],
      proximoCursor: null,
    },
  },
}

// ---------------------------------------------------------------- conversas
function conversa(n: number, over: Record<string, unknown>) {
  return {
    id: u(2000 + n),
    status: 'ia',
    cliente: { id: u(2500 + n), nome: 'Cliente', rotulo: 'Cliente' },
    ultima_mensagem: {
      previa: 'Ola, gostaria de fazer um pedido',
      direcao: 'entrada',
      tipo: 'texto',
      criado_em: iso(5),
    },
    nao_lidas: 0,
    atualizado_em: iso(5),
    janela_aberta: true,
    janela_aberta_ate: iso(-600),
    janela_restante_segundos: 36_000,
    ...over,
  }
}

const conversasLista = {
  itens: [
    conversa(1, { cliente: { id: u(2501), nome: 'Mariana Lopes', rotulo: 'Mariana Lopes' }, status: 'humano', nao_lidas: 2, ultima_mensagem: { previa: 'Pode ser meia-noite?', direcao: 'entrada', tipo: 'texto', criado_em: iso(2) } }),
    conversa(2, { cliente: { id: u(2502), nome: 'Joao Vitor', rotulo: 'Joao Vitor' }, status: 'ia', ultima_mensagem: { previa: 'Seu pedido saiu para entrega', direcao: 'saida', tipo: 'texto', criado_em: iso(9) } }),
    conversa(3, { cliente: { id: u(2503), nome: null, rotulo: 'Contato +55 ** *****-2231' }, status: 'ia', janela_aberta: false, janela_restante_segundos: 0, janela_aberta_ate: null, ultima_mensagem: { previa: 'Audio', direcao: 'entrada', tipo: 'audio', criado_em: iso(140) } }),
    conversa(4, { cliente: { id: u(2504), nome: 'Paula Reis', rotulo: 'Paula Reis' }, status: 'encerrada', ultima_mensagem: { previa: 'Obrigada!', direcao: 'entrada', tipo: 'texto', criado_em: iso(320) } }),
  ],
  proximo_cursor: null,
}

function conversaDetalhe(id: string) {
  return {
    id,
    status: 'humano',
    cliente: { id: u(2501), nome: 'Mariana Lopes', rotulo: 'Mariana Lopes' },
    numero_whatsapp: { id: u(9001), status: 'conectado' },
    humano_desde: iso(10),
    nao_lidas: 0,
    pedido_ligado: { id: u(1041), codigo: '#1041', status: 'novo' },
    criado_em: iso(60),
    atualizado_em: iso(2),
    janela_aberta: true,
    janela_aberta_ate: iso(-600),
    janela_restante_segundos: 36_000,
  }
}

function conversaMensagens(conversaId: string) {
  return {
    itens: [
      { id: u(3001), conversa_id: conversaId, direcao: 'entrada', autor: 'cliente', tipo: 'texto', conteudo: 'Ola, queria uma pizza grande', transcricao: null, midia_ref: null, criado_em: iso(30) },
      { id: u(3002), conversa_id: conversaId, direcao: 'saida', autor: 'ia', tipo: 'texto', conteudo: 'Claro! Qual sabor?', transcricao: null, midia_ref: null, criado_em: iso(28) },
      { id: u(3003), conversa_id: conversaId, direcao: 'entrada', autor: 'cliente', tipo: 'texto', conteudo: 'Calabresa, pode ser meia-noite?', transcricao: null, midia_ref: null, criado_em: iso(2) },
    ],
    proximo_cursor: null,
  }
}

// ---------------------------------------------------------------- cardapio
function opcao(n: number, over: Record<string, unknown> = {}) {
  return {
    id: u(4000 + n),
    grupo_id: u(4100),
    nome: 'Opcao',
    preco_centavos: 0,
    padrao: false,
    ativo: true,
    esgotado_ate: null,
    ordem: n,
    disponivel: true,
    ...over,
  }
}

function item(n: number, categoriaId: string, over: Record<string, unknown>) {
  return {
    id: u(4500 + n),
    categoria_id: categoriaId,
    nome: 'Item',
    descricao: 'Descricao do item',
    preco_centavos: 3990,
    imagem_url: null,
    sugerivel: false,
    ativo: true,
    esgotado_ate: null,
    ordem: n,
    disponivel: true,
    excecoes: [],
    pedivel: true,
    grupos: [],
    ...over,
  }
}

const catPizzas = u(4001)
const catBebidas = u(4002)

const cardapioArvore = {
  gerado_em: iso(0),
  categorias: [
    {
      id: catPizzas,
      nome: 'Pizzas',
      descricao: 'As classicas da casa',
      programacao: null,
      ativo: true,
      ordem: 0,
      grupos: [],
      disponivel_agora: true,
      itens: [
        item(1, catPizzas, { nome: 'Margherita', descricao: 'Molho, mucarela e manjericao', preco_centavos: 4990 }),
        item(2, catPizzas, { nome: 'Calabresa', descricao: 'Calabresa fatiada e cebola', preco_centavos: 5290 }),
        item(3, catPizzas, { nome: 'Portuguesa', descricao: 'Presunto, ovo, cebola e ervilha', preco_centavos: 5590, disponivel: false, pedivel: false }),
      ],
    },
    {
      id: catBebidas,
      nome: 'Bebidas',
      descricao: null,
      programacao: null,
      ativo: true,
      ordem: 1,
      grupos: [],
      disponivel_agora: true,
      itens: [
        item(4, catBebidas, { nome: 'Refrigerante lata', descricao: '350 ml', preco_centavos: 700 }),
        item(5, catBebidas, { nome: 'Suco natural', descricao: 'Laranja ou limao', preco_centavos: 1200 }),
      ],
    },
  ],
}

const cardapioGrupos = {
  grupos: [
    {
      id: u(4100),
      nome: 'Tamanho',
      tipo: 'tamanho',
      obrigatorio: true,
      min_escolhas: 1,
      max_escolhas: 1,
      aplica_a_opcao_id: null,
      ativo: true,
      ordem: 0,
      opcoes: [
        opcao(1, { nome: 'Media', padrao: true }),
        opcao(2, { nome: 'Grande', preco_centavos: 900 }),
      ],
    },
    {
      id: u(4101),
      nome: 'Adicionais',
      tipo: 'adicional',
      obrigatorio: false,
      min_escolhas: 0,
      max_escolhas: 3,
      aplica_a_opcao_id: null,
      ativo: true,
      ordem: 1,
      opcoes: [
        opcao(3, { grupo_id: u(4101), nome: 'Borda recheada', preco_centavos: 800 }),
        opcao(4, { grupo_id: u(4101), nome: 'Bacon extra', preco_centavos: 600 }),
        opcao(5, { grupo_id: u(4101), nome: 'Catupiry', preco_centavos: 700, esgotado_ate: iso(-120), disponivel: false }),
      ],
    },
  ],
}

// ---------------------------------------------------------------- clientes
const clientesLista = {
  itens: [
    { id: u(5001), nome: 'Mariana Lopes', telefone_mascarado: '+55 ** *****-1234', pedidos_total: 12, ultima_atividade: iso(60) },
    { id: u(5002), nome: 'Joao Vitor', telefone_mascarado: '+55 ** *****-9876', pedidos_total: 3, ultima_atividade: iso(1440) },
    { id: u(5003), nome: null, telefone_mascarado: '+55 ** *****-2231', pedidos_total: 1, ultima_atividade: iso(2880) },
    { id: u(5004), nome: 'Paula Reis', telefone_mascarado: '+55 ** *****-4410', pedidos_total: 27, ultima_atividade: iso(15) },
  ],
  proximoCursor: null,
}

function clienteDetalhe(id: string) {
  return {
    id,
    nome: 'Mariana Lopes',
    telefone_mascarado: '+55 ** *****-1234',
    criado_em: iso(43200),
    enderecos: [
      { id: u(5101), cliente_id: id, apelido: 'Casa', logradouro: 'Rua das Flores', numero: '123', complemento: 'Apto 4', bairro: 'Centro', cidade: 'Sao Paulo', uf: 'SP', cep: '01010010', referencia: 'Proximo a praca', ultimo_uso_em: iso(60), ativo: true, criado_em: iso(43200) },
    ],
    resumo_pedidos: { total: 12, ultimo_pedido_em: iso(60), total_gasto_centavos: 58900 },
  }
}

// ---------------------------------------------------------------- lojas
function loja(n: number, over: Record<string, unknown>) {
  return {
    id: u(6000 + n),
    nome: 'Loja',
    logo_url: null,
    cores: { primaria: '#3e7c5b' },
    endereco: { logradouro: 'Av. Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'Sao Paulo', uf: 'SP', cep: '01310100' },
    horarios: null,
    area_entrega: null,
    ativo: true,
    papel: 'dono',
    aberta_agora: true,
    numeros_whatsapp: { total: 1, conectados: 1 },
    criado_em: iso(100000),
    atualizado_em: iso(120),
    ...over,
  }
}

const LOJA_ATIVA_ID = u(6001)
const lojasLista = {
  itens: [
    loja(1, { nome: 'Cantina da Nonna', aberta_agora: true, numeros_whatsapp: { total: 2, conectados: 2 } }),
    loja(2, { nome: 'Burger do Centro', aberta_agora: false, numeros_whatsapp: { total: 1, conectados: 0 } }),
    loja(3, { nome: 'Doceria Bela', ativo: false, aberta_agora: null, papel: 'dono', numeros_whatsapp: { total: 0, conectados: 0 } }),
  ],
}

// ---------------------------------------------------------------- numeros
const numerosLista = {
  numeros: [
    { id: u(9001), loja_id: LOJA_ATIVA_ID, phone_number_id: '101234567890', waba_id: '209876543210', status: 'conectado', verificado: true, criado_em: iso(43200) },
    { id: u(9002), loja_id: LOJA_ATIVA_ID, phone_number_id: '101234567891', waba_id: '209876543210', status: 'pausado', verificado: false, criado_em: iso(20000) },
  ],
}

// ---------------------------------------------------------------- caixa
const CAIXA_ID = u(7001)
const caixaAberto = {
  caixa: {
    id: CAIXA_ID,
    status: 'aberto',
    aberto_por_user_id: u(8000),
    aberto_em: iso(300),
    saldo_inicial_centavos: 10000,
    fechado_por_user_id: null,
    fechado_em: null,
    saldo_informado_centavos: null,
    saldo_calculado_centavos: null,
    diferenca_centavos: null,
    observacoes: null,
  },
}

function caixaRelatorio() {
  return {
    caixa: caixaAberto.caixa,
    totais_por_forma: { dinheiro: 32000, credito: 45000, debito: 18000, pix: 27500, outro: 0 },
    total_vendas_centavos: 122500,
    total_suprimentos_centavos: 5000,
    total_sangrias_centavos: 8000,
    total_ajustes_centavos: 0,
    saldo_esperado_dinheiro_centavos: 39000,
    qtd_movimentos: 4,
    movimentos: [
      { id: u(7101), caixa_id: CAIXA_ID, tipo: 'venda', forma_pagamento: 'dinheiro', valor_centavos: 4890, pedido_id: u(1041), motivo: null, criado_por_user_id: u(8000), criado_em: iso(40) },
      { id: u(7102), caixa_id: CAIXA_ID, tipo: 'venda', forma_pagamento: 'pix', valor_centavos: 5890, pedido_id: u(1042), motivo: null, criado_por_user_id: u(8000), criado_em: iso(55) },
      { id: u(7103), caixa_id: CAIXA_ID, tipo: 'suprimento', forma_pagamento: null, valor_centavos: 5000, pedido_id: null, motivo: 'Troco', criado_por_user_id: u(8000), criado_em: iso(120) },
      { id: u(7104), caixa_id: CAIXA_ID, tipo: 'sangria', forma_pagamento: null, valor_centavos: 8000, pedido_id: null, motivo: 'Retirada do cofre', criado_por_user_id: u(8000), criado_em: iso(180) },
    ],
  }
}

// ---------------------------------------------------------------- salao
function mesa(n: number, over: Record<string, unknown>) {
  return {
    id: u(7500 + n),
    nome: `Mesa ${n}`,
    capacidade: 4,
    ativo: true,
    comanda_aberta_id: null,
    comanda_aberta_total_centavos: null,
    criado_em: iso(100000),
    ...over,
  }
}

const salaoMesas = {
  itens: [
    mesa(1, { comanda_aberta_id: u(7601), comanda_aberta_total_centavos: 8700 }),
    mesa(2, {}),
    mesa(3, { comanda_aberta_id: u(7602), comanda_aberta_total_centavos: 15400, capacidade: 6 }),
    mesa(4, {}),
    mesa(5, { capacidade: 2 }),
    mesa(6, { ativo: false }),
  ],
}

function comandaDetalhe(id: string) {
  return {
    id,
    mesa_id: u(7501),
    mesa_nome: 'Mesa 1',
    status: 'aberta',
    total_centavos: 8700,
    observacoes: null,
    aberta_em: iso(45),
    fechada_em: null,
    itens: [
      { id: u(7701), item_id: u(4501), nome_item: 'Margherita', quantidade: 1, preco_unitario_centavos: 4990, total_centavos: 4990, criado_em: iso(44) },
      { id: u(7702), item_id: u(4504), nome_item: 'Refrigerante lata', quantidade: 1, preco_unitario_centavos: 700, total_centavos: 700, criado_em: iso(40) },
    ],
  }
}

// ---------------------------------------------------------------- pessoas
const cargoMotoboy = u(8101)
const pessoasCargos = {
  itens: [
    { id: cargoMotoboy, loja_id: null, chave: 'motoboy', nome: 'Motoboy', sistema: true, ativo: true, criado_em: iso(100000), atualizado_em: iso(100000) },
    { id: u(8102), loja_id: null, chave: 'atendente', nome: 'Atendente', sistema: true, ativo: true, criado_em: iso(100000), atualizado_em: iso(100000) },
    { id: u(8103), loja_id: LOJA_ATIVA_ID, chave: null, nome: 'Churrasqueiro', sistema: false, ativo: true, criado_em: iso(50000), atualizado_em: iso(50000) },
  ],
}

function pessoa(n: number, over: Record<string, unknown>) {
  return {
    id: u(8200 + n),
    nome: 'Pessoa',
    cargo_id: u(8102),
    cargo_nome: 'Atendente',
    cargo_chave: 'atendente',
    telefone_mascarado: '+55 ** *****-0000',
    observacoes: null,
    ativo: true,
    criado_em: iso(50000),
    atualizado_em: iso(100),
    ...over,
  }
}

const pessoasLista = {
  itens: [
    pessoa(1, { nome: 'Rafael Souza', cargo_id: cargoMotoboy, cargo_nome: 'Motoboy', cargo_chave: 'motoboy', telefone_mascarado: '+55 ** *****-7788' }),
    pessoa(2, { nome: 'Camila Dias', cargo_nome: 'Atendente', telefone_mascarado: '+55 ** *****-3344' }),
    pessoa(3, { nome: 'Jorge Mendes', cargo_id: u(8103), cargo_nome: 'Churrasqueiro', cargo_chave: null, telefone_mascarado: '+55 ** *****-1212' }),
    pessoa(4, { nome: 'Ana Prado', ativo: false, telefone_mascarado: null }),
  ],
}

function pessoaDetalhe(id: string) {
  return {
    ...pessoa(1, { id, nome: 'Rafael Souza', cargo_id: cargoMotoboy, cargo_nome: 'Motoboy', cargo_chave: 'motoboy' }),
    escalas: [
      { id: u(8301), pessoa_id: id, dia_semana: 5, entrada: '18:00', saida: '23:00', ativo: true, criado_em: iso(1000) },
      { id: u(8302), pessoa_id: id, dia_semana: 6, entrada: '18:00', saida: '23:30', ativo: true, criado_em: iso(1000) },
    ],
  }
}

// ---------------------------------------------------------------- estoque
function insumo(n: number, over: Record<string, unknown>) {
  return {
    id: u(8500 + n),
    nome: 'Insumo',
    unidade: 'kg',
    quantidade_atual: 12,
    quantidade_minima: 5,
    custo_unitario_centavos: 1500,
    ativo: true,
    abaixo_minimo: false,
    criado_em: iso(50000),
    atualizado_em: iso(100),
    ...over,
  }
}

const estoqueInsumos = {
  itens: [
    insumo(1, { nome: 'Mucarela', unidade: 'kg', quantidade_atual: 8.5, quantidade_minima: 5, custo_unitario_centavos: 4200 }),
    insumo(2, { nome: 'Farinha de trigo', unidade: 'kg', quantidade_atual: 2, quantidade_minima: 10, abaixo_minimo: true, custo_unitario_centavos: 650 }),
    insumo(3, { nome: 'Molho de tomate', unidade: 'l', quantidade_atual: 14, quantidade_minima: 6, custo_unitario_centavos: 900 }),
    insumo(4, { nome: 'Caixa de pizza', unidade: 'un', quantidade_atual: 40, quantidade_minima: 50, abaixo_minimo: true, custo_unitario_centavos: 120 }),
    insumo(5, { nome: 'Refrigerante lata', unidade: 'un', quantidade_atual: 96, quantidade_minima: 24, custo_unitario_centavos: 300 }),
  ],
}

function fichaTecnica(itemId: string) {
  return {
    item_id: itemId,
    linhas: [
      { insumo_id: u(8501), quantidade: 0.15 },
      { insumo_id: u(8503), quantidade: 0.1 },
    ],
  }
}

function insumoMovimentos() {
  return {
    itens: [
      { id: u(8601), insumo_id: u(8501), tipo: 'entrada', quantidade: 10, quantidade_resultante: 18.5, motivo: 'Compra', pedido_id: null, criado_por_user_id: u(8000), criado_em: iso(2000) },
      { id: u(8602), insumo_id: u(8501), tipo: 'consumo', quantidade: 10, quantidade_resultante: 8.5, motivo: null, pedido_id: u(1041), criado_por_user_id: null, criado_em: iso(60) },
    ],
  }
}

// ---------------------------------------------------------------- disponibilidade
const dispAgora = { agora: iso(0), aceitando_agora: true, atendente_pode_responder: true }

const dispHorarios = {
  itens: [0, 1, 2, 3, 4, 5, 6].flatMap((dia) =>
    dia === 1
      ? []
      : [
          { id: u(8700 + dia), dia_semana: dia, abre: '18:00', fecha: '23:30', ativo: true, criado_em: iso(5000), atualizado_em: iso(5000) },
        ],
  ),
}

const dispJanela = {
  janela: { inicio: '17:00', fim: '23:59', dias: [0, 2, 3, 4, 5, 6], ativo: true, atualizado_em: iso(2000) },
}

const dispExcecoes = {
  itens: [
    { id: u(8801), data: '2026-12-25', fechado: true, abre: null, fecha: null, motivo: 'Natal', ativo: true, criado_em: iso(5000) },
    { id: u(8802), data: '2026-12-31', fechado: false, abre: '18:00', fecha: '20:00', motivo: 'Vespera de ano novo', ativo: true, criado_em: iso(5000) },
  ],
}

export const LOJAS_RESUMO = [
  { id: LOJA_ATIVA_ID, nome: 'Cantina da Nonna', logo_url: null, cores: { primaria: '#3e7c5b' }, ativo: true },
  { id: u(6002), nome: 'Burger do Centro', logo_url: null, cores: { primaria: '#b97e22' }, ativo: true },
]

/** Resolve o mock para um path REST (ja sem prefixo /v1, como o apiClient recebe). */
export function mockFor(path: string): unknown {
  const p = path.split('?')[0]!.replace(/\/+$/, '')

  // Rotas com id no meio (checar antes das exatas).
  if (/^\/caixa\/[^/]+\/relatorio$/.test(p)) return caixaRelatorio()
  if (/^\/conversas\/[^/]+\/mensagens$/.test(p)) return conversaMensagens(p.split('/')[2]!)
  if (/^\/conversas\/[^/]+$/.test(p)) return conversaDetalhe(p.split('/')[2]!)
  if (/^\/clientes\/[^/]+$/.test(p)) return clienteDetalhe(p.split('/')[2]!)
  if (/^\/pessoas\/[^/]+\/escalas$/.test(p)) return { itens: [] }
  if (/^\/pessoas\/(cargos)$/.test(p)) return pessoasCargos
  if (/^\/pessoas\/[^/]+$/.test(p)) return pessoaDetalhe(p.split('/')[2]!)
  if (/^\/salao\/comandas\/[^/]+$/.test(p)) return comandaDetalhe(p.split('/')[3]!)
  if (/^\/estoque-insumos\/[^/]+\/movimentos$/.test(p)) return insumoMovimentos()
  if (/^\/ficha-tecnica\/itens\/[^/]+$/.test(p)) return fichaTecnica(p.split('/')[3]!)

  switch (p) {
    case '/pedidos':
      return pedidosKanban
    case '/conversas':
      return conversasLista
    case '/cardapio':
      return cardapioArvore
    case '/cardapio/grupos':
      return cardapioGrupos
    case '/clientes':
      return clientesLista
    case '/lojas':
      return lojasLista
    case '/numeros':
      return numerosLista
    case '/caixa/aberto':
      return caixaAberto
    case '/salao/mesas':
      return salaoMesas
    case '/pessoas':
      return pessoasLista
    case '/pessoas/cargos':
      return pessoasCargos
    case '/estoque-insumos':
      return estoqueInsumos
    case '/disponibilidade/agora':
      return dispAgora
    case '/disponibilidade/horarios':
      return dispHorarios
    case '/disponibilidade/janela':
      return dispJanela
    case '/disponibilidade/excecoes':
      return dispExcecoes
    default:
      // Fallback generico: muitas telas toleram uma lista vazia.
      return { itens: [] }
  }
}
