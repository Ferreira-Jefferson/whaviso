# Regra de negócio: Acessos e Permissões

> Histórias de usuário para o motor de acessos: quem pode ver e fazer o quê em cada tela, por papel. O
> acesso é definido por uma grade de permissões por papel, editável pela plataforma numa tela de Acessos,
> que vale para todos os clientes. A administração da própria conta (renomear, membros, convites,
> assinatura) e a desativação de loja ficam de fora dessa grade: são operações fixas de dono. É o refino
> do acesso sobre o kernel multi-tenant (ver `08-multi-tenant-contas-lojas.md`) e sobre o mecanismo de
> escopo da `api` (ver `../00-fundacao/tenant-auth.md`).

- **Domínio:** autorização por papel (grade editável de permissões; tela Acessos)
- **Módulos de execução relacionados:** `F3 tenant-auth` (mecanismo de escopo e guarda), o módulo de
  Acessos da plataforma (grade editável) e cada módulo de loja e de console que protege as suas telas por
  uma chave de permissão.

## Objetivo

Estabelecer que o que cada pessoa vê e faz no painel é decidido por uma grade de permissões por papel,
não por regra espalhada e congelada no código. A plataforma liga e desliga, numa tela de Acessos, cada
célula (papel x permissão), e o efeito vale na hora para todos os clientes. Um conjunto pequeno de
operações sensíveis fica propositalmente fora da grade, fixo no papel de dono, para que ninguém as
delegue por engano. Assim o acesso é ajustável onde faz sentido e inviolável onde precisa ser.

## Atores

- **Operador da plataforma (admin):** gerencia a grade de permissões na tela de Acessos. É o único que
  edita a grade.
- **Dono da conta:** tem acesso total à sua conta e às suas lojas, sempre, independentemente da grade.
- **Gerente de loja:** opera e configura a loja conforme os padrões da grade, sem administrar a conta.
- **Atendente de loja:** opera o dia a dia (conversas, pedidos, salão, caixa) conforme a grade.
- **Convidado de loja:** papel de menor privilégio, por padrão só de leitura.

## Papéis fixos

- Os papéis são fixos, não customizáveis. Na loja: `convidado`, `atendente`, `gerente`, `dono`. No console
  da plataforma: `convidado`, `suporte`, `financeiro`, `operador`, `admin`.
- Em cada escopo há um papel que é sempre tudo e não é editável, como trava contra bloqueio acidental:
  `dono` na loja e `admin` no console. Nenhuma edição da grade tira uma permissão desse papel.
- A ordem acima é só de privilégio crescente para exibição; quem decide o acesso de cada papel é a grade.

## Histórias

### Plataforma (quem administra a grade)

- Como operador da plataforma, quero uma tela de Acessos com a grade de papéis x permissões, para ligar e
  desligar o que cada papel pode em cada tela.
- Como operador da plataforma, quero que a mudança na grade valha na hora, para corrigir um acesso sem
  esperar e sem reinício.
- Como operador da plataforma, quero que a alteração da grade fique registrada (quem mudou, o quê, de que
  valor para qual), para ter trilha de auditoria sem expor dado de cliente.
- Como operador da plataforma, quero que o dono e o admin nunca percam acesso pela grade, para não me
  trancar para fora por engano.

### Loja (quem é regido pela grade)

- Como dono da conta, quero acesso total à minha conta e às minhas lojas sempre, para administrar tudo sem
  depender de configuração de permissão.
- Como gerente, quero ver e gerir as telas da loja conforme o meu papel, para trabalhar sem acesso ao que
  não me cabe.
- Como atendente, quero operar as telas do dia a dia conforme o meu papel, sem alcançar configuração que
  não é minha.
- Como convidado, quero ver as telas de leitura liberadas para o meu papel, sem poder alterar nada.

## Convenção das chaves de permissão

Cada permissão é uma chave no formato `area:acao`. O sufixo diz o nível:

- `:ver` leitura da tela ou do dado.
- `:gerir` criar, editar e excluir dentro daquela área.
- `:configurar` mexer em configuração sensível da área, em especial credencial de provedor externo.
- `:operar` executar a operação do dia a dia da área (por exemplo, operar caixa ou comandas), distinto de
  configurar a área.
- Chaves específicas de uma ação nomeiam a ação (por exemplo, revelar dado sensível em claro, atender
  conversa, ligar e desligar item do cardápio).

