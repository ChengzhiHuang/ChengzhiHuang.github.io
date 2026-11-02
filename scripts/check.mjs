import { assertArchitecture, assertLocalGit, assertArticles, assertDocs } from './guards.mjs';
const root = process.cwd();
await assertArchitecture(root); await assertLocalGit(root); await assertArticles(root); await assertDocs(root);
console.log('Architecture, paths, Git boundary, metadata, references and documentation passed.');
