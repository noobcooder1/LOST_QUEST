import type { ItemMatches } from '../../services/matchingApi';
import { matchText, textReferences } from './ranking';
import spec from '../../../config/text-model.json';

export function textEmbeddings(texts:string[],onProgress:((completed:number,total:number)=>void)|undefined,signal:AbortSignal):Promise<number[][]> {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const worker=new Worker(new URL('./text.worker.ts',import.meta.url),{type:'module'});
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);worker.terminate();};
    const fail=(error:Error)=>{cleanup();reject(error);};
    const abort=()=>fail(new DOMException('Aborted','AbortError'));
    const timer=setTimeout(()=>fail(new Error('텍스트 AI 처리 시간이 초과됐어요.')),180_000);
    signal.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>fail(new Error('텍스트 AI를 실행하지 못했어요.'));
    worker.onmessage=(event:MessageEvent<{type:string;vectors?:number[][];completed?:number;total?:number;message?:string}>)=>{
      if(event.data.type==='progress'){onProgress?.(event.data.completed??0,event.data.total??texts.length);return;}
      if(event.data.type==='error'){fail(new Error('로컬 텍스트 모델을 불러오지 못했어요.'));return;}
      const vectors=event.data.vectors;
      if(event.data.type!=='result'||!vectors||vectors.length!==texts.length||vectors.some(v=>v.length!==spec.dimensions||!v.every(Number.isFinite))){fail(new Error('텍스트 AI 결과를 확인할 수 없어요.'));return;}
      cleanup();resolve(vectors);
    };
    worker.postMessage({texts,roles:texts.map((_,i)=>i===0?'query':'passage')});
  });
}

/**
 * Reference-only text meaning values for the matches already ranked by the server. It runs after the results are
 * shown, never changes their order, filter or scores, and rejects (so the caller shows no value) when it cannot run.
 */
export async function compareMatchTexts(data:ItemMatches,signal:AbortSignal,onProgress?:(completed:number,total:number)=>void):Promise<Record<string,number>> {
  signal.throwIfAborted();
  if(!data.matches.length)return {};
  if(!data.target)throw new Error('텍스트 비교에 필요한 잃어버린 물건 정보를 불러올 수 없어요.');
  const texts=[matchText(data.target),...data.matches.map(matchText)];
  const vectors=await textEmbeddings(texts,onProgress,signal);
  signal.throwIfAborted();
  return textReferences(data.matches,vectors);
}
