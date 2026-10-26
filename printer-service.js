// Servicio de impresión cliente -> servidor local proxy
async function sendTicketToPrinter(ticketData) {
  const content = [
    '================================',
    '       SMARTPARK 3D TICKET      ',
    '   Estacionamiento Inteligente  ',
    '================================',
    `Fecha/Hora : ${new Date().toLocaleString()}`,
    `Operacion  : ${ticketData.operation || 'COMPROBANTE'}`,
    `Placa      : ${ticketData.plate}`,
    `Tipo       : ${ticketData.type || 'Auto'}`,
    `Espacio    : ${ticketData.slotId || '-'}`,
    `Tiempo     : ${ticketData.durationMins || 0} min`,
    '--------------------------------',
    `TOTAL      : S/ ${(ticketData.cost || 0).toFixed(2)}`,
    '================================',
    '    Gracias por su preferencia  ',
    '   Conserve este comprobante    ',
    '\n\n'
  ].join('\n');

  const externalId = `PARK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Se envía al proxy local para evitar problemas de CORS y proteger los tokens
  const targetUrl = window.location.origin.startsWith('http') 
    ? `${window.location.origin}/api/print` 
    : 'http://127.0.0.1:3001/api/print';

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        source: 'SmartPark 3D Web',
        external_id: externalId,
        title: `Ticket ${ticketData.plate} (${ticketData.slotId || ''})`,
        content: content,
        copies: 1
      })
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, jobId: data.job ? data.job.id : null };
    } else {
      const errorText = await res.text();
      return { success: false, error: errorText };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}
