self.addEventListener('push',e=>{let d={};try{d=e.data.json()}catch(_){d={body:e.data?e.data.text():''}}
e.waitUntil(self.registration.showNotification(d.title||'Golden League',{body:d.body||'',icon:d.icon||'/favicon.png',data:{url:d.url||'/'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(l=>{for(const c of l)if('focus' in c)return c.focus();return clients.openWindow(e.notification.data.url||'/')}))});
