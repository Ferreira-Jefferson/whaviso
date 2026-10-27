// Termos de Uso do Whaviso. Conteudo juridico adaptado ao produto real: automacao de
// pedidos e gestao do restaurante por WhatsApp. O Whaviso nao cozinha, nao entrega e nao
// transaciona dinheiro: o cliente paga o restaurante direto (Pix). A loja paga a Whaviso
// por assinatura mensal. Linguagem das Regras de Ouro: vocabulario aprovado, sem
// travessao, neutro quanto a genero.
import { Link } from 'react-router'
import { DocumentoLegal, Secao, P, Lista, Email } from '../components/legal-ui'

const CONTATO = 'contato@whaviso.com'

export default function TermosUsoPage() {
  return (
    <DocumentoLegal
      titulo="Termos de Uso"
      atualizadoEm="27 de outubro de 2026"
      tituloAba="Whaviso | Termos de Uso"
    >
      <Secao n={1} titulo="Aceitação dos termos">
        <P>
          Ao acessar ou usar o Whaviso, você concorda com estes Termos de Uso. O serviço é operado
          por 56.883.976 Jefferson Cristian Tertuliano Cavalcante Ferreira (MEI), CNPJ
          56.883.976/0001-04 (<Email endereco={CONTATO} />). Estes termos valem para o restaurante
          que assina o Whaviso e para as pessoas da sua equipe que acessam o painel. Se você não
          concordar com qualquer parte destes termos, não utilize o serviço.
        </P>
      </Secao>

      <Secao n={2} titulo="O que o Whaviso faz">
        <P>
          O Whaviso automatiza o atendimento de pedidos do seu restaurante pelo WhatsApp e organiza,
          num painel, a operação: cardápio, pedidos, conversas, caixa, salão, entrega, clientes e
          relatórios. Um atendente automático recebe os pedidos dos seus clientes no WhatsApp e você
          acompanha e gerencia tudo pelo painel.
        </P>
        <P>
          O Whaviso é uma ferramenta de software: ele não prepara alimentos, não faz a entrega e não
          movimenta dinheiro. O preparo, a qualidade, a entrega e o cumprimento de cada pedido são de
          responsabilidade do restaurante. O pagamento acontece diretamente entre o seu cliente e
          você: quando usa Pix, o valor vai direto para a sua chave; o Whaviso apenas organiza a
          cobrança, não recebe nem repassa o dinheiro dos seus pedidos.
        </P>
      </Secao>

      <Secao n={3} titulo="Sua conta">
        <Lista>
          <li>
            O acesso é sem senha: por conta Google ou por código enviado ao seu WhatsApp. O número
            de WhatsApp é a sua identidade.
          </li>
          <li>Você é responsável pela veracidade dos dados que cadastra, incluindo cardápio, preços e dados da loja.</li>
          <li>
            Você é responsável pelos acessos da sua equipe e pelo uso que fizerem do painel em nome
            do restaurante.
          </li>
          <li>Podemos suspender contas que violem estes termos.</li>
        </Lista>
      </Secao>

      <Secao n={4} titulo="Uso responsável e seus clientes">
        <P>
          Você declara ter uma relação legítima com os clientes que atende pelo Whaviso e autorização
          para contatá-los por WhatsApp. É proibido usar o Whaviso para mensagem não solicitada em
          massa, assédio, ameaça ou qualquer contato hostil. Toda campanha e todo contato ativo devem
          respeitar quem pede para não receber mais mensagens. É proibido enviar conteúdo ofensivo,
          enganoso, ilegal ou que viole direitos de terceiros. Podemos remover conteúdo e interromper
          envios em caso de violação.
        </P>
      </Secao>

      <Secao n={5} titulo="Atendente automático">
        <P>
          O atendente automático funciona com um provedor de inteligência artificial configurado por
          você, com a sua própria chave. O atendente ajuda a receber e montar pedidos, mas pode
          errar: a confirmação do pedido, do preço e dos dados de entrega é sempre sua. Os custos de
          uso da sua chave de provedor são de sua responsabilidade e cobrados pelo provedor que você
          escolher, não pelo Whaviso. Você é responsável por manter o cardápio e as informações que o
          atendente usa corretos e atualizados.
        </P>
      </Secao>

      <Secao n={6} titulo="Assinatura e pagamento">
        <P>
          O uso do Whaviso pelo restaurante é cobrado por assinatura. O valor, o período e as
          condições vigentes são apresentados no painel, na sua fatura.
        </P>
        <Lista>
          <li>A cobrança da assinatura é recorrente enquanto a conta estiver ativa.</li>
          <li>
            O não pagamento de uma fatura pode levar à suspensão do acesso ao painel e à interrupção
            do atendimento automático, após aviso.
          </li>
          <li>
            A assinatura do Whaviso é separada do pagamento dos seus pedidos: o que seus clientes
            pagam a você não passa pelo Whaviso.
          </li>
        </Lista>
      </Secao>

      <Secao n={7} titulo="Limitação de responsabilidade">
        <P>
          O Whaviso é fornecido "como está". Não nos responsabilizamos por indisponibilidade ou
          demora na entrega de mensagens que dependam de terceiros (WhatsApp/Meta, operadoras, o
          provedor de inteligência artificial que você configura e provedores de mapa), por respostas
          imprecisas do atendente automático, por decisões comerciais, de preparo ou de entrega
          tomadas pelo restaurante, pelo pagamento acordado entre você e o seu cliente, nem por
          interrupções do serviço. O Whaviso não é parte da relação de consumo entre o restaurante e
          o cliente final.
        </P>
      </Secao>

      <Secao n={8} titulo="Privacidade">
        <P>
          O tratamento de dados pessoais é descrito na nossa{' '}
          <Link
            to="/politica-de-privacidade"
            className="font-medium text-salvia underline underline-offset-2 hover:text-folha"
          >
            Política de Privacidade
          </Link>
          .
        </P>
      </Secao>

      <Secao n={9} titulo="Alterações">
        <P>
          Podemos atualizar estes termos a qualquer momento. O uso continuado do serviço após
          alterações constitui aceite dos novos termos.
        </P>
      </Secao>

      <Secao n={10} titulo="Lei aplicável">
        <P>
          Estes termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de
          Caçapava/SP para dirimir controvérsias, sem prejuízo do direito do consumidor de acionar o
          foro do seu domicílio.
        </P>
      </Secao>

      <Secao n={11} titulo="Contato">
        <P>
          <strong className="text-tinta">
            56.883.976 Jefferson Cristian Tertuliano Cavalcante Ferreira (MEI)
          </strong>
          <br />
          CNPJ 56.883.976/0001-04, Caçapava/SP, Brasil
          <br />
          <Email endereco={CONTATO} />
        </P>
      </Secao>
    </DocumentoLegal>
  )
}
