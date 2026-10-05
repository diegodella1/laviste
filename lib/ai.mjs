import {catalog,validateProposal} from './engine.mjs';
const string={type:'string'};
const holdingSchema={type:'object',additionalProperties:false,required:['ticker','weight','reason'],properties:{ticker:{type:'string',enum:catalog.map(c=>c.ticker)},weight:{type:'number'},reason:string}};
const proposalSchema={type:'object',additionalProperties:false,required:['title','thesis','horizon','invalidation','holdings'],properties:{title:string,thesis:string,horizon:string,invalidation:string,holdings:{type:'array',items:holdingSchema}}};
export const schema={type:'object',additionalProperties:false,required:['message','proposal'],properties:{message:string,proposal:{anyOf:[{type:'null'},proposalSchema]}}};
export function requestBody(messages,take,model,{assistantTurns=0,mustPropose=false,adjusting=false}={}) {
  const clarLeft=Math.max(0,2-assistantTurns);
  const proposalRule=mustPropose
    ?'En esta respuesta debés devolver proposal con la mejor cartera posible (no null). No hagas más preguntas.'
    :assistantTurns>=2
      ?'Ya hiciste dos aclaraciones: devolvé proposal en esta respuesta (no null).'
      :clarLeft>0
        ?`Podés hacer hasta ${clarLeft} pregunta(s) aclaratoria(s) breve(s) (horizonte, riesgo/invalidación, universo). Después de dos turnos tuyos con preguntas, la siguiente respuesta debe incluir proposal.`
        :'Incluí proposal cuando haya contexto suficiente o el usuario pida ajustar la cartera.';
  return {model,store:false,max_output_tokens:4000,reasoning:{effort:'low'},
    instructions:`Sos La Viste, acompañante de inversión para práctica en Argentina. Español rioplatense, claro, sin tono gurú. Buscá contraargumentos; podés decir que una idea no es invertible. Sin búsqueda web en este chat. No inventes fuentes ni cotizaciones; instrumentos solo del catálogo simulado. No digas que operaste ni guardaste nada. En take activa proposal=null; si el usuario ajusta, devolvé proposal actualizado. ${adjusting?'El usuario está ajustando la propuesta: refiná pesos/posiciones y devolvé proposal completo.':''} ${proposalRule} No repitas el disclaimer legal en cada mensaje (la UI ya lo muestra). Usá 2-10 posiciones, pesos hasta 25% c/u, total 30-95%, invalidación concreta. Catálogo: ${JSON.stringify(catalog.map(({ticker,name,bucket})=>({ticker,name,bucket})))}. Turnos asistente previos: ${assistantTurns}. Contexto: ${JSON.stringify(take||null)}`,
    input:messages.slice(-24).map(m=>({role:m.role,content:m.content})),
    text:{format:{type:'json_schema',name:'tesis_conversation',strict:true,schema}}};
}
export function parseResponse(data) {
  if(data.status!=='completed')throw Object.assign(new Error('La respuesta quedó incompleta. Probá con un mensaje más breve.'),{status:502});
  const content=(data.output||[]).flatMap(o=>o.content||[]);
  if(content.some(c=>c.type==='refusal'))throw Object.assign(new Error('El modelo no pudo responder a esta solicitud. Reformulá la consulta.'),{status:422});
  const result=JSON.parse(content.filter(c=>c.type==='output_text').map(c=>c.text).join(''));
  if(typeof result.message!=='string'||!result.message.trim())throw Object.assign(new Error('Respuesta inválida del proveedor.'),{status:502});
  if(result.proposal)validateProposal(result.proposal);
  return result;
}
export async function askOpenAI(messages,take,{apiKey,model,fetcher=fetch,assistantTurns=0,mustPropose=false,adjusting=false}={}) {
  const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(requestBody(messages,take,model,{assistantTurns,mustPropose,adjusting})),signal:AbortSignal.timeout(90000)});
  if(!response.ok) {const status=response.status;throw Object.assign(new Error(status===401?'OpenAI rechazó la clave. Revisá OPENAI_API_KEY en el servidor.':status===429?'OpenAI informa un límite de uso o saldo. Revisá tu cuenta de API.':`OpenAI no pudo responder (${status}). Revisá el modelo configurado o intentá más tarde.`),{status:502});}
  const data=await response.json();return {...parseResponse(data),usage:data.usage};
}
