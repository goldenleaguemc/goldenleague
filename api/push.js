// Avisos push. Requiere: npm i web-push, variables VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:tu@correo) y KV/Upstash.
// Claves (una sola vez):  npx web-push generate-vapid-keys
// Abre /api/push?diag=1 en el navegador para ver qué falta.
let wp=null,wpErr='';try{wp=require('web-push')}catch(e){wpErr=String(e.message||e)}
const U=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL,K=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const kv=async(...a)=>{const r=await fetch(U,{method:'POST',headers:{Authorization:'Bearer '+K,'content-type':'application/json'},body:JSON.stringify(a)}),j=await r.json();if(j.error)throw new Error(j.error);return j.result};
// La clave de admin se valida con tu propio /api/data (la misma comprobación que el login), sin adivinar variables.
const isAdmin=async req=>{const k=req.headers['x-admin'];if(!k)return false;try{const r=await fetch(`https://${req.headers.host}/api/data`,{method:'POST',headers:{'content-type':'application/json','x-admin':k},body:JSON.stringify({check:1})});return r.ok}catch(e){return false}};
module.exports=async(req,res)=>{try{
 const{VAPID_PUBLIC:pub,VAPID_PRIVATE:priv,VAPID_SUBJECT:sub}=process.env;
 if(req.method=='GET'&&req.query&&req.query.diag){let n=null;try{if(U&&K)n=((await kv('HLEN','gl:push'))||0)}catch(e){n='error: '+e.message}
  return res.json({'web-push instalado':!!wp,'error web-push':wpErr||undefined,VAPID_PUBLIC:!!pub,VAPID_PRIVATE:!!priv,VAPID_SUBJECT:!!sub,'KV/Upstash':!!(U&&K),suscriptores:n})}
 if(!wp)return res.status(501).json({error:'Falta instalar web-push en el servidor (npm i web-push y volver a desplegar)'});
 if(!pub||!priv)return res.status(501).json({error:'Faltan las variables VAPID_PUBLIC y VAPID_PRIVATE'});
 if(!U||!K)return res.status(501).json({error:'Falta configurar KV/Upstash (KV_REST_API_URL y KV_REST_API_TOKEN)'});
 if(req.method=='GET')return res.json({key:pub});
 const q=typeof req.body=='string'?JSON.parse(req.body||'{}'):req.body||{};
 if(q.act=='sub'){const s=q.sub;if(!s||!s.endpoint||!s.keys)return res.status(400).json({error:'Suscripción no válida'});await kv('HSET','gl:push',s.endpoint,JSON.stringify({s,nick:String(q.nick||'').slice(0,20),t:Date.now()}));return res.json({ok:1})}
 if(q.act=='send'){if(!(await isAdmin(req)))return res.status(403).json({error:'Clave de administrador no válida: entra en Admin y vuelve a intentarlo'});
  wp.setVapidDetails(sub||'mailto:admin@example.com',pub,priv);
  const flat=(await kv('HGETALL','gl:push'))||[],payload=JSON.stringify({title:String(q.title||'Golden League').slice(0,80),body:String(q.body||'').slice(0,200),url:q.url||'/'});let sent=0,fail=0,last='';
  for(let i=0;i<flat.length;i+=2){let r;try{r=JSON.parse(flat[i+1])}catch(e){continue}
   try{await wp.sendNotification(r.s,payload);sent++}catch(e){fail++;last=String(e.body||e.message||e).slice(0,120);if(e.statusCode==404||e.statusCode==410)await kv('HDEL','gl:push',flat[i])}}
  return res.json({sent,fail,last,total:flat.length/2})}
 res.status(400).json({error:'Acción desconocida'});
}catch(e){res.status(500).json({error:String(e.message||e)})}};
