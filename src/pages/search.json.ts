import { getIndex } from '../lib/posts';
export async function GET() { return new Response(JSON.stringify(await getIndex()), { headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
