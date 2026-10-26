import './style.css';
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const sb = SB_URL && SB_KEY ? createClient(SB_URL, SB_KEY) : null;
const TABLE = 'suivi_docs';

(function(){
  'use strict';
  /* ================= Utilitaires ================= */
  var pad=function(n){return String(n).padStart(2,'0');};
  var keyOf=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());};
  var parseKey=function(k){var a=k.split('-').map(Number);return new Date(a[0],a[1]-1,a[2]);};
  var addDays=function(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x;};
  var today=function(){var t=new Date();return new Date(t.getFullYear(),t.getMonth(),t.getDate());};
  var dayDiff=function(a,b){return Math.round((b-a)/864e5);};
  var clone=function(o){return JSON.parse(JSON.stringify(o||{}));};
  var fmtInt=function(n){return Math.round(n).toLocaleString('fr-FR');};
  var fmtH=function(min){var h=Math.floor(min/60),m=Math.round(min%60);return h+' h'+(m?' '+pad(m):'');};
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  var MONTHS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  var YEARS=[2026,2027,2028,2029,2030,2031];
  var START_2026=new Date(2026,9,26);

  /* ================= Stockage (db privé, sinon ce navigateur) ================= */
  var CACHE='cap40-data';
  var S={mode:'local',docs:{},col:null,timers:{},inflight:{},dirty:{}};
  try{S.docs=JSON.parse(localStorage.getItem(CACHE)||'{}')||{};}catch(e){S.docs={};}
  try{ // reprise des coches de la première version
    var old=JSON.parse(localStorage.getItem('cap40-jalons')||'null');
    if(old&&!S.docs.jalons){S.docs.jalons={checked:old};}
  }catch(e){}
  function cache(){try{localStorage.setItem(CACHE,JSON.stringify(S.docs));}catch(e){}}
  function doc(id){return S.docs[id]||(S.docs[id]={});}
  function save(id){
    cache();
    if(S.mode!=='db')return;
    setSync('wait');
    clearTimeout(S.timers[id]);
    S.timers[id]=setTimeout(function(){S.timers[id]=null;flush(id);},700);
  }
  function flush(id){
    if(S.inflight[id]){S.dirty[id]=true;return;}
    S.inflight[id]=true;
    sb.from(TABLE).upsert({user_id:S.uid,id:id,data:clone(S.docs[id]),updated_at:new Date().toISOString()},{onConflict:'user_id,id'})
      .then(function(res){
        S.inflight[id]=false;
        if(res.error){setSync('err','Échec d\'enregistrement ('+res.error.message+'), nouvel essai…');setTimeout(function(){flush(id);},2000+Math.random()*2000);return;}
        if(S.dirty[id]){S.dirty[id]=false;flush(id);}else if(!anyPending())setSync('ok');
      },function(){S.inflight[id]=false;setSync('err','Hors ligne, nouvel essai…');setTimeout(function(){flush(id);},4000);});
  }
  function anyPending(){for(var k in S.timers)if(S.timers[k])return true;for(var j in S.inflight)if(S.inflight[j])return true;return false;}
  function setSync(state,msg){
    var el=document.getElementById('sync');
    el.className='sync '+(state||'');
    el.textContent=msg||(state==='ok'?'Synchronisé sur ton compte':state==='wait'?'Enregistrement…':S.mode==='db'?'Synchronisé sur ton compte':'Enregistré dans ce navigateur uniquement');
  }

  /* ---- Connexion Supabase (lien magique par e-mail) ---- */
  function renderAuth(user){
    var bar=document.getElementById('authbar');
    if(!sb){bar.innerHTML='<span class="muted">Mode local : les données restent dans ce navigateur. Configure Supabase pour les synchroniser.</span>';return;}
    if(user){
      bar.innerHTML='<span class="muted">Connecté : <b class="who"></b></span><button type="button" class="btn ghost small" id="logout">Se déconnecter</button>';
      bar.querySelector('.who').textContent=user.email||'';
      document.getElementById('logout').onclick=function(){sb.auth.signOut();};
      return;
    }
    bar.innerHTML='<form id="loginForm" class="toolbar"><label for="loginEmail" class="muted">Connexion</label><input class="txt" type="email" id="loginEmail" required placeholder="ton e-mail" autocomplete="email"><button class="btn small" type="submit">Recevoir le lien de connexion</button><span class="muted" id="loginMsg" role="status"></span></form>';
    document.getElementById('loginForm').onsubmit=function(e){
      e.preventDefault();
      var email=document.getElementById('loginEmail').value.trim(), msg=document.getElementById('loginMsg');
      msg.textContent='Envoi…';
      sb.auth.signInWithOtp({email:email,options:{emailRedirectTo:window.location.origin}}).then(function(res){
        msg.textContent=res.error?('Erreur : '+res.error.message):'Lien envoyé. Ouvre l\'e-mail sur cet appareil.';
      });
    };
  }
  async function pull(first){
    var res=await sb.from(TABLE).select('id,data');
    if(res.error){setSync('err','Lecture impossible : '+res.error.message);return;}
    S.mode='db';
    if(first&&!res.data.length){ // premier usage du compte : on remonte ce qui existe dans ce navigateur
      Object.keys(S.docs).forEach(function(id){if(Object.keys(S.docs[id]).length)save(id);});
      if(!anyPending())setSync('ok'); renderAll(); return;
    }
    var fresh={};
    res.data.forEach(function(r){fresh[r.id]=r.data||{};});
    Object.keys(S.docs).forEach(function(id){if(S.timers[id]||S.inflight[id])fresh[id]=S.docs[id];});
    S.docs=fresh; cache(); if(!anyPending())setSync('ok'); renderAll();
  }
  function startSync(user){
    if(S.uid===user.id)return;
    S.uid=user.id; renderAuth(user); pull(true);
    if(!S.listening){
      S.listening=true;
      window.addEventListener('focus',function(){if(S.uid&&!anyPending())pull(false);});
      document.addEventListener('visibilitychange',function(){if(!document.hidden&&S.uid&&!anyPending())pull(false);});
    }
  }
  async function connect(){
    if(!sb){renderAuth(null);setSync('','Enregistré dans ce navigateur uniquement');return;}
    sb.auth.onAuthStateChange(function(event,session){
      if(session&&session.user){setTimeout(function(){startSync(session.user);},0);}
      else{S.uid=null;S.mode='local';renderAuth(null);setSync('','Non connecté : enregistré dans ce navigateur');}
    });
  }

  /* ================= Données du suivi spirituel ================= */
  var EVT=[
    {t:'eq', g:4, label:'Réunion de prière en équipe', min:180, target:12},
    {t:'fg', g:4, label:'Prière des dirigeants de l\'équipe Fangwa', min:120, target:26},
    {t:'cp', g:4, label:'Prière du couple Veigne', min:120, target:52},
    {t:'sg', g:4, label:'Siège de prière de l\'équipe Fangwa', min:0, target:5},
    {t:'lc', g:5, label:'Livre chrétien lu', min:0, target:12},
    {t:'fhl',g:5, label:'FHL lu', min:0, target:12},
    {t:'rt', g:6, label:'Retraite de 48 h', min:2880, target:12},
    {t:'dn', g:8, label:'Don ponctuel à un frère', min:0, target:200}
  ];
  var EVMAP={};EVT.forEach(function(e){EVMAP[e.t]=e;});
  var FASTS=[
    {id:'f7', label:'Jeûne de 7 jours', when:'En février', days:7},
    {id:'f14',label:'Jeûne de 14 jours', when:'Pendant la croisade de juin', days:14},
    {id:'f21',label:'Jeûne de 21 jours', when:'Pendant la croisade d\'octobre', days:21},
    {id:'s40',label:'Croisade de 40 jours sans sucre', when:'Après un long jeûne', days:40}
  ];
  var BIBLE=1189;
  var DAILY_MIN=150;

  function period(y){
    var start=y===2026?START_2026:new Date(y,0,1), end=new Date(y,11,31);
    var total=dayDiff(start,end)+1, t=today();
    var elapsed=t<start?0:t>end?total:dayDiff(start,t)+1;
    var yearLen=dayDiff(new Date(y,0,1),end)+1;
    return {start:start,end:end,total:total,elapsed:elapsed,factor:total/yearLen};
  }
  function tgt(base,y){var p=period(y);return p.factor===1?base:Math.max(1,Math.round(base*p.factor));}
  function dayRec(k){var m=S.docs['m-'+k.slice(0,7)];return (m&&m.days&&m.days[k.slice(8)])||{};}
  function setDay(k,patch){
    var id='m-'+k.slice(0,7), d=doc(id); d.days=d.days||{};
    var r=d.days[k.slice(8)]||{}; Object.assign(r,patch); d.days[k.slice(8)]=r;
    save(id);
  }
  function rtCount(r){return (r.rt||[]).filter(Boolean).length;}
  function prayMin(r){return (+r.pf||0)+(+r.pd||0)+(+r.pm||0)+15*rtCount(r);}
  function dayScore(r){
    if(!r||!Object.keys(r).length)return 0;
    var s=((r.r?1:0)+Math.min((+r.ch||0)/10,1)+Math.min(prayMin(r)/DAILY_MIN,1))/3;
    return s;
  }
  function level(s){return s<=0?0:s>=0.999?3:s>=0.5?2:1;}
  function yearDoc(y){return S.docs['y-'+y]||{};}
  function yearEvents(y){return (yearDoc(y).events||[]).slice();}

  function yearTotals(y){
    var T={r:0,ch:0,pf:0,pd:0,pm:0,rt:0,pray:0,full:0,cu:0,ss:0,logged:0};
    for(var m=1;m<=12;m++){
      var md=S.docs['m-'+y+'-'+pad(m)]; if(!md||!md.days)continue;
      Object.keys(md.days).forEach(function(dd){
        var r=md.days[dd]; if(!r)return;
        if(Object.keys(r).length)T.logged++;
        if(r.r)T.r++; T.ch+=(+r.ch||0); T.pf+=(+r.pf||0); T.pd+=(+r.pd||0); T.pm+=(+r.pm||0);
        T.rt+=rtCount(r); var p=prayMin(r); T.pray+=p; if(p>=DAILY_MIN)T.full++;
        if(r.cu)T.cu++; if(r.ss)T.ss++;
      });
    }
    T.ev={}; EVT.forEach(function(e){T.ev[e.t]=0;}); T.evMin=0;
    yearEvents(y).forEach(function(e){if(T.ev[e.t]!=null){T.ev[e.t]++;T.evMin+=(+e.min||0);}});
    return T;
  }
  function sugarStreak(){
    var d=today(), n=0;
    if(!dayRec(keyOf(d)).ss)d=addDays(d,-1); // la journée en cours peut ne pas être encore notée
    while(dayRec(keyOf(d)).ss){n++;d=addDays(d,-1);if(n>2000)break;}
    return n;
  }
  function status(actual,target,expected){
    if(actual>=target)return ['Atteint','ok'];
    if(expected<=0)return actual>0?['Dans les temps','ok']:['À venir','na'];
    var r=actual/expected;
    if(r>=1)return ['Dans les temps','ok'];
    if(r>=0.85)return ['Léger retard','warn'];
    return ['En retard','bad'];
  }
  function metric(label,actual,target,y,opts){
    opts=opts||{};
    var p=period(y), done=Math.max(0,p.elapsed-1), exp=Math.floor(target*done/p.total), st=status(actual,target,exp);
    var pct=Math.min(100,target?actual/target*100:0), pacePct=Math.min(100,target?exp/target*100:0);
    var fmt=opts.fmt||fmtInt;
    return '<div class="metric"><span>'+label+'</span><span class="v">'+fmt(actual)+' / '+fmt(target)+'</span>'+
      '<div class="bar thin"><i style="width:'+pct.toFixed(1)+'%"></i>'+(p.elapsed>0&&p.elapsed<p.total?'<span class="pace" style="left:'+pacePct.toFixed(1)+'%"></span>':'')+'</div>'+
      '<div class="meta"><span>'+(opts.sub||('attendu à fin d\'hier : '+fmt(exp)))+'</span><span class="tag '+st[1]+'">'+st[0]+'</span></div></div>';
  }

  /* ================= État de la vue ================= */
  var sel=today();
  if(sel<START_2026)sel=START_2026;
  var evFilter='all';

  /* ================= Journal du jour ================= */
  var $=function(id){return document.getElementById(id);};
  function fillDay(){
    var k=keyOf(sel), r=dayRec(k);
    $('dayInput').value=k;
    $('dayLabel').textContent=sel.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+(k===keyOf(today())?' · aujourd\'hui':'');
    setTgl($('f-r'),!!r.r); setTgl($('f-cu'),!!r.cu); setTgl($('f-ss'),!!r.ss); setTgl($('f-cf'),!!r.cf);
    NUMF.concat(TXTF).forEach(function(f){var el=$('f-'+f); if(document.activeElement!==el)el.value=r[f]!=null?r[f]:'';});
    CARRY.forEach(function(f){var c=carried(f,k);$('f-'+f).placeholder=c===''?'':String(c);});
    var rt=r.rt||[]; Array.prototype.forEach.call($('f-rt').children,function(b,i){b.setAttribute('aria-pressed',rt[i]?'true':'false');});
    if(document.activeElement!==$('f-n'))$('f-n').value=r.n||'';
    if(S.evDateFor!==k){$('ev-date').value=k;S.evDateFor=k;}
    daySummary();
  }
  function setTgl(b,on){b.setAttribute('aria-pressed',on?'true':'false');b.textContent=on?'Oui':'Non';}
  function daySummary(){
    var r=dayRec(keyOf(sel)), p=prayMin(r), s=dayScore(r);
    $('daySum').innerHTML='<span>Prière seule <b>'+fmtH(p)+'</b> / 2 h 30</span><span>Chapitres <b>'+(+r.ch||0)+'</b> / 10</span><span>Journée <b>'+Math.round(s*100)+' %</b></span>';
    renderReport();
  }
  /* ---- Compte rendu WhatsApp ---- */
  var NUMF=['ch','pf','pd','pm','llp','lln','evg','jd','jn'], TXTF=['lbk','llt','pg'], CARRY=['lbk','llt','llp','lln'];
  function carried(f,k){
    var d=parseKey(k);
    for(var i=1;i<=120;i++){var r=dayRec(keyOf(addDays(d,-i)));if(r[f]!=null&&r[f]!=='')return r[f];}
    return '';
  }
  function val(r,f,k){return (r[f]!=null&&r[f]!=='')?r[f]:carried(f,k);}
  function hWA(min){var h=Math.floor(min/60),m=Math.round(min%60);return h+'h'+(m?pad(m):'');}
  function buildReport(k){
    var r=dayRec(k), d=parseKey(k);
    var date=pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear();
    var mn=function(v){return (+v||0)+' min';};
    var lbk=val(r,'lbk',k), llt=val(r,'llt',k), llp=val(r,'llp',k), lln=val(r,'lln',k);
    var llc=llt?((llp!==''?llp:'-')+'/'+(lln!==''?lln:'-')+' '+llt):'-';
    var pg=[];
    (yearDoc(d.getFullYear()).events||[]).forEach(function(e){if(e.d===k&&EVMAP[e.t]&&EVMAP[e.t].g===4)pg.push(EVMAP[e.t].label+(e.note?' ('+e.note+')':''));});
    if(r.pg)pg.push(r.pg);
    return [
      'Bonjour 😊, voici mon compte rendu du '+date,
      '',
      'RDQD: '+(r.r?1:0)+'/1',
      'PS: '+hWA(prayMin(r))+' / 2h30',
      '- Pour Amanda et Azaï : '+mn(r.pf),
      '- Pour mes disciples : '+mn(r.pd),
      '- Ministre de dons et administrateur : '+mn(r.pm),
      '- Retraites de 15 min : '+rtCount(r)+'/4',
      'LB: '+(+r.ch||0)+' Chap'+(lbk?' '+lbk:''),
      'LLC:',
      '- '+llc,
      'PG:'
    ].concat(pg.length?pg.map(function(x){return '- '+x;}):['- -']).concat([
      'Culte matinal : '+(r.cu?'oui':'non'),
      'Confession des péchés : '+(r.cf?'oui':'non'),
      'Évangélisation : '+(+r.evg||0),
      'Jeûne : '+(r.jd?(r.jd+'/'+(r.jn||'-')):'-')
    ]).join('\n');
  }
  function renderReport(){$('waText').value=buildReport(keyOf(sel));}
  function bindDay(){
    [['f-r','r'],['f-cu','cu'],['f-ss','ss'],['f-cf','cf']].forEach(function(p){
      $(p[0]).addEventListener('click',function(){var on=this.getAttribute('aria-pressed')!=='true';setTgl(this,on);setDay(keyOf(sel),(function(o){o[p[1]]=on;return o;})({}));afterEdit();});
    });
    NUMF.forEach(function(f){
      $('f-'+f).addEventListener('input',function(){
        var v=this.value===''?(CARRY.indexOf(f)>=0?'':0):Math.max(0,Math.round(+this.value||0));
        var o={};o[f]=v;setDay(keyOf(sel),o);afterEdit();});
    });
    TXTF.forEach(function(f){
      $('f-'+f).addEventListener('input',function(){var o={};o[f]=this.value;setDay(keyOf(sel),o);renderReport();});
    });
    $('q-jd').addEventListener('click',function(){
      var y=dayRec(keyOf(addDays(sel,-1))), r=dayRec(keyOf(sel));
      var jd=y.jd?(+y.jd+1):((+r.jd||0)+1), jn=r.jn||y.jn||'';
      setDay(keyOf(sel),{jd:jd,jn:jn}); $('f-jd').value=jd; $('f-jn').value=jn; renderReport();
    });
    $('waCopy').addEventListener('click',function(){
      var b=this, t=$('waText').value;
      var fallback=function(){$('waText').focus();$('waText').select();b.textContent='Texte sélectionné : Ctrl+C';setTimeout(function(){b.textContent='Copier';},2500);};
      try{
        navigator.clipboard.writeText(t).then(function(){b.textContent='Copié';setTimeout(function(){b.textContent='Copier';},1800);},fallback);
      }catch(e){fallback();}
    });
    $('q-ch').addEventListener('click',function(){var r=dayRec(keyOf(sel));var v=(+r.ch||0)+10;setDay(keyOf(sel),{ch:v});$('f-ch').value=v;afterEdit();});
    Array.prototype.forEach.call(document.querySelectorAll('[data-fill]'),function(b){
      b.addEventListener('click',function(){var f=b.getAttribute('data-fill').slice(2);var o={};o[f]=30;setDay(keyOf(sel),o);$('f-'+f).value=30;afterEdit();});
    });
    Array.prototype.forEach.call($('f-rt').children,function(b,i){
      b.addEventListener('click',function(){var r=dayRec(keyOf(sel));var rt=(r.rt||[false,false,false,false]).slice();while(rt.length<4)rt.push(false);rt[i]=!rt[i];b.setAttribute('aria-pressed',rt[i]?'true':'false');setDay(keyOf(sel),{rt:rt});afterEdit();});
    });
    $('f-n').addEventListener('input',function(){setDay(keyOf(sel),{n:this.value});});
    $('prevDay').addEventListener('click',function(){goTo(addDays(sel,-1));});
    $('nextDay').addEventListener('click',function(){goTo(addDays(sel,1));});
    $('todayBtn').addEventListener('click',function(){goTo(today());});
    $('dayInput').addEventListener('change',function(){if(this.value)goTo(parseKey(this.value));});
    $('prevMonth').addEventListener('click',function(){goTo(new Date(sel.getFullYear(),sel.getMonth()-1,1));});
    $('nextMonth').addEventListener('click',function(){goTo(new Date(sel.getFullYear(),sel.getMonth()+1,1));});
  }
  function goTo(d){
    if(d<new Date(2026,0,1))d=new Date(2026,0,1);
    if(d>new Date(2031,11,31))d=new Date(2031,11,31);
    var yChanged=d.getFullYear()!==sel.getFullYear(); sel=d;
    fillDay(); renderCal(); if(yChanged)renderYear(); renderExp();
  }
  function afterEdit(){daySummary();renderCal();renderYear();renderSpCard();renderExp();}

  function renderCal(){
    var y=sel.getFullYear(), m=sel.getMonth();
    $('calTitle').textContent=MONTHS[m]+' '+y;
    var first=new Date(y,m,1), offset=(first.getDay()+6)%7, n=new Date(y,m+1,0).getDate();
    var h=['lun','mar','mer','jeu','ven','sam','dim'].map(function(d){return '<span class="dow">'+d+'</span>';}).join('');
    for(var i=0;i<offset;i++)h+='<span></span>';
    var tk=keyOf(today()), sk=keyOf(sel), full=0, ms={r:0,ch:0,p:0,cu:0};
    for(var d=1;d<=n;d++){
      var k=y+'-'+pad(m+1)+'-'+pad(d), r=dayRec(k), lv=level(dayScore(r));
      if(lv===3)full++; if(r.r)ms.r++; ms.ch+=(+r.ch||0); ms.p+=prayMin(r); if(r.cu)ms.cu++;
      h+='<button type="button" data-k="'+k+'" class="l'+lv+(k===sk?' sel':'')+(k===tk?' today':'')+'" aria-label="'+d+' '+MONTHS[m]+'">'+d+'</button>';
    }
    $('cal').innerHTML=h;
    $('monthSum').innerHTML='<span>Journées complètes <b>'+full+'</b></span><span>RDQD <b>'+ms.r+'</b></span><span>Chapitres <b>'+ms.ch+'</b></span><span>Prière seule <b>'+fmtH(ms.p)+'</b></span><span>Cultes <b>'+ms.cu+'</b></span>';
  }

  /* ================= Bilan de l'année ================= */
  function renderYear(){
    var y=sel.getFullYear(), T=yearTotals(y), p=period(y);
    $('spYear').textContent=y;
    $('yearChips').innerHTML=YEARS.map(function(yy){return '<button type="button" class="chip" data-y="'+yy+'" aria-pressed="'+(yy===y)+'">'+yy+'</button>';}).join('');
    $('periodNote').textContent=y===2026
      ?'2026 est l\'année de lancement : le suivi démarre le 26 octobre, les objectifs sont ramenés au prorata des '+p.total+' jours restants. Les jeûnes commencent en 2027.'
      :'Jour '+p.elapsed+' sur '+p.total+' · '+T.logged+' journées notées.';
    var ev=function(t){return T.ev[t];};
    var chT=tgt(3*BIBLE,y);
    var html='';
    html+=card(1,'RDQD (méditation)',metric('Jours de RDQD',T.r,tgt(300,y),y));
    html+=card(2,'Lecture biblique',
      metric('Chapitres lus',T.ch,chT,y)+
      '<p class="muted" style="font-size:.82rem">'+(T.ch/BIBLE).toFixed(2).replace('.',',')+' lecture(s) complète(s) de la Bible sur '+(y===2026?(chT/BIBLE).toFixed(1).replace('.',','):'3')+'.</p>');
    var dayTarget=p.total;
    html+=card(3,'Prière seule · 2 h 30 par jour',
      metric('Temps total',T.pray,DAILY_MIN*dayTarget,y,{fmt:function(v){return fmtH(v);}})+
      metric('Journées à 2 h 30',T.full,dayTarget,y)+
      metric('Pour Amanda et Azaï',T.pf,30*dayTarget,y,{fmt:function(v){return fmtH(v);}})+
      metric('Pour les disciples',T.pd,30*dayTarget,y,{fmt:function(v){return fmtH(v);}})+
      metric('Ministre de dons et administrateur',T.pm,30*dayTarget,y,{fmt:function(v){return fmtH(v);}})+
      metric('Retraites de 15 min',T.rt,4*dayTarget,y));
    html+=card(4,'Prière en groupe',
      metric('Réunions de prière en équipe (3 h)',ev('eq'),tgt(12,y),y)+
      metric('Prière des dirigeants Fangwa (2 h)',ev('fg'),tgt(26,y),y)+
      metric('Prière du couple Veigne (2 h)',ev('cp'),tgt(52,y),y)+
      metric('Cultes matinaux / LB avec Azaï',T.cu,tgt(250,y),y)+
      metric('Sièges de prière Fangwa',ev('sg'),tgt(5,y),y)+
      '<p class="muted" style="font-size:.82rem">Temps de prière en groupe enregistré : '+fmtH(T.evMin-(ev('rt')*2880))+' (hors cultes).</p>');
    html+=card(5,'Littérature chrétienne',
      metric('Livres chrétiens',ev('lc'),tgt(12,y),y)+metric('FHL',ev('fhl'),tgt(12,y),y)+
      '<p class="muted" style="font-size:.82rem">Total : '+(ev('lc')+ev('fhl'))+' / '+(tgt(12,y)*2)+' livres.</p>');
    html+=card(6,'Retraites pour le progrès spirituel',metric('Retraites de 48 h',ev('rt'),tgt(12,y),y));
    html+=card(7,'Le jeûne',fastsHtml(y,T));
    html+=card(8,'Le don à Dieu',metric('Dons ponctuels aux frères',ev('dn'),tgt(200,y),y));
    $('disc').innerHTML=html;
    renderEvents();
  }
  function card(n,title,body){return '<div class="panel"><div class="dhead"><span class="n">'+n+'</span><h3>'+esc(title)+'</h3></div>'+body+'</div>';}
  function fastsHtml(y,T){
    var rg=S.docs.reglages||{}, yd=yearDoc(y), f=yd.fasts||{}, streak=sugarStreak();
    var h='<div class="prereq"><span><b>Préalable</b> : délivré de la gloutonnerie et sevré du sucre.<br><small class="muted">Série actuelle sans sucre : '+streak+' jour'+(streak>1?'s':'')+' · '+T.ss+' jours sans sucre en '+y+'</small></span>'+
      '<button type="button" class="tgl" id="prereqBtn" aria-pressed="'+(!!rg.sevre)+'">'+(rg.sevre?'Oui':'Non')+'</button></div>';
    if(y===2026)return h+'<p class="muted" style="font-size:.85rem">Les jeûnes de l\'année démarrent en février 2027.</p>';
    FASTS.forEach(function(fs){
      var r=f[fs.id]||{}, done=Math.min(+r.done||0,fs.days), pct=done/fs.days*100;
      var st=done>=fs.days?['Accompli','ok']:done>0?['En cours','warn']:['Prévu','na'];
      h+='<div class="fast"><div class="top"><span><b style="font-weight:600">'+fs.label+'</b> <span class="muted" style="font-size:.82rem">· '+fs.when+'</span></span><span class="tag '+st[1]+'">'+st[0]+'</span></div>'+
        '<div class="bar thin"><i style="width:'+pct+'%"></i></div>'+
        '<div class="ctl" style="justify-content:space-between"><label class="muted" style="font-size:.8rem">Début <input type="date" data-fast="'+fs.id+'" data-f="start" value="'+esc(r.start||'')+'" id="fs-'+fs.id+'-start"></label>'+
        '<span class="ctl"><button class="iconbtn" type="button" data-fast="'+fs.id+'" data-step="-1" aria-label="Retirer un jour">−</button><span class="unit" style="text-align:center">'+done+' / '+fs.days+' j</span><button class="iconbtn" type="button" data-fast="'+fs.id+'" data-step="1" aria-label="Ajouter un jour">+</button></span></div></div>';
    });
    return h;
  }
  function bindYear(){
    $('yearChips').addEventListener('click',function(e){
      var b=e.target.closest('[data-y]'); if(!b)return; var y=+b.getAttribute('data-y');
      var t=today(); goTo(y===t.getFullYear()?t:y===2026?START_2026:new Date(y,0,1));
    });
    $('disc').addEventListener('click',function(e){
      if(e.target.id==='prereqBtn'){var rg=doc('reglages');rg.sevre=!rg.sevre;save('reglages');renderYear();return;}
      var b=e.target.closest('[data-step]'); if(!b)return;
      var y=sel.getFullYear(), id=b.getAttribute('data-fast'), fs=FASTS.filter(function(x){return x.id===id;})[0];
      var yd=doc('y-'+y); yd.fasts=yd.fasts||{}; var r=yd.fasts[id]||{};
      r.done=Math.max(0,Math.min(fs.days,(+r.done||0)+(+b.getAttribute('data-step'))));
      if(r.done>0&&!r.start)r.start=keyOf(addDays(today(),-(r.done-1)));
      yd.fasts[id]=r; save('y-'+y); renderYear();
    });
    $('disc').addEventListener('change',function(e){
      var el=e.target; if(!el.matches('input[data-fast]'))return;
      var y=sel.getFullYear(), yd=doc('y-'+y); yd.fasts=yd.fasts||{}; var r=yd.fasts[el.getAttribute('data-fast')]||{};
      r.start=el.value; yd.fasts[el.getAttribute('data-fast')]=r; save('y-'+y);
    });
  }

  /* ================= Registre ================= */
  function renderEvents(){
    var y=sel.getFullYear(), list=yearEvents(y);
    var counts={}; list.forEach(function(e){counts[e.t]=(counts[e.t]||0)+1;});
    $('evFilters').innerHTML='<button type="button" class="chip" data-ft="all" aria-pressed="'+(evFilter==='all')+'">Tout ('+list.length+')</button>'+
      EVT.map(function(e){return '<button type="button" class="chip" data-ft="'+e.t+'" aria-pressed="'+(evFilter===e.t)+'">'+esc(e.label)+' ('+(counts[e.t]||0)+')</button>';}).join('');
    if(evFilter!=='all')list=list.filter(function(e){return e.t===evFilter;});
    list.sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0;});
    $('evLog').innerHTML=list.length?list.map(function(e){
      var t=EVMAP[e.t]||{label:e.t};
      return '<div class="ev"><span class="d">'+esc(parseKey(e.d).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}))+'</span><span class="t">'+esc(t.label)+(e.note?'<small>'+esc(e.note)+'</small>':'')+'</span><button type="button" class="del" data-del="'+esc(e.id)+'">Supprimer</button></div>';
    }).join(''):'<div class="empty">Aucun événement noté pour '+y+(evFilter!=='all'?' dans cette catégorie':'')+'. Choisis un type, une date et ajoute le premier.</div>';
    renderReport();
  }
  function bindEvents(){
    $('ev-type').innerHTML=EVT.map(function(e){return '<option value="'+e.t+'">'+esc(e.label)+'</option>';}).join('');
    $('evForm').addEventListener('submit',function(e){
      e.preventDefault();
      var t=$('ev-type').value, d=$('ev-date').value; if(!d)return;
      var y=+d.slice(0,4), yd=doc('y-'+y); yd.events=yd.events||[];
      yd.events.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),t:t,d:d,min:EVMAP[t].min,note:$('ev-note').value.trim()});
      save('y-'+y); $('ev-note').value='';
      if(y!==sel.getFullYear())goTo(parseKey(d)); else {renderYear();renderSpCard();}
      $('ev-add').textContent='Ajouté'; setTimeout(function(){$('ev-add').textContent='Ajouter';},1200);
    });
    $('evFilters').addEventListener('click',function(e){var b=e.target.closest('[data-ft]');if(!b)return;evFilter=b.getAttribute('data-ft');renderEvents();});
    $('evLog').addEventListener('click',function(e){
      var b=e.target.closest('[data-del]'); if(!b)return;
      if(!b.classList.contains('arm')){b.classList.add('arm');b.textContent='Confirmer';setTimeout(function(){if(b.isConnected){b.classList.remove('arm');b.textContent='Supprimer';}},3000);return;}
      var y=sel.getFullYear(), yd=doc('y-'+y), id=b.getAttribute('data-del');
      yd.events=(yd.events||[]).filter(function(x){return x.id!==id;}); save('y-'+y); renderYear(); renderSpCard();
    });
  }

  /* ================= Export (jour, plusieurs jours, mois, année) ================= */
  var EXP={mode:'month',fmt:'csv',from:'',to:'',day:'',m:null,y:null};
  function expBounds(){
    var y=sel.getFullYear(), a, b;
    if(EXP.day==='')EXP.day=keyOf(sel); if(EXP.m==null)EXP.m=sel.getMonth(); if(EXP.y==null)EXP.y=y;
    if(EXP.mode==='day'){a=b=parseKey(EXP.day);}
    else if(EXP.mode==='month'){a=new Date(EXP.y,EXP.m,1);b=new Date(EXP.y,EXP.m+1,0);}
    else if(EXP.mode==='year'){a=period(EXP.y).start;b=new Date(EXP.y,11,31);}
    else{a=EXP.from?parseKey(EXP.from):new Date(y,sel.getMonth(),1);b=EXP.to?parseKey(EXP.to):new Date(sel);if(b<a){var t=a;a=b;b=t;}}
    return {a:a,b:b};
  }
  function expEvents(a,b){
    var ka=keyOf(a), kb=keyOf(b), out=[];
    for(var y=a.getFullYear();y<=b.getFullYear();y++)yearEvents(y).forEach(function(e){if(e.d>=ka&&e.d<=kb)out.push(e);});
    return out.sort(function(x,z){return x.d<z.d?-1:x.d>z.d?1:0;});
  }
  function expName(a,b){
    var base='suivi-spirituel-';
    if(EXP.mode==='day')return base+keyOf(a);
    if(EXP.mode==='month')return base+keyOf(a).slice(0,7);
    if(EXP.mode==='year')return base+a.getFullYear();
    return base+keyOf(a)+'_au_'+keyOf(b);
  }
  function expCsv(a,b){
    var cell=function(c){c=String(c==null?'':c);return /[;"\n\r]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;};
    var rows=[['date','rdqd','chapitres','livre_biblique','priere_amanda_azai_min','priere_disciples_min','priere_ministre_min','retraites_15min','priere_seule_total_min','journee_complete','culte_matinal','sans_sucre','livre_chretien','llc_progression','priere_groupe','confession','evangelisation','jeune','note']];
    var T={r:0,ch:0,pf:0,pd:0,pm:0,rt:0,p:0,full:0,cu:0,ss:0,cf:0,evg:0,n:0};
    for(var d=new Date(a);d<=b;d=addDays(d,1)){
      var k=keyOf(d), r=dayRec(k), p=prayMin(r), llt=val(r,'llt',k), llp=val(r,'llp',k), lln=val(r,'lln',k);
      T.n++; if(r.r)T.r++; T.ch+=(+r.ch||0); T.pf+=(+r.pf||0); T.pd+=(+r.pd||0); T.pm+=(+r.pm||0); T.rt+=rtCount(r); T.p+=p;
      if(p>=DAILY_MIN&&r.r&&(+r.ch||0)>=10)T.full++; if(r.cu)T.cu++; if(r.ss)T.ss++; if(r.cf)T.cf++; T.evg+=(+r.evg||0);
      rows.push([k,r.r?1:0,+r.ch||0,val(r,'lbk',k),+r.pf||0,+r.pd||0,+r.pm||0,rtCount(r),p,(p>=DAILY_MIN&&r.r&&(+r.ch||0)>=10)?1:0,r.cu?1:0,r.ss?1:0,
        llt,llt?((llp!==''?llp:'')+'/'+(lln!==''?lln:'')):'',r.pg||'',r.cf?1:0,+r.evg||0,r.jd?(r.jd+'/'+(r.jn||'')):'',r.n||'']);
    }
    rows.push(['TOTAL ('+T.n+' jours)',T.r,T.ch,'',T.pf,T.pd,T.pm,T.rt,T.p,T.full,T.cu,T.ss,'','','',T.cf,T.evg,'','']);
    rows.push([]); rows.push(['date','evenement','duree_min','detail']);
    var ev=expEvents(a,b);
    ev.forEach(function(e){rows.push([e.d,(EVMAP[e.t]||{}).label||e.t,e.min||0,e.note||'']);});
    if(!ev.length)rows.push(['aucun événement sur la période']);
    return '﻿'+rows.map(function(r){return r.map(cell).join(';');}).join('\r\n');
  }
  function expTxt(a,b){
    var parts=[];
    for(var d=new Date(a);d<=b;d=addDays(d,1)){var k=keyOf(d);if(Object.keys(dayRec(k)).length)parts.push(buildReport(k));}
    return parts.length?parts.join('\n\n———\n\n'):'';
  }
  function renderExp(){
    var x=expBounds(), a=x.a, b=x.b, n=dayDiff(a,b)+1, filled=0;
    for(var d=new Date(a);d<=b;d=addDays(d,1))if(Object.keys(dayRec(keyOf(d))).length)filled++;
    var f=function(dt){return dt.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});};
    Array.prototype.forEach.call($('expPeriod').children,function(c){c.setAttribute('aria-pressed',String(c.getAttribute('data-m')===EXP.mode));});
    Array.prototype.forEach.call($('expFormat').children,function(c){c.setAttribute('aria-pressed',String(c.getAttribute('data-f')===EXP.fmt));});
    $('expRange').hidden=EXP.mode!=='range';
    $('expDayL').hidden=EXP.mode!=='day'; $('expMonthL').hidden=EXP.mode!=='month'; $('expYearL').hidden=!(EXP.mode==='month'||EXP.mode==='year');
    $('expPick').hidden=EXP.mode==='range';
    $('exp-day').value=EXP.day; $('exp-m').value=String(EXP.m); $('exp-y').value=String(EXP.y);
    if(EXP.mode==='range'){$('exp-from').value=keyOf(a);$('exp-to').value=keyOf(b);}
    $('expDesc').textContent=(n===1?'Le '+f(a):'Du '+f(a)+' au '+f(b))+' · '+n+' jour'+(n>1?'s':'')+', dont '+filled+' rempli'+(filled>1?'s':'')+' · '+expEvents(a,b).length+' événement(s) du registre.';
    $('expCopy').hidden=EXP.fmt!=='txt';
    $('expGo').textContent=EXP.fmt==='csv'?'Télécharger le tableau (CSV)':'Télécharger les comptes rendus (texte)';
  }
  function expMsg(t){$('expMsg').textContent=t;if(t)setTimeout(function(){if($('expMsg').textContent===t)$('expMsg').textContent='';},4000);}
  $('expPeriod').addEventListener('click',function(e){var c=e.target.closest('[data-m]');if(!c)return;EXP.mode=c.getAttribute('data-m');renderExp();});
  $('expFormat').addEventListener('click',function(e){var c=e.target.closest('[data-f]');if(!c)return;EXP.fmt=c.getAttribute('data-f');renderExp();});
  $('exp-m').innerHTML=MONTHS.map(function(m,i){return '<option value="'+i+'">'+m+'</option>';}).join('');
  $('exp-y').innerHTML=YEARS.map(function(y){return '<option value="'+y+'">'+y+'</option>';}).join('');
  $('exp-day').addEventListener('change',function(){if(this.value){EXP.day=this.value;renderExp();}});
  $('exp-m').addEventListener('change',function(){EXP.m=+this.value;renderExp();});
  $('exp-y').addEventListener('change',function(){EXP.y=+this.value;renderExp();});
  $('exp-from').addEventListener('change',function(){EXP.from=this.value;renderExp();});
  $('exp-to').addEventListener('change',function(){EXP.to=this.value;renderExp();});
  $('expGo').addEventListener('click',function(){
    var x=expBounds(), data=EXP.fmt==='csv'?expCsv(x.a,x.b):expTxt(x.a,x.b);
    if(!data){expMsg('Aucune journée remplie sur cette période.');return;}
    var name=expName(x.a,x.b)+(EXP.fmt==='csv'?'.csv':'.txt');
    var blob=new Blob([data],{type:EXP.fmt==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'});
    var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){URL.revokeObjectURL(a.href);},1500);
    expMsg('Fichier '+name+' téléchargé.');
  });
  $('expCopy').addEventListener('click',function(){
    var x=expBounds(), t=expTxt(x.a,x.b), b=this;
    if(!t){expMsg('Aucune journée remplie sur cette période.');return;}
    try{navigator.clipboard.writeText(t).then(function(){b.textContent='Copié';setTimeout(function(){b.textContent='Copier le texte';},1800);},function(){$('waText').value=t;$('waText').select();expMsg('Copie bloquée : le texte est sélectionné dans le compte rendu, fais Ctrl+C.');});}
    catch(e){expMsg('Copie impossible ici.');}
  });

  /* ================= Feuille de route ================= */
  var SPAN=56, pct=function(m){return (m/SPAN*100).toFixed(2)+'%';};
  var rows=[
    ['Carte de résident (attendue)',{dot:0}],
    ['Préparation avocat',{from:8,to:20}],
    ['Examen civique',{from:21,to:22,cls:'soft'}],
    ['Pièces justificatives',{from:20,to:22}],
    ['Dépôt ANEF',{dot:22}],
    ['Confirmation de dépôt',{dot:28}],
    ['Récépissé de complétude',{dot:40}],
    ['Délai légal 12 mois',{from:40,to:52}],
    ['Prolongation 3 mois',{from:52,to:56,cls:'gold'}]
  ];
  var now=new Date(), monthIdx=(now.getFullYear()-2026)*12+now.getMonth()-9+now.getDate()/31;
  var gh='';
  rows.forEach(function(r){
    var o=r[1], el;
    if('dot' in o) el='<span class="g-dot" style="left:'+pct(o.dot)+'"></span>';
    else el='<span class="g-bar '+(o.cls||'')+'" style="left:'+pct(o.from)+';width:'+pct(o.to-o.from)+'"></span>';
    var nowLine=(monthIdx>=0&&monthIdx<=SPAN)?'<span class="g-now" style="left:'+pct(monthIdx)+'"></span>':'';
    gh+='<div class="g-row"><span>'+r[0]+'</span><div class="g-track">'+el+nowLine+'</div></div>';
  });
  var ticks=[[0,'oct. 26'],[3,'2027'],[15,'2028'],[27,'2029'],[39,'2030'],[51,'2031'],[56,'mai 31']];
  gh+='<div class="g-row"><span class="muted" style="font-size:.72rem">trait vert = aujourd\'hui</span><div class="g-axis">'+
    ticks.map(function(t){return '<span style="left:'+pct(t[0])+'">'+t[1]+'</span>';}).join('')+'</div></div>';
  $('gantt').innerHTML=gh;
  $('monthsLeft').textContent=Math.max(0,(2031-now.getFullYear())*12+(4-now.getMonth()));

  var goals=[
    {id:'cg',title:'Groupe de louange Chill&Gospel',target:'Cible : 100 personnes · un concert d\'évangélisation chaque année',ms:[
      ['2027','Noyau de 12 musiciens et chantres, nom et identité posés · concert d\'évangélisation 2027'],
      ['2028','40 membres, répertoire de 20 chants, premier live · concert d\'évangélisation 2028'],
      ['2029','70 membres · concert d\'évangélisation 2029'],
      ['2030','Enregistrement de chants, présence en ligne régulière · concert d\'évangélisation 2030'],
      ['2031','100 personnes engagées · concert d\'évangélisation 2031']]},
    {id:'jx',title:'JEXCELLENCE',target:'Cible : 50 000 € de CA par mois',ms:[
      ['2027','10 000 € / mois récurrents'],
      ['2028','20 000 € / mois, premier collaborateur'],
      ['2029','35 000 € / mois, offre structurée et équipe'],
      ['2030','50 000 € / mois atteints'],
      ['2031','La société tourne sans ma présence quotidienne']]},
    {id:'eg',title:'Implantation d\'églises',target:'Cible : 5 églises, 20 assemblées de maison IDF, 1000 personnes',done:'3 assemblées de maison et une église implantée au Mans',ms:[
      ['2027','7 assemblées de maison, 2e église implantée'],
      ['2028','10 assemblées de maison, 3e église'],
      ['2029','15 assemblées de maison, 4e église'],
      ['2030','20 assemblées de maison, 5e église'],
      ['2031','1000 personnes sous ma responsabilité spirituelle']]},
    {id:'sl',title:'Acheter une salle',target:'Cible : salle achetée, louée en priorité à l\'Église de Paris',ms:[
      ['2027','Montage SCI et plan de financement validés'],
      ['2028','Salle identifiée, compromis signé'],
      ['2029','Acte d\'achat signé'],
      ['2030','Mise aux normes et premiers cultes de l\'Église de Paris'],
      ['2031','Salle rentable et occupée en continu']]},
    {id:'sp',special:true,title:'Profondeur spirituelle et cœur large',target:'Cible : 8 disciplines tenues chaque année'},
    {id:'mf',title:'Enseignant biblique sur les finances',target:'Cible : module complet, enseigné et transmis',ms:[
      ['2027','Plan du module calé sur le livre en cours'],
      ['2028','Session pilote avec un premier groupe'],
      ['2029','Module complet : supports, exercices, témoignages'],
      ['2030','Module enregistré et enseigné dans les assemblées'],
      ['2031','Livre de témoignage prêt à publier']]}
,
    {id:'nat',wide:true,title:'Nationalité française',target:'Cible : française au plus tard en mai 2031',ms:[
      ['2026','Carte de résident obtenue'],
      ['2028','Examen civique réussi (juillet)'],
      ['2028','Demande déposée sur l\'ANEF (août)'],
      ['2030','Récépissé de complétude (février)'],
      ['2031','Décret de naturalisation (mai au plus tard)']]}
  ];
  var totalMs=0, out='';
  goals.forEach(function(go){
    if(go.special){out+='<article class="goal" id="spCard"></article>';return;}
    out+='<article class="goal'+(go.wide?' wide':'')+'"><header><h3>'+esc(go.title)+'</h3><span class="target">'+esc(go.target)+'</span>'+(go.done?'<span class="acq"><span class="tag ok" style="margin-left:0">Déjà fait</span> '+esc(go.done)+'</span>':'')+'<span class="count" id="c-'+go.id+'"></span></header><ul class="ms">';
    go.ms.forEach(function(m,i){
      var id=go.id+'-'+i; totalMs++;
      out+='<li><label for="'+id+'"><input type="checkbox" id="'+id+'"><span class="y">'+m[0]+'</span><span class="t">'+esc(m[1])+'</span></label></li>';
    });
    out+='</ul></article>';
  });
  $('goals').innerHTML=out;
  function renderMilestones(){
    var ch=(S.docs.jalons&&S.docs.jalons.checked)||{}, done=0;
    goals.forEach(function(go){
      if(go.special)return; var n=0;
      go.ms.forEach(function(m,i){var id=go.id+'-'+i, el=$(id); el.checked=!!ch[id]; if(ch[id])n++;});
      done+=n; $('c-'+go.id).textContent=n+' / '+go.ms.length+' jalons';
    });
    $('msDone').textContent=done+' / '+totalMs;
    $('barFill').style.width=(done/totalMs*100)+'%';
    $('barText').textContent=done===0?'Aucun jalon coché pour l\'instant.':Math.round(done/totalMs*100)+' % des jalons franchis';
  }
  $('goals').addEventListener('change',function(e){
    if(e.target.type!=='checkbox')return;
    var j=doc('jalons'); j.checked=j.checked||{}; j.checked[e.target.id]=e.target.checked; save('jalons'); renderMilestones();
  });
  function renderSpCard(){
    var y=today().getFullYear(); if(y<2026)y=2026; if(y>2031)y=2031;
    var T=yearTotals(y), p=period(y);
    var line=function(label,a,t,fmt){fmt=fmt||fmtInt;var w=Math.min(100,t?a/t*100:0);return '<li><span>'+label+'</span><span class="v">'+fmt(a)+' / '+fmt(t)+'</span><div class="bar thin"><i style="width:'+w.toFixed(1)+'%"></i></div></li>';};
    $('spCard').innerHTML='<header><h3>Profondeur spirituelle et cœur large</h3><span class="target">Cible : 8 disciplines tenues chaque année</span><span class="count">Année '+y+(y===2026?' (au prorata, depuis le 26 octobre)':'')+'</span></header>'+
      '<ul class="sp-list">'+
      line('RDQD',T.r,tgt(300,y))+
      line('Chapitres de la Bible',T.ch,tgt(3*BIBLE,y))+
      line('Prière seule',T.pray,DAILY_MIN*p.total,fmtH)+
      line('Réunions de prière en groupe',T.ev.eq+T.ev.fg+T.ev.cp+T.ev.sg,tgt(12,y)+tgt(26,y)+tgt(52,y)+tgt(5,y))+
      line('Cultes matinaux avec Azaï',T.cu,tgt(250,y))+
      line('Livres chrétiens et FHL',T.ev.lc+T.ev.fhl,tgt(12,y)*2)+
      line('Retraites de 48 h',T.ev.rt,tgt(12,y))+
      line('Dons aux frères',T.ev.dn,tgt(200,y))+
      '</ul><button class="btn" type="button" id="openSp">Ouvrir le suivi détaillé</button>';
    $('openSp').onclick=function(){show('spirituel');window.scrollTo(0,0);};
  }

  /* ================= Vues ================= */
  function show(v){
    var sp=v==='spirituel';
    $('view-route').hidden=sp; $('view-spirituel').hidden=!sp;
    $('tab-route').setAttribute('aria-selected',String(!sp)); $('tab-spirituel').setAttribute('aria-selected',String(sp));
  }
  $('tab-route').addEventListener('click',function(){show('route');});
  $('tab-spirituel').addEventListener('click',function(){show('spirituel');});
  if(location.hash==='#spirituel')show('spirituel');

  function renderAll(){renderMilestones();renderSpCard();fillDay();renderCal();renderYear();renderExp();}
  $('cal').addEventListener('click',function(e){var b=e.target.closest('[data-k]');if(b)goTo(parseKey(b.getAttribute('data-k')));});
  bindDay(); bindYear(); bindEvents();
  setSync('','Enregistré dans ce navigateur uniquement');
  renderAll();
  connect().catch(function(){setSync('','Enregistré dans ce navigateur uniquement');});
})();
