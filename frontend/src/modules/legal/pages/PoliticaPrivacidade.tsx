// Politica de Privacidade do Whaviso (LGPD), adaptada ao produto real: automacao de
// pedidos e gestao do restaurante por WhatsApp. Papeis: a Whaviso e controladora dos
// dados da conta do restaurante e operadora dos dados dos clientes finais, que o
// restaurante controla. Login sem senha (Google/WhatsApp), atendente com a chave do
// provedor da loja, Pix direto para a loja. Linguagem das Regras de Ouro: vocabulario
// aprovado, sem travessao, neutro quanto a genero.
import { DocumentoLegal, Secao, Sub, P, Lista, BaseLegal, LinkExterno, Email } from '../components/legal-ui'

const CONTATO = 'contato@whaviso.com'

export default function PoliticaPrivacidadePage() {
  return (
    <DocumentoLegal
      titulo="Política de Privacidade"
      atualizadoEm="27 de outubro de 2026"
      tituloAba="Whaviso | Política de Privacidade"
    >
      <Secao n={1} titulo="Quem somos">
        <P>
          O Whaviso automatiza o atendimento de pedidos de restaurantes pelo WhatsApp e organiza a
          operação num painel. O serviço é operado por 56.883.976 Jefferson Cristian Tertuliano
          Cavalcante Ferreira (MEI), CNPJ 56.883.976/0001-04, Caçapava/SP, Brasil (
          <Email endereco={CONTATO} />). Este documento descreve como coletamos, usamos e protegemos
          dados pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD, Lei nº
          13.709/2018).
        </P>
      </Secao>

      <Secao n={2} titulo="Nossos papéis: controlador e operador">
        <P>
          O Whaviso trata dados pessoais em dois papéis diferentes, e é importante distinguir:
        </P>
        <Lista>
          <li>
            <strong>Dados da conta do restaurante</strong> (quem assina e usa o painel): aqui o
            Whaviso é o <strong>controlador</strong>, pois decide sobre esse tratamento para prestar
            o serviço.
          </li>
          <li>
            <strong>Dados dos clientes do restaurante</strong> (as pessoas que fazem pedidos pelo
            WhatsApp): aqui o restaurante é o <strong>controlador</strong> desses dados e o Whaviso é
            o <strong>operador</strong>, que os trata apenas para executar o atendimento e a gestão
            de pedidos em nome do restaurante. O restaurante é quem responde pela relação com os seus
            clientes.
          </li>
        </Lista>
      </Secao>

      <Secao n={3} titulo="Dados que coletamos e finalidades">
        <Sub>3.1 Acesso à conta</Sub>
        <P>O Whaviso não usa e-mail e senha. Você entra de duas formas:</P>
        <Lista>
          <li>
            <strong>Com sua conta Google</strong> (OAuth): coletamos nome, e-mail, foto de perfil
            e o identificador da conta Google, para criar e identificar seu perfil.
          </li>
          <li>
            <strong>Pelo WhatsApp</strong>: coletamos seu número e nome. O número é a sua
            identidade no Whaviso: enviamos um código de acesso no próprio WhatsApp e você o digita
            para entrar.
          </li>
        </Lista>
        <BaseLegal>execução de contrato (LGPD, art. 7º, V).</BaseLegal>

        <Sub>3.2 Pedidos e clientes do restaurante</Sub>
        <P>
          Para atender e gerenciar pedidos, o Whaviso trata, em nome do restaurante, dados dos
          clientes finais:
        </P>
        <Lista>
          <li>Nome e número de WhatsApp do cliente que faz o pedido.</li>
          <li>Conteúdo das conversas e dos pedidos no WhatsApp, incluindo itens, observações e valores.</li>
          <li>Endereço de entrega, quando o pedido é para entrega.</li>
        </Lista>
        <P>
          Usamos esses dados apenas para receber, montar e acompanhar os pedidos, organizar a entrega
          e manter o histórico do cliente no painel do restaurante.
        </P>
        <BaseLegal>
          tratamento feito como operador, por conta e ordem do restaurante (controlador), para
          execução do contrato entre o restaurante e o seu cliente (LGPD, art. 7º, V) e no legítimo
          interesse de atender o pedido (LGPD, art. 7º, IX).
        </BaseLegal>

        <Sub>3.3 Atendente automático</Sub>
        <P>
          O atendente automático usa um provedor de inteligência artificial configurado pelo
          restaurante, com a chave do próprio restaurante. As mensagens do cliente são enviadas a
          esse provedor para gerar as respostas do atendimento. A escolha do provedor é do
          restaurante; o uso é regido também pela política do provedor escolhido.
        </P>
        <BaseLegal>execução de contrato (LGPD, art. 7º, V).</BaseLegal>

        <Sub>3.4 Uso da plataforma</Sub>
        <Lista>
          <li>
            Eventos dos pedidos (estados, pagamentos informados, entregas) e o histórico de mensagens
            enviadas, para acompanhar a operação no painel.
          </li>
          <li>Dados da assinatura: histórico de faturas e situação de pagamento da conta do restaurante.</li>
        </Lista>
        <BaseLegal>execução de contrato (LGPD, art. 7º, V).</BaseLegal>

        <Sub>3.5 Cookies e armazenamento no navegador</Sub>
        <P>
          O Whaviso não usa cookies próprios nem ferramentas de análise, publicidade ou rastreamento
          de terceiros. Para manter você conectado, guardamos apenas o token da sessão de login no
          armazenamento local (localStorage) do seu navegador: ele fica no seu dispositivo, é
          estritamente necessário para o serviço funcionar e é apagado quando você sai. O login com
          Google pode gerar cookies no domínio do próprio Google, sob a política do Google.
        </P>
        <BaseLegal>
          legítimo interesse (LGPD, art. 7º, IX), estritamente necessário para o serviço funcionar.
        </BaseLegal>
      </Secao>

      <Secao n={4} titulo="Com quem compartilhamos dados">
        <P>Para funcionar, o Whaviso se apoia nestes provedores:</P>
        <Lista>
          <li>
            <strong>Google LLC</strong>: login com conta Google (OAuth).{' '}
            <LinkExterno href="https://policies.google.com/privacy">Política do Google</LinkExterno>.
          </li>
          <li>
            <strong>Meta Platforms, Inc.</strong> (WhatsApp): entrega das mensagens de atendimento no
            WhatsApp.{' '}
            <LinkExterno href="https://www.whatsapp.com/legal/privacy-policy">
              Política do WhatsApp
            </LinkExterno>
            .
          </li>
          <li>
            <strong>Provedor de inteligência artificial</strong> configurado pelo restaurante
            (ex.: OpenRouter, Anthropic ou outro): processa as mensagens do atendimento para gerar as
            respostas, sob a chave e a política do provedor escolhido pelo restaurante.
          </li>
          <li>
            <strong>Provedor de mapas</strong>: cálculo de rotas e zonas de entrega, quando o pedido
            é para entrega.
          </li>
          <li>
            <strong>Supabase, Inc.</strong>: banco de dados e autenticação.{' '}
            <LinkExterno href="https://supabase.com/privacy">Política da Supabase</LinkExterno>.
          </li>
          <li>
            <strong>Hostinger</strong>: hospedagem da aplicação.{' '}
            <LinkExterno href="https://www.hostinger.com.br/politica-privacidade">
              Política da Hostinger
            </LinkExterno>
            .
          </li>
        </Lista>
        <P>
          Os pagamentos dos pedidos por Pix vão direto para a chave do restaurante: não há
          processador de pagamento terceirizado e não coletamos dados de cartão. Não vendemos dados e
          não os compartilhamos com terceiros fora dos listados acima.
        </P>
      </Secao>

      <Secao n={5} titulo="Por quanto tempo guardamos">
        <Lista>
          <li>Dados de conta, pedidos e faturas: enquanto a conta existir.</li>
          <li>
            Pedidos e registros de eventos não são apagados: eles mudam de estado e ficam como
            histórico da operação, para preservar a integridade do registro.
          </li>
          <li>
            Ao pedir a exclusão: removemos ou anonimizamos os dados pessoais, mantendo apenas
            registros não identificáveis quando houver obrigação legal ou necessidade de
            integridade.
          </li>
        </Lista>
      </Secao>

      <Secao n={6} titulo="Direitos do titular (LGPD, art. 18)">
        <P>
          Você pode, a qualquer momento, exercer os direitos de acesso, correção, exclusão ou
          anonimização, portabilidade, informação sobre compartilhamento e oposição ao tratamento
          feito com base em legítimo interesse. Se você é cliente de um restaurante que usa o Whaviso,
          os seus dados foram informados por esse restaurante, que é o controlador: você pode falar
          diretamente com ele, e também podemos encaminhar o seu pedido ao restaurante responsável.
        </P>
        <P>
          Para exercer qualquer direito ou tirar dúvidas, escreva para <Email endereco={CONTATO} />.
        </P>
      </Secao>

      <Secao n={7} titulo="Clientes do restaurante">
        <P>
          Se você fez um pedido pelo WhatsApp a um restaurante que usa o Whaviso, seus dados (nome,
          número, pedido e, quando há entrega, endereço) foram informados por você a esse restaurante
          e são tratados por ele, com o Whaviso atuando como operador. O restaurante é o controlador
          desses dados e o ponto de contato principal. Para parar de receber mensagens de contato
          ativo (campanhas), responda conforme indicado na própria mensagem; para pedir a remoção dos
          seus dados, fale com o restaurante ou escreva para <Email endereco={CONTATO} /> que
          encaminhamos ao responsável.
        </P>
      </Secao>

      <Secao n={8} titulo="Segurança">
        <P>
          Adotamos medidas técnicas para proteger os dados: o navegador nunca acessa o banco
          diretamente (todo dado passa pela nossa API); as sessões são validadas por token assinado;
          tokens e chaves sensíveis ficam guardados apenas de forma cifrada ou como hash; os acessos
          ao banco usam papéis de privilégio mínimo; o tráfego é sempre por HTTPS; e há uma regra
          rígida de nunca registrar em log dado sensível, como número de telefone, chave Pix, chave
          de provedor ou token.
        </P>
      </Secao>

      <Secao n={9} titulo="Alterações nesta política">
        <P>
          Podemos atualizar esta política periodicamente. A data no topo indica a versão mais
          recente. Mudanças relevantes são comunicadas na plataforma.
        </P>
      </Secao>

      <Secao n={10} titulo="Contato">
        <P>Dúvidas, solicitações de titular de dados ou reclamações:</P>
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
