// Politica de Privacidade do Whaviso. Conteudo juridico (LGPD), adaptado ao produto
// real: login sem senha (Google/WhatsApp), combinados de aviso de pagamento, carteira
// de creditos por Pix. Linguagem das Regras de Ouro (Epico 13): vocabulario aprovado,
// sem travessao, neutro quanto a genero.
import { DocumentoLegal, Secao, Sub, P, Lista, BaseLegal, LinkExterno, Email } from '../components/legal-ui'

const CONTATO = 'contato@whaviso.com'

export default function PoliticaPrivacidadePage() {
  return (
    <DocumentoLegal
      titulo="Política de Privacidade"
      atualizadoEm="5 de julho de 2026"
      tituloAba="Whaviso | Política de Privacidade"
    >
      <Secao n={1} titulo="Quem somos">
        <P>
          O Whaviso automatiza avisos de pagamento por WhatsApp e organiza, num painel, o que
          está combinado, o que já foi recebido e o que ainda vai ser pago. O serviço é operado
          por 56.883.976 Jefferson Cristian Tertuliano Cavalcante Ferreira (MEI), CNPJ
          56.883.976/0001-04, Caçapava/SP, Brasil (<Email endereco={CONTATO} />). Este documento
          descreve como coletamos, usamos e protegemos seus dados pessoais em conformidade com a
          Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
        </P>
      </Secao>

      <Secao n={2} titulo="Dados que coletamos e finalidades">
        <Sub>2.1 Acesso à conta</Sub>
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

        <Sub>2.2 Combinados que você cria</Sub>
        <P>Ao criar um combinado, você informa dados sobre a pessoa que vai receber o aviso:</P>
        <Lista>
          <li>Nome e número de WhatsApp de quem vai receber o lembrete.</li>
          <li>Valor, descrição e data do combinado.</li>
          <li>Sua chave Pix, quando você optar por exibi-la a quem vai pagar.</li>
        </Lista>
        <P>
          Usamos esses dados apenas para montar e enviar os lembretes combinados e para organizar o
          combinado no seu painel.
        </P>
        <BaseLegal>
          execução de contrato com quem cria o combinado (LGPD, art. 7º, V) e, quanto à pessoa
          avisada, legítimo interesse de lembrar de um pagamento combinado (LGPD, art. 7º, IX),
          sempre com a opção de sair dos lembretes em um toque, presente em toda mensagem.
        </BaseLegal>

        <Sub>2.3 Uso da plataforma</Sub>
        <Lista>
          <li>
            Eventos do combinado (aceite do convite, aviso de "já paguei", saída dos lembretes,
            confirmação de pagamento) e o histórico de mensagens enviadas, para acompanhar o
            andamento no painel.
          </li>
          <li>Carteira de créditos: histórico de recargas e do saldo de envios da sua conta.</li>
        </Lista>
        <BaseLegal>execução de contrato (LGPD, art. 7º, V).</BaseLegal>

        <Sub>2.4 Cookies e armazenamento no navegador</Sub>
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

      <Secao n={3} titulo="Com quem compartilhamos dados">
        <P>Para funcionar, o Whaviso se apoia nestes provedores:</P>
        <Lista>
          <li>
            <strong>Google LLC</strong>: login com conta Google (OAuth).{' '}
            <LinkExterno href="https://policies.google.com/privacy">Política do Google</LinkExterno>.
          </li>
          <li>
            <strong>Meta Platforms, Inc.</strong> (WhatsApp): entrega das mensagens de aviso e
            lembrete no WhatsApp.{' '}
            <LinkExterno href="https://www.whatsapp.com/legal/privacy-policy">
              Política do WhatsApp
            </LinkExterno>
            .
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
          As recargas de crédito são feitas por Pix, direto para a chave da plataforma. Não há
          processador de pagamento terceirizado e não coletamos dados de cartão. Não vendemos seus
          dados e não os compartilhamos com terceiros fora dos listados acima.
        </P>
      </Secao>

      <Secao n={4} titulo="Por quanto tempo guardamos">
        <Lista>
          <li>Dados de conta, combinados e carteira de créditos: enquanto a conta existir.</li>
          <li>
            Combinados e registros de eventos não são apagados: eles mudam de estado e ficam como
            histórico do que foi combinado, para preservar a integridade do registro.
          </li>
          <li>
            Ao pedir a exclusão: removemos ou anonimizamos seus dados pessoais, mantendo apenas
            registros não identificáveis quando houver obrigação legal ou necessidade de
            integridade.
          </li>
        </Lista>
      </Secao>

      <Secao n={5} titulo="Seus direitos (LGPD, art. 18)">
        <P>Você pode, a qualquer momento:</P>
        <Lista>
          <li>
            <strong>Acesso</strong>: confirmar se tratamos seus dados e obter uma cópia.
          </li>
          <li>
            <strong>Correção</strong>: atualizar dados incompletos ou desatualizados.
          </li>
          <li>
            <strong>Exclusão ou anonimização</strong>: pedir a remoção dos seus dados pessoais.
          </li>
          <li>
            <strong>Portabilidade</strong>: receber seus dados em formato estruturado.
          </li>
          <li>
            <strong>Informação</strong>: saber com quais provedores compartilhamos seus dados.
          </li>
          <li>
            <strong>Oposição</strong>: se opor ao tratamento feito com base em legítimo interesse.
          </li>
        </Lista>
        <P>
          Para exercer qualquer direito, escreva para <Email endereco={CONTATO} />.
        </P>
      </Secao>

      <Secao n={6} titulo="Quem recebe lembretes">
        <P>
          Se você recebeu um aviso do Whaviso, seus dados (nome e número) foram informados por quem
          criou o combinado com você. Toda mensagem traz o botão "Sair dos lembretes": um toque
          interrompe os avisos daquele combinado, sem precisar digitar nem justificar, e a saída
          vale só para aquele combinado. Você não precisa de conta para parar de receber. Para pedir
          a remoção dos seus dados, escreva para <Email endereco={CONTATO} />.
        </P>
      </Secao>

      <Secao n={7} titulo="Segurança">
        <P>
          Adotamos medidas técnicas para proteger seus dados: o navegador nunca acessa o banco
          diretamente (todo dado passa pela nossa API); as sessões são validadas por token assinado;
          tokens ficam guardados apenas como hash; os acessos ao banco usam papéis de privilégio
          mínimo; o tráfego é sempre por HTTPS; e há uma regra rígida de nunca registrar em log dado
          sensível, como número de telefone, chave Pix ou token.
        </P>
      </Secao>

      <Secao n={8} titulo="Alterações nesta política">
        <P>
          Podemos atualizar esta política periodicamente. A data no topo indica a versão mais
          recente. Mudanças relevantes são comunicadas na plataforma.
        </P>
      </Secao>

      <Secao n={9} titulo="Contato">
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
