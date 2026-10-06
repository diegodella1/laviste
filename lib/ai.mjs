import {catalog, validateProposal} from './engine.mjs';
import {response} from './openai.mjs';
import {DEFAULT_AGENT_INSTRUCTIONS} from './agent-prompt.mjs';
import {composeChatInstructions} from './prompts.mjs';

const string = {type: 'string'};
const holdingSchema = {type: 'object', additionalProperties: false, required: ['ticker', 'weight', 'reason'], properties: {ticker: {type: 'string', enum: catalog.map(c => c.ticker)}, weight: {type: 'number'}, reason: string}};
const proposalSchema = {type: 'object', additionalProperties: false, required: ['title', 'thesis', 'horizon', 'invalidation', 'holdings'], properties: {title: string, thesis: string, horizon: string, invalidation: string, holdings: {type: 'array', items: holdingSchema}}};
export const schema = {type: 'object', additionalProperties: false, required: ['message', 'proposal'], properties: {message: string, proposal: {anyOf: [{type: 'null'}, proposalSchema]}}};
export {DEFAULT_AGENT_INSTRUCTIONS};

export function requestBody(messages, take, {assistantTurns = 0, mustPropose = false, adjusting = false, instructionsOverride = DEFAULT_AGENT_INSTRUCTIONS} = {}) {
  return {
    store: false,
    max_output_tokens: 4000,
    reasoning: {effort: 'low'},
    instructions: composeChatInstructions(instructionsOverride, {assistantTurns, mustPropose, adjusting, take}),
    input: messages.slice(-24).map(m => ({role: m.role, content: m.content})),
    text: {format: {type: 'json_schema', name: 'tesis_conversation', strict: true, schema}},
  };
}

export function parseResponse(data) {
  if (data.status !== 'completed') throw Object.assign(new Error('La respuesta quedó incompleta. Probá con un mensaje más breve.'), {status: 502});
  const content = (data.output || []).flatMap(o => o.content || []);
  if (content.some(c => c.type === 'refusal')) throw Object.assign(new Error('El modelo no pudo responder a esta solicitud. Reformulá la consulta.'), {status: 422});
  const result = JSON.parse(content.filter(c => c.type === 'output_text').map(c => c.text).join(''));
  if (typeof result.message !== 'string' || !result.message.trim()) throw Object.assign(new Error('Respuesta inválida del proveedor.'), {status: 502});
  if (result.proposal) validateProposal(result.proposal);
  return result;
}

export async function askOpenAI(messages, take, {apiKey, model, fetcher = fetch, assistantTurns = 0, mustPropose = false, adjusting = false, instructionsOverride = DEFAULT_AGENT_INSTRUCTIONS, onUsage} = {}) {
  const data = await response(requestBody(messages, take, {assistantTurns, mustPropose, adjusting, instructionsOverride}), {apiKey, model, fetcher, onUsage});
  return {...parseResponse(data), usage: data.usage};
}
