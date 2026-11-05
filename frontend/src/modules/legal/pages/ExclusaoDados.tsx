// Instrucoes de exclusao de dados do Whaviso. Pagina exigida pela Meta (campo "Instrucoes de
// exclusao de dados" do app) e util para a LGPD. O Whaviso automatiza o atendimento do
// restaurante por WhatsApp: processa o numero e as mensagens dos clientes finais em nome do
// restaurante (que e o controlador), e os dados de acesso da equipe do restaurante. Linguagem
// das Regras de Ouro: vocabulario aprovado, sem travessao, neutro quanto a genero.
import { Link } from 'react-router'
import { DocumentoLegal, Secao, Sub, P, Lista, Email } from '../components/legal-ui'

const CONTATO = 'contato@whaviso.com'

export default function ExclusaoDadosPage() {
  return (
    <DocumentoLegal
      titulo="Instruções de exclusão de dados"
      atualizadoEm="5 de novembro de 2026"
      tituloAba="Whaviso | Exclusão de dados"
    >
      <Secao n={1} titulo="Quem somos">
        <P>
          O Whaviso é operado por 56.883.976 Jefferson Cristian Tertuliano Cavalcante Ferreira
          (MEI), CNPJ 56.883.976/0001-04 (<Email endereco={CONTATO} />). Esta página explica como
          pedir a exclusão dos dados tratados pelo Whaviso, tanto para o restaurante que assina o
          serviço quanto para a pessoa que conversou com um restaurante pelo WhatsApp.
        </P>
      </Secao>

      <Secao n={2} titulo="Que dados o Whaviso trata">
        <P>
          O Whaviso automatiza o atendimento de pedidos do restaurante pelo WhatsApp e organiza a
          operação num painel. Nesse uso, ele trata:
        </P>
        <Lista>
          <li>
            dados da conta do restaurante e da sua equipe (nome, e-mail de acesso, configuração da
            loja e do número de WhatsApp conectado);
          </li>
          <li>
            dados das pessoas que conversam com o restaurante pelo WhatsApp (número de telefone e o
            conteúdo das mensagens trocadas com o atendimento), tratados em nome do restaurante.
          </li>
        </Lista>
        <P>
          Em relação às conversas dos clientes finais, o restaurante é o controlador dos dados e o
          Whaviso atua como operador, tratando esses dados apenas para prestar o serviço ao
          restaurante.
        </P>
      </Secao>

      <Secao n={3} titulo="Como pedir a exclusão">
        <Sub>Se você é o restaurante (assina o Whaviso)</Sub>
        <P>
          Envie um pedido de exclusão para <Email endereco={CONTATO} />, do e-mail cadastrado na sua
          conta, informando o nome da loja. A exclusão encerra a sua conta e remove os dados
          associados, respeitadas as retenções legais descritas abaixo.
        </P>
        <Sub>Se você conversou com um restaurante pelo WhatsApp</Sub>
        <P>
          Os dados da sua conversa pertencem ao restaurante com quem você falou. Você pode pedir a
          exclusão diretamente a esse restaurante ou escrever para <Email endereco={CONTATO} />
          informando com qual estabelecimento você conversou e o número de telefone usado, para que
          possamos localizar e encaminhar ou atender o pedido.
        </P>
        <P>
          Para confirmar a identidade de quem pede, podemos solicitar informações adicionais antes de
          concluir a exclusão, de modo a proteger os dados contra pedidos indevidos.
        </P>
      </Secao>

      <Secao n={4} titulo="Prazo e o que é excluído">
        <P>
          Confirmado o pedido, concluímos a exclusão em até 30 dias. São removidos os dados pessoais
          objeto do pedido dos nossos sistemas ativos. Podemos reter parte dos dados apenas pelo
          tempo e na medida exigidos por obrigação legal ou regulatória, ou para o exercício regular
          de direitos, após o que também são eliminados.
        </P>
      </Secao>

      <Secao n={5} titulo="Dados vindos da Meta (WhatsApp)">
        <P>
          Quando um restaurante conecta o próprio número pelo cadastro da Meta (WhatsApp Cloud API),
          o Whaviso guarda somente o necessário para enviar e receber as mensagens daquele número. Ao
          desconectar o número ou excluir a conta, as credenciais e os dados associados a esse número
          são removidos conforme esta política.
        </P>
      </Secao>

      <Secao n={6} titulo="Documentos relacionados">
        <P>
          Veja também a nossa{' '}
          <Link to="/politica-de-privacidade" className="text-salvia underline">
            Política de Privacidade
          </Link>{' '}
          e os{' '}
          <Link to="/termos-de-uso" className="text-salvia underline">
            Termos de Uso
          </Link>
          .
        </P>
      </Secao>
    </DocumentoLegal>
  )
}
