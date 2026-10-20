import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import spec from '../../../config/text-model.json';
// Same switch as the vision models: a hosted build without bundled models downloads the pinned revision once.
env.allowLocalModels=true;
env.allowRemoteModels=__ALLOW_REMOTE_MODELS__;
env.localModelPath='/models/';
env.useBrowserCache=__ALLOW_REMOTE_MODELS__;
env.backends.onnx.wasm!.wasmPaths='/onnx/';
env.backends.onnx.wasm!.numThreads=1;
env.backends.onnx.wasm!.proxy=false;
const create=pipeline as unknown as (task:string,model:string,options:object)=>Promise<FeatureExtractionPipeline>;
self.onmessage=async(event:MessageEvent<{texts:string[];roles:('query'|'passage')[]}>)=>{
 try{
  const {texts,roles}=event.data;
  if(!texts.length||texts.length>61||roles.length!==texts.length)throw new Error('Invalid text batch');
  const model=await create('feature-extraction',__ALLOW_REMOTE_MODELS__?spec.source:spec.directory,{device:'wasm',dtype:spec.dtype,local_files_only:!__ALLOW_REMOTE_MODELS__,...(__ALLOW_REMOTE_MODELS__?{revision:spec.revision}:{})});
  model.tokenizer.model_max_length=256;
  const vectors:number[][]=[];
  for(let i=0;i<texts.length;i++){
   if(typeof texts[i]!=='string'||texts[i].length>1500||!['query','passage'].includes(roles[i]))throw new Error('Invalid text input');
   const tensor=await model(`${roles[i]}: ${texts[i]}`,{pooling:'mean',normalize:true});
   const vector=Array.from(tensor.data as Float32Array);
   if(vector.length!==spec.dimensions||!vector.every(Number.isFinite)||!vector.some(n=>n!==0))throw new Error('Invalid embedding');
   vectors.push(vector);
   self.postMessage({type:'progress',completed:i+1,total:texts.length});
  }
  self.postMessage({type:'result',vectors});
 }catch(error){self.postMessage({type:'error',message:error instanceof Error?error.message:'텍스트 모델 실행 실패'});}
};
