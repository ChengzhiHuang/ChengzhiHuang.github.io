import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { sourceDigest, assertReview, assertArtifacts, walk, sha256 } from './guards.mjs';
import { commitSha } from './publication-policy.mjs';
import { assertCommittedSource } from './push-guards.mjs';
const mode = process.argv[2];
if (!['check','verify','package'].includes(mode)) throw new Error('Use check, verify or package');
const root=process.cwd(), id=new Date().toISOString().replaceAll(':','-'), evidence=path.join(root,'.harness/runs',`${id}-${mode}`);
await fs.mkdir(evidence,{recursive:true});
const report={schemaVersion:2,mode,startedAt:new Date().toISOString(),commitSha:commitSha(root),sourceDigest:await sourceDigest(root),node:process.version,steps:[],status:'running'};
const save=async()=>{await fs.writeFile(path.join(evidence,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(root,'.harness/latest.json'),JSON.stringify({evidence,status:report.status},null,2));};
async function step(name,command,args=[]) {
  const started=Date.now(), log=path.join(evidence,`${name}.log`);
  const result={name,command:[command,...args],status:'running',exitCode:null,durationMs:0,evidence:path.relative(root,log)}; report.steps.push(result);await save();
  let output='';
  const exitCode=await new Promise(resolve=>{const child=spawn(command,args,{cwd:root,env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',HARNESS_EVIDENCE:evidence},stdio:['ignore','pipe','pipe']});child.stdout.on('data',data=>{output+=data;process.stdout.write(data);});child.stderr.on('data',data=>{output+=data;process.stderr.write(data);});child.on('error',error=>{output+=String(error);resolve(1);});child.on('close',code=>resolve(code??1));});
  result.exitCode=exitCode; result.durationMs=Date.now()-started;result.status=exitCode===0?'passed':'failed';await fs.writeFile(log,output);await save();if(exitCode)throw new Error(`Required check failed: ${name}`);
}
async function localStep(name,fn) {const start=Date.now();const row={name,command:['in-process',name],exitCode:0,durationMs:0,status:'passed',evidence:path.relative(root,path.join(evidence,'report.json'))};report.steps.push(row);try{await fn();}catch(error){row.exitCode=1;row.status='failed';row.error=String(error);throw error;}finally{row.durationMs=Date.now()-start;await save();}}
try {
  await step('boundary',process.execPath,['scripts/check.mjs']);
  await localStep('runtime',async()=>{const pkg=JSON.parse(await fs.readFile('package.json','utf8'));if(process.versions.node!==pkg.engines.node)throw new Error(`Use Node ${pkg.engines.node}; current ${process.versions.node}`);const npm=spawnSync('npm',['--version'],{encoding:'utf8'});report.npm=npm.stdout.trim();if(npm.status!==0||report.npm!==pkg.engines.npm)throw new Error(`Use npm ${pkg.engines.npm}`);});
  if(mode==='package')await localStep('committed-source',async()=>{if(assertCommittedSource(root)!==report.commitSha)throw new Error('Commit changed during verification');});
  await step('types',process.execPath,['node_modules/astro/bin/astro.mjs','check']);
  await step('lint',process.execPath,['node_modules/eslint/bin/eslint.js','.']);
  if(mode!=='check') {
    await step('unit',process.execPath,['--experimental-strip-types','--test','tests/unit.test.mjs']);
    await step('build',process.execPath,['node_modules/astro/bin/astro.mjs','build']);
    await step('browser-fixture',process.execPath,['scripts/browser-fixture.mjs']);
    await step('browser',process.execPath,['node_modules/@playwright/test/cli.js','test']);
    await localStep('artifacts',()=>assertArtifacts(root));
  }
  if(mode==='package') {
    await localStep('review-hashes',()=>assertReview(root));
    await localStep('unchanged-source',async()=>{if(await sourceDigest(root)!==report.sourceDigest)throw new Error('Source changed during verification');});
    const packageDir=path.join(root,'.harness/packages',id);await fs.mkdir(packageDir,{recursive:true});
    const files=await walk(path.join(root,'dist'));
    const manifest=await Promise.all(files.map(async file=>({path:path.relative(path.join(root,'dist'),file),sha256:sha256(await fs.readFile(file)),bytes:(await fs.stat(file)).size})));
    if(manifest.reduce((total,file)=>total+file.bytes,0)>1_000_000_000)throw new Error('Pages site exceeds size limit');
    await fs.writeFile(path.join(packageDir,'manifest.json'),JSON.stringify({commitSha:report.commitSha,sourceDigest:report.sourceDigest,files:manifest},null,2));
    await step('archive','tar',['-czf',path.join(packageDir,'static-site.tar.gz'),'-C',path.join(root,'dist'),'.']);
    report.package=path.relative(root,packageDir);
  }
  await localStep('final-source-digest',async()=>{if(await sourceDigest(root)!==report.sourceDigest||commitSha(root)!==report.commitSha)throw new Error('Source or commit changed during verification');if(mode==='package')assertCommittedSource(root);});
  report.status='passed';
} catch(error) {report.status='failed';report.error=String(error);process.exitCode=1;console.error(error.message);}
finally {report.finishedAt=new Date().toISOString();await save();console.log(`Evidence: ${path.relative(root,evidence)}`);}
