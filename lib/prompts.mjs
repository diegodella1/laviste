import {catalog} from './engine.mjs';
import {DEFAULT_AGENT_INSTRUCTIONS} from './agent-prompt.mjs';

export function chatLockedSuffix({assistantTurns = 0, mustPropose = false, adjusting = false, take = null} = {}) {
  const clarLeft = Math.max(0, 2 - assistantTurns);
  const proposalRule = mustPropose
    ? 'En esta respuesta debés devolver proposal con la mejor cartera posible (no null). No hagas más preguntas.'
    : assistantTurns >= 2
      ? 'Ya hiciste dos aclaraciones: devolvé proposal en esta respuesta (no null).'
      : clarLeft > 0
        ? `Podés hacer hasta ${clarLeft} pregunta(s) aclaratoria(s) breve(s) (horizonte, riesgo/invalidación, universo). Después de dos turnos tuyos con preguntas, la siguiente respuesta debe incluir proposal.`
        : 'Incluí proposal cuando haya contexto suficiente o el usuario pida ajustar la cartera.';
  const catalogPart = JSON.stringify(catalog.map(({ticker, name, bucket}) => ({ticker, name, bucket})));
  return `Sin búsqueda web en este chat. No inventes fuentes ni cotizaciones; instrumentos solo del catálogo simulado. No digas que operaste ni guardaste nada. En take activa proposal=null; si el usuario ajusta, devolvé proposal actualizado. ${adjusting ? 'El usuario está ajustando la propuesta: refiná pesos/posiciones y devolvé proposal completo.' : ''} ${proposalRule} No repitas el disclaimer legal en cada mensaje (la UI ya lo muestra). Usá 2-10 posiciones, pesos hasta 25% c/u, total 30-95%, invalidación concreta. Catálogo: ${catalogPart}. Turnos asistente previos: ${assistantTurns}. Contexto: ${JSON.stringify(take || null)}`;
}

export function composeChatInstructions(analystBody, options = {}) {
  const voice = String(analystBody || DEFAULT_AGENT_INSTRUCTIONS).trim();
  return `${voice}\n\n${chatLockedSuffix(options)}`;
}

export const LOCKED_CHAT_SUFFIX_PREVIEW = chatLockedSuffix({assistantTurns: 0, mustPropose: false, adjusting: false, take: null});
