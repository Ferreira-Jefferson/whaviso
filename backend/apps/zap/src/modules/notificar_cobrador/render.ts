import { formatarDataBr, formatarValorBr } from '@whaviso/shared/datas'
import type { DadosNotificacao } from './repo'

/**
 * Mapa nome -> valor das variáveis da notificação ao alvo (cobrador ou devedor-
 * criador). O render do texto (substituição de {{n}}) é feito pelo shared/templates
 * a partir deste mapa e da ordem em `variaveis` do template; aqui só resolvemos/
 * formatamos os valores. NUNCA inclui telefone/Pix/token (não vão a log nem a render).
 *
 * `codigo` identifica o combinado (H10.3/H10.5: "do combinado xxx-xxx"); `alvo` é o
 * nome de saudação de quem recebe. As demais (nome_devedor/motivo/valor/data) servem
 * às chaves que as usam (ex.: pagamento_informado).
 */
export function valoresNotificacao(d: DadosNotificacao): Record<string, string> {
  return {
    alvo: d.nome_alvo,
    codigo: d.codigo,
    nome_devedor: d.nome_devedor,
    // E8 devedor.*: quem RECEBE o pagamento (cobrador), p/ "fale com {{cobrador}}".
    cobrador: d.nome_cobrador,
    data: formatarDataBr(d.data_combinada),
    valor: formatarValorBr(d.valor_centavos),
    motivo: d.motivo,
    // E14 devedor.pix_chave_recebida: a chave e seus dados. Vazio quando o combinado não
    // tem chave (a notificação só é enfileirada quando há, então na prática vêm cheios).
    pix_chave: d.pix_chave ?? '',
    pix_titular: d.pix_titular ?? '',
    pix_banco: d.pix_banco ?? '',
  }
}

/**
 * H10.7/H8.5: CTA DISCRETA de criar conta, anexada em RUNTIME (não fica no template,
 * decisão do dono, ver migration 0042) APENAS para o cobrador SEM conta (cobrador_id
 * nulo, alvo_papel='cobrador'). Quem já tem conta NÃO recebe esta linha. Convite gentil
 * e neutro a acompanhar pelo painel; nunca obrigatório. Sem palavra proibida, sem
 * travessão, neutro quanto a gênero.
 */
export function linhaCtaCriarConta(appUrl: string): string {
  const link = `${appUrl.replace(/\/$/, '')}/entrar`
  return `Quer acompanhar tudo pelo painel? Crie sua conta: ${link}`
}

/** Anexa a linha da CTA ao fim do texto, separada por uma linha em branco. */
export function anexarCta(texto: string, appUrl: string): string {
  return `${texto}\n\n${linhaCtaCriarConta(appUrl)}`
}
