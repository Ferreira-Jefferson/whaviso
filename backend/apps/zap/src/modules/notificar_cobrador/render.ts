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
  }
}
