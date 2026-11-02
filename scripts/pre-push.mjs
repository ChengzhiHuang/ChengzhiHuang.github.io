import { assertPush } from './push-guards.mjs';
try {
  let input='';for await(const chunk of process.stdin)input+=chunk;
  const audit=await assertPush(process.cwd(),process.argv[2],process.argv[3],input);
  console.log(`Verified main push: ${audit.commits} commits, ${audit.objects} audited objects.`);
} catch(error) { console.error(`Push blocked: ${error.message}`);process.exitCode=1; }
