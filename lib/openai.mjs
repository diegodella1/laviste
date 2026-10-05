import {assert} from './engine.mjs';

export async function response(body, config) {
  const fetcher = config.fetcher || fetch;
  const result = await fetcher('https://api.openai.com/v1/responses', {
    method: 'POST', headers: {Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({model: config.model, store: false, max_output_tokens: 4000, reasoning: {effort: 'low'}, ...body}),
    signal: AbortSignal.timeout(90000),
  });
  assert(result.ok, result.status === 401 ? 'OpenAI rechazó la clave.' : result.status === 429 ? 'OpenAI informa un límite de uso o saldo.' : 'OpenAI no pudo completar la solicitud. Revisá el modelo o reintentá.', 502);
  const data = await result.json();
  config.onUsage?.(data.usage, (data.output || []).filter(item => item.type === 'web_search_call').length);
  assert(data.status === 'completed', 'OpenAI devolvió una respuesta incompleta.', 502);
  assert(!(data.output || []).some(item => item.content?.some(content => content.type === 'refusal')), 'OpenAI no pudo responder esta solicitud.', 422);
  return data;
}

export const outputText = data => (data.output || []).flatMap(item => item.content || []).filter(content => content.type === 'output_text').map(content => content.text).join('');

export function safeURL(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (key.startsWith('utm_')) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}
