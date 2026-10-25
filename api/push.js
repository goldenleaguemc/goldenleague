// Avisos push. Requiere: npm i web-push  y variables VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:tu@correo) + KV/Upstash.
// Genera las claves una vez con:  npx web-push generate-vapid-keys
const wp=require('web-push');
const U=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,K=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const AK=process.env.ADMIN_KEY||process.env.ADMIN_PASSWORD||process.env.ADMIN_PASS; // el mismo que uses en /api/data
const kv=async(...a)=>{const r=await fetch(U,{method:'POST',headers:{Authorization:'Bearer '+K,'content-type':'application/json'},body:JSON.stringify(a)}),j=await r.json();if(j.error)throw new Error(j.error);return j.result};
module.exports=async(req,res)=>{try{
 const{VAPID_PUBLIC:pub,VAPID_PRIVATE:priv,VAPID_SUBJECT:sub}=process.env;
 if(!pub||!priv||!U)return res.status(501).json({error:'Faltan VAPID_PUBLIC / VAPID_PRIVATE o KV en el servidor'});
 if(req.method=='GET')return res.json({key:pub});
 const q=typeof req.body=='string'?JSON.parse(req.body||'{}'):req.body||{};
 if(q.act=='sub'){const s=q.sub;if(!s||!s.endpoint||!s.keys)return res.status(400).json({error:'Suscripción no válida'});await kv('HSET','gl:push',s.endpoint,JSON.stringify({s,nick:String(q.nick||'').slice(0,20),t:Date.now()}));return res.json({ok:1})}
 if(q.act=='send'){if(!AK||req.headers['x-admin']!==AK)return res.status(403).json({error:'Solo administradores'});
  wp.setVapidDetails(sub||'mailto:admin@example.com',pub,priv);
  const flat=await kv('HGETALL','gl:push')||[],payload=JSON.stringify({title:String(q.title||'Golden League').slice(0,80),body:String(q.body||'').slice(0,200),url:q.url||'/'});let sent=0;
  for(let i=0;i<flat.length;i+=2){let r;try{r=JSON.parse(flat[i+1])}catch(e){continue}
   try{await wp.sendNotification(r.s,payload);sent++}catch(e){if(e.statusCode==404||e.statusCode==410)await kv('HDEL','gl:push',flat[i])}}
  return res.json({sent})}
 res.status(400).json({error:'Acción desconocida'});
}catch(e){res.status(500).json({error:String(e.message||e)})}};
