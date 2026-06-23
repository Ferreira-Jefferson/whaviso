import { formatarDataBr, formatarValorBr } from '@whaviso/shared/datas'
import type { DadosEnvio } from './repo'

/**
 * Mapa nome -> valor das variáveis do ciclo de lembretes. O texto ({{n}}) e os
 * botões são montados pelo shared/templates a partir do `conteudo` do template e
 * da ordem em `variaveis`; aqui só resolvemos/formatamos os valores. Os botões do
 * ciclo vêm do template (conteudo.botoes) e aparecem os três em todas as etapas (H6.2).
 * A variável `cobrador` (= "quem recebe") vem de coalesce(nome_cobrador, profile) no repo,
 * resolvendo o invertido sem texto sem sentido (G11).
 */
export function valoresCiclo(d: DadosEnvio): Record<string, string> {
  return {
    nome_devedor: d.nome_devedor,
    data: formatarDataBr(d.data_combinada),
    valor: formatarValorBr(d.valor_centavos),
    motivo: d.motivo,
    cobrador: d.nome_cobrador,
    pix_chave: d.pix_chave ?? '',
  }
}
