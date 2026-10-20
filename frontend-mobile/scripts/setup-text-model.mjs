import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const spec=JSON.parse(await readFile(path.join(root,'config/text-model.json'),'utf8'));
const modelRoot=path.join(root,'public/models',spec.directory);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function check(){
 const manifest=JSON.parse(await readFile(path.join(modelRoot,'assets.json'),'utf8'));
 if(manifest.source!==spec.source||manifest.revision!==spec.revision)throw new Error('Text model source/revision mismatch');
 for(const name of spec.files)if(sha(await readFile(path.join(modelRoot,name)))!==manifest.sha256[name])throw new Error(`Text model integrity mismatch: ${name}`);
}
try {
 if(process.argv.includes('--check')){
  try{await check();console.log('Local text model verified.');}
  catch(error){if(process.argv.includes('--allow-missing')&&error.code==='ENOENT')console.log('Text model absent. Run npm run setup:text before AI matching.');else throw error;}
 } else {
  await mkdir(path.join(modelRoot,'onnx'),{recursive:true});
  try{await check();console.log('Text model already installed.');process.exit(0);}catch{}
  const hashes={};
  for(const name of spec.files){
   console.log(`Downloading text model: ${name}`);
   const response=await fetch(`https://huggingface.co/${spec.source}/resolve/${spec.revision}/${name}`,{signal:AbortSignal.timeout(180000)});
   if(!response.ok)throw new Error(`Download failed: ${response.status}`);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(name.endsWith('.onnx')&&bytes.length<20_000_000)throw new Error('Incomplete text model');
   if(name.endsWith('.json'))JSON.parse(bytes.toString('utf8'));
   await writeFile(path.join(modelRoot,name),bytes);hashes[name]=sha(bytes);
  }
  await writeFile(path.join(modelRoot,'assets.json'),JSON.stringify({source:spec.source,revision:spec.revision,sha256:hashes},null,2));
  await check();console.log('Local multilingual text model installed.');
 }
}catch(error){console.error(error.message);process.exitCode=1;}
