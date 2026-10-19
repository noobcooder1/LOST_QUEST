import { afterEach,beforeEach,describe,it,expect,vi } from 'vitest';
import { compareMatchTexts } from './textMatching';
import { parseItemMatches } from '../../services/matchingApi';
import { RESPONSE } from '../../services/matchingApi.fixtures';
class FakeWorker {
 static all:FakeWorker[]=[];
 onmessage:((event:{data:unknown})=>void)|null=null;
 onerror:(()=>void)|null=null;
 terminate=vi.fn();postMessage=vi.fn();
 constructor(){FakeWorker.all.push(this);}
}
const data=()=>({...parseItemMatches(RESPONSE),target:{title:'검은색 지갑',category:'지갑',color:'검정',description:'공개 설명'}});
const vector=(x:number)=>[x,Math.sqrt(1-x*x),...new Array(382).fill(0)];
beforeEach(()=>{FakeWorker.all=[];vi.stubGlobal('Worker',FakeWorker);});
afterEach(()=>vi.unstubAllGlobals());
describe('local text reference lifecycle',()=>{
 it('starts only on request, returns per-match values and terminates the model worker',async()=>{
  expect(FakeWorker.all).toHaveLength(0);const progress=vi.fn();const input=data();const before=JSON.stringify(input);
  const promise=compareMatchTexts(input,new AbortController().signal,progress);
  const worker=FakeWorker.all[0];const sent=worker.postMessage.mock.calls[0][0];expect(sent.roles).toEqual(['query','passage','passage']);
  worker.onmessage!({data:{type:'progress',completed:1,total:3}});
  worker.onmessage!({data:{type:'result',vectors:[vector(1),vector(.8),vector(.95)]}});
  const values=await promise;
  expect(values[input.matches[0].id]).toBeCloseTo(.8);expect(values[input.matches[1].id]).toBeCloseTo(.95);
  expect(JSON.stringify(input)).toBe(before);// order, scores and the list itself are untouched
  expect(progress).toHaveBeenCalledWith(1,3);expect(worker.terminate).toHaveBeenCalledTimes(1);
 });
 it('rejects instead of inventing a value when the worker/model fails',async()=>{
  const promise=compareMatchTexts(data(),new AbortController().signal);FakeWorker.all[0].onerror!();
  await expect(promise).rejects.toThrow();expect(FakeWorker.all[0].terminate).toHaveBeenCalledTimes(1);
 });
 it('does not run a model without target text or without matches',async()=>{
  await expect(compareMatchTexts(parseItemMatches({...RESPONSE,lostItem:{id:12}}),new AbortController().signal)).rejects.toThrow();
  expect(await compareMatchTexts({...data(),matches:[]},new AbortController().signal)).toEqual({});
  expect(FakeWorker.all).toHaveLength(0);
 });
 it('terminates active work and never publishes a late result after cancellation',async()=>{
  const controller=new AbortController();const promise=compareMatchTexts(data(),controller.signal);const worker=FakeWorker.all[0];
  controller.abort();worker.onmessage!({data:{type:'result',vectors:[vector(1),vector(1),vector(1)]}});
  await expect(promise).rejects.toThrow();expect(worker.terminate).toHaveBeenCalled();
 });
 it('rejects invalid dimension replies',async()=>{
  const promise=compareMatchTexts(data(),new AbortController().signal);FakeWorker.all[0].onmessage!({data:{type:'result',vectors:[[1],[2],[3]]}});
  await expect(promise).rejects.toThrow();
 });
});