## Regras

1. **O acesso vem da grade:** para as telas operacionais e de configuração da loja (e para o console da
   plataforma), quem pode o quê é decidido pela grade de permissões por papel, lida pelo servidor. A
   guarda de rota e o serviço checam a mesma grade (defesa em profundidade).
2. **A grade é da plataforma e vale para todos:** a grade é única, definida pela plataforma, e não é
   personalizada por cliente. Quem a edita é só o papel `admin` do console, pela tela de Acessos. Um
   cliente não reconfigura os papéis da própria conta; o dono, de todo modo, sempre tem tudo.
3. **Mudança com efeito imediato, reversível e auditada:** ligar ou desligar uma célula vale na hora em
   qualquer instância e pode ser revertida. Cada mudança é registrada com quem alterou, a célula e os
   valores de antes e depois, sem dado pessoal nem segredo na trilha.
4. **Papel fixo é inviolável:** `dono` (loja) e `admin` (console) têm toda permissão do seu escopo e não
   são editáveis na grade. Nenhum caminho, nem pela tela nem direto no banco, remove o acesso desse papel.
5. **Gerir a própria grade não é delegável:** a permissão de administrar a grade de acessos é exclusiva do
   `admin` do console e não pode ser concedida a nenhum outro papel.
6. **Administração da conta fica fora da grade:** renomear a conta, gerir membros e convites e tratar a
   assinatura são operações fixas, não governadas pela grade. A conta em si (renomear, assinatura) é só do
   dono; gerir membros e convites é do dono e do gerente, conforme as regras do domínio de conta (ver
   `../backend-api/conta.md` e `../00-fundacao/tenant-auth.md`). Um membro nunca vira operador da
   plataforma nem promove a si mesmo.
7. **Desativar e reativar uma loja é só do dono:** por ser destrutiva e definitiva para a operação da
   unidade, é uma operação fixa de dono, não delegável pela grade, a exemplo da administração da conta.
   Editar, pausar e configurar a loja, por outro lado, seguem a grade (padrão: dono e gerente).
8. **Segredo de terceiro é do dono; chave própria da loja é da gestão:** a configuração de credencial de
   provedor externo (emissor fiscal, provedor de IA, canal de venda) é, por padrão, só do dono, pela chave
   `:configurar`. A chave Pix da própria loja, por não ser segredo de terceiro, segue a gestão da loja
   (permissão de gerir pagamentos, padrão gerente). Revelar telefone ou chave Pix em claro é, por padrão,
   do gerente.
9. **Convidado é leitura:** o papel de menor privilégio só recebe, por padrão, permissões de ver.

## Critérios de aceite

- A tela de Acessos lista as permissões por escopo e mostra a grade de papéis x permissões; a plataforma
  liga e desliga células e o efeito vale na hora.
- Desligar uma permissão de um papel barra na hora a tela correspondente para quem tem esse papel; religar
  devolve o acesso. A reversão volta ao estado anterior.
- O dono da loja acessa qualquer tela da sua loja e o admin do console acessa qualquer tela do console,
  independentemente do que a grade diga.
- Nenhuma edição (pela tela ou direto no banco) tira o acesso do dono ou do admin, nem concede a gestão da
  grade a outro papel.
- Renomear a conta, gerir membros, gerir convites e desativar ou reativar uma loja não aparecem como
  célula editável na grade: são fixas e checadas pelo papel.
- A configuração de credencial de emissor fiscal, de provedor de IA e de canal de venda é, por padrão, só
  do dono; a chave Pix da loja é, por padrão, do gerente.
- Toda mudança na grade gera registro de auditoria com os ids envolvidos e sem dado pessoal.

## Notas e decisões

- Esta história documenta o motor de acessos editável que passou a valer sobre o mecanismo do
  `F3 tenant-auth`: antes, a política por papel era padrão fixo no código; agora os padrões do código são
  a semente da grade no banco, e a grade é a verdade em runtime. Os padrões semeados reproduzem o
  comportamento anterior dos papéis que já existiam, para não regredir acesso de ninguém.
- A grade é global por desenho, não por cliente: a personalização por conta não é requisito e abriria
  espaço para o próprio cliente afrouxar o acesso. Caso vire requisito, é refino sobre este mecanismo, sem
  mudar as travas de papel fixo e de gestão de acessos não delegável.
