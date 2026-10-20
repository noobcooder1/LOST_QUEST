import { cosineSimilarity } from '../imageAnalysis/similarityMath';
import type { MatchResult } from '../../services/matchingApi';
export interface PublicMatchText { title:string; category:string; color?:string; description?:string }

/** Explicit allow-list: never stringify an Item or send ownership questions/answers, tokens or user ids. */
export function matchText(item:PublicMatchText):string {
  return [item.title.slice(0,120),item.description?.slice(0,600) ?? '',item.category.slice(0,60),item.color?.slice(0,30) ?? ''].filter(Boolean).join('. ');
}

/**
 * Reference-only text meaning value (0–1) per match id. It never reorders, filters or limits matches:
 * the server's 100-point condition score order stays the recommendation order.
 */
export function textReferences(matches:MatchResult[],vectors:number[][]):Record<string,number> {
  if(vectors.length!==matches.length+1)throw new Error('텍스트 비교 결과 수가 일치하지 않습니다.');
  return Object.fromEntries(matches.map((match,i)=>[match.id,Math.max(0,cosineSimilarity(vectors[0],vectors[i+1]))]));
}
