import { describe,it,expect } from 'vitest';
import { matchText,textReferences } from './ranking';
import { parseMatch } from '../../services/matchingApi';
import { LQ_MATCH } from '../../services/matchingApi.fixtures';
const candidate=(id:number,score:number)=>({...parseMatch(LQ_MATCH),id:`LOST_QUEST:${id}`,score});
describe('text reference values',()=>{
 it('uses only explicit public fields, never ownership secrets or identifiers',()=>{
  const item={title:'검정 우산',category:'기타',color:'검정',description:'공개 특징',ownershipAnswer:'secret-answer',ownershipQuestion:'private-question',accessToken:'secret-token',userId:99};
  expect(matchText(item)).toBe('검정 우산. 공개 특징. 기타. 검정');
  expect(matchText({...item,description:'x'.repeat(10000)}).length).toBeLessThan(1500);
 });
 it('returns one value per match without reordering, filtering or changing scores',()=>{
  const matches=[candidate(1,100),candidate(2,20)];const before=JSON.stringify(matches);
  const values=textReferences(matches,[[1,0],[.8,.6],[.96,.28]]);
  expect(Object.keys(values)).toEqual(['LOST_QUEST:1','LOST_QUEST:2']);
  expect(values['LOST_QUEST:1']).toBeCloseTo(.8);expect(values['LOST_QUEST:2']).toBeCloseTo(.96);
  expect(JSON.stringify(matches)).toBe(before);
 });
 it('clamps negative meaning to zero and rejects missing or invalid vectors',()=>{
  expect(textReferences([candidate(1,100)],[[1,0],[-1,0]])['LOST_QUEST:1']).toBe(0);
  expect(()=>textReferences([candidate(1,100)],[[1,0]])).toThrow();
  expect(()=>textReferences([candidate(1,100)],[[1,0],[NaN,0]])).toThrow();
 });
});
