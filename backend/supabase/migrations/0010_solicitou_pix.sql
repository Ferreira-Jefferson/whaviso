-- Adiciona o evento de solicitação de chave Pix pelo devedor.
-- O botão "Ver Pix" nas etapas D-1/D/D+1 grava este evento sem alterar o status do aviso.
alter type tipo_evento add value if not exists 'solicitou_pix';
