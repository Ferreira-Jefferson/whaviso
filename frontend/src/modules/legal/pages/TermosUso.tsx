// Termos de Uso do Whaviso. Conteudo juridico adaptado ao produto real: o Whaviso
// avisa e organiza pagamentos combinados, nao transaciona dinheiro nem confirma
// pagamento sozinho (Epico 13). Pre-pago por credito de envio, recarga por Pix.
// Linguagem das Regras de Ouro: vocabulario aprovado, sem travessao, neutro.
import { Link } from 'react-router'
import { DocumentoLegal, Secao, P, Lista, Email } from '../components/legal-ui'

const CONTATO = 'contato@whaviso.com'

export default function TermosUsoPage() {
  return (
    <DocumentoLegal
      titulo="Termos de Uso"
      atualizadoEm="5 de julho de 2026"
      tituloAba="Whaviso | Termos de Uso"
    >
      <Secao n={1} titulo="Aceitação dos termos">
        <P>
          Ao acessar ou usar o Whaviso, você concorda com estes Termos de Uso. O serviço é operado
          por 56.883.976 Jefferson Cristian Tertuliano Cavalcante Ferreira (MEI), CNPJ
          56.883.976/0001-04 (<Email endereco={CONTATO} />). Se você não concordar com qualquer
          parte destes termos, não utilize o serviço.
        </P>
      </Secao>

      <Secao n={2} titulo="O que o Whaviso faz">
        <P>
          O Whaviso automatiza avisos de pagamento por WhatsApp e organiza, num painel, o que está
          combinado, o que já foi recebido e o que ainda vai ser pago.
        </P>
        <P>
          O Whaviso apenas avisa e organiza: não movimenta dinheiro, não dá baixa em pagamento e não
          confirma pagamento sozinho. Quem confirma que um pagamento chegou é sempre a pessoa que
          criou o combinado; o botão "Já paguei" é apenas um aviso, não uma transação. O Whaviso
          também não é um canal de conversa: a pessoa avisada interage por botões, sem chat.
        </P>
      </Secao>

      <Secao n={3} titulo="Sua conta">
        <Lista>
          <li>
            O acesso é sem senha: por conta Google ou por código enviado ao seu WhatsApp. O número
            de WhatsApp é a sua identidade.
          </li>
          <li>Você é responsável pela veracidade dos dados que cadastra.</li>
          <li>
            Você deve ter uma relação legítima com as pessoas que decide avisar e autorização para
            contatá-las por WhatsApp.
          </li>
          <li>
            É proibido usar o Whaviso para assédio, ameaça, mensagem não solicitada em massa ou
            qualquer contato hostil.
          </li>
          <li>Podemos suspender contas que violem estes termos.</li>
        </Lista>
      </Secao>

      <Secao n={4} titulo="Uso responsável e conteúdo">
        <P>
          Ao criar um combinado, você declara ter um acordo real de pagamento com a pessoa avisada e
          o direito de contatá-la. É proibido enviar conteúdo ofensivo, enganoso, ilegal ou que
          viole direitos de terceiros. Toda mensagem enviada pelo Whaviso traz a opção de sair dos
          lembretes em um toque; quando alguém pede para parar, insistir por fora, contra a vontade
          da pessoa, é proibido. Podemos remover conteúdo e interromper envios em caso de violação.
        </P>
      </Secao>

      <Secao n={5} titulo="Créditos de envio e pagamento">
        <P>
          O Whaviso é pré-pago por crédito de envio: cada lembrete enviado usa um crédito. A conta
          começa com um saldo de cortesia e você recarrega quando quiser, na quantidade que precisar.
        </P>
        <Lista>
          <li>
            No momento, a recarga é feita por Pix, direto para a chave da plataforma, com liberação
            manual do crédito. Meios automáticos de pagamento podem ser adicionados no futuro.
          </li>
          <li>O saldo comprado não expira.</li>
          <li>
            O crédito só é consumido quando o lembrete de fato é enviado. Um combinado não aceito
            devolve o crédito ao seu saldo.
          </li>
        </Lista>
      </Secao>

      <Secao n={6} titulo="Limitação de responsabilidade">
        <P>
          O Whaviso é fornecido "como está". Não nos responsabilizamos por indisponibilidade ou
          demora na entrega de mensagens que dependam de terceiros (WhatsApp/Meta e operadoras), por
          decisões de pagamento tomadas entre as partes de um combinado, nem por interrupções do
          serviço. O Whaviso não é parte do acordo de pagamento entre você e a pessoa avisada.
        </P>
      </Secao>

      <Secao n={7} titulo="Privacidade">
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

      <Secao n={8} titulo="Alterações">
        <P>
          Podemos atualizar estes termos a qualquer momento. O uso continuado do serviço após
          alterações constitui aceite dos novos termos.
        </P>
      </Secao>

      <Secao n={9} titulo="Lei aplicável">
        <P>
          Estes termos são regidos pela legislação brasileira. Fica eleito o foro da comarca de
          Caçapava/SP para dirimir controvérsias, sem prejuízo do direito do consumidor de acionar o
          foro do seu domicílio.
        </P>
      </Secao>

      <Secao n={10} titulo="Contato">
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
