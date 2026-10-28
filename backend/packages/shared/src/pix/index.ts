// Barrel do kernel de Pix (`@whaviso/shared/pix`): o builder PURO do BR Code (EMV/CRC16),
// reutilizado pela api (modulo pagamentos) e pelo atendente (motor, no de pix) sem um importar o
// outro. Sem I/O, sem gateway, sem o barrel pesado de contratos (so o tipo da chave).
export { gerarPayloadPixCopiaCola, validarBrCode, type DadosPixCopiaCola } from './brcode'
