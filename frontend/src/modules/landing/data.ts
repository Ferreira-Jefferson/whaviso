// Camada de dados do módulo landing.
//
// A landing é pública e, no modelo de carteira de créditos de envio, não há mais
// catálogo público de planos para buscar: a seção de preços passou a ser estática
// (explica o modelo de créditos, sem chamar a api). Por isso este módulo não tem,
// por enquanto, nenhum acesso a dado de servidor. Mantido como ponto de extensão
// caso a landing volte a precisar de estado de servidor (sempre via api_client,
// nunca importando outro módulo).
export {}
