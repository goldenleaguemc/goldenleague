// Comentarios y reacciones. Guarda en Vercel KV / Upstash Redis (variables KV_REST_API_URL + KV_REST_API_TOKEN, o UPSTASH_REDIS_REST_*).
const U=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,K=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const AK=process.env.ADMIN_KEY||process.env.ADMIN_PASSWORD||process.env.ADMIN_PASS; // usa el mismo nombre que ya uses en /api/data
const EM=['👍','🔥','😂','😮','👏'];
const kv=async(...a)=>{const r=await fetch(U,{method:'POST',headers:{Authorization:'Bearer '+K,'content-type':'application/json'},body:JSON.stringify(a)}),j=await r.json();if(j.error)throw new Error(j.error);return j.result};
const clean=(s,n)=>String(s||'').replace(/[<>\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
module.exports=async(req,res)=>{try{
 if(!U||!K)return res.status(501).json({error:'Falta configurar Vercel KV / Upstash'});
 const q=req.method=='GET'?req.query:(typeof req.body=='string'?JSON.parse(req.body||'{}'):req.body||{});
 const t=['m','n'].includes(q.t)?q.t:'',id=clean(q.id,120),u=clean(q.u,40);
 if(!t||!id||!u)return res.status(400).json({error:'Datos incompletos'});
 const key=`gl:soc:${t}:${id}`;let d=JSON.parse(await kv('GET',key)||'null')||{re:{},co:[]};
 if(req.method=='POST'){
  if(q.act=='react'){if(!EM.includes(q.e))return res.status(400).json({error:'Reacción no válida'});const a=d.re[q.e]||[],i=a.indexOf(u);i>=0?a.splice(i,1):a.push(u);d.re[q.e]=a}
  else if(q.act=='comment'){const x=clean(q.x,280),n=clean(q.n,20)||'Anónimo';if(!x)return res.status(400).json({error:'Comentario vacío'});if(d.co.some(c=>c.u==u&&Date.now()-c.t<8000))return res.status(429).json({error:'Espera unos segundos'});d.co.push({i:Math.random().toString(36).slice(2,10),n,x,t:Date.now(),u});d.co=d.co.slice(-200)}
  else if(q.act=='del'){if(!AK||req.headers['x-admin']!==AK)return res.status(403).json({error:'Solo administradores'});d.co=d.co.filter(c=>c.i!==q.cid)}
  else return res.status(400).json({error:'Acción desconocida'});
  await kv('SET',key,JSON.stringify(d));
 }
 res.json({re:Object.fromEntries(Object.entries(d.re).map(([e,a])=>[e,a.length])),mine:Object.entries(d.re).filter(([e,a])=>a.includes(u)).map(x=>x[0]),co:d.co.slice(-60).map(({i,n,x,t})=>({i,n,x,t}))});
}catch(e){res.status(500).json({error:String(e.message||e)})}};
