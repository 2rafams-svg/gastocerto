// ===================== CONFIG =====================
const SUPABASE_URL = 'https://asnuusgwtsjpwuaakfuc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z46thUwaqpXRR8i2PxZWzQ_oG2eJ3yK';
const CORRECT_PIN = () => String(new Date().getFullYear());
const SESSION_KEY = 'gc-auth-session-v2';
const CACHE_PREFIX = 'gc-cache-v2';
const CONFIG={
  APP_NAME:'GastoCerto',TRIAL_DAYS:14,FREE_DAILY_LAUNCHES:3,FREE_MAX_CATEGORIES:2,
  PLANS:{monthly:{price:null,label:'Mensal'},annual:{price:null,label:'Anual'},lifetime:{price:null,label:'Vitalício'}}
};
let authMode='login', session=null, currentUser=null, refreshTimer=null, refreshPromise=null;

function setAuthMode(mode){
  authMode=mode;
  const signup=mode==='signup';
  document.getElementById('auth-login-tab').classList.toggle('active',!signup);
  document.getElementById('auth-signup-tab').classList.toggle('active',signup);
  document.getElementById('auth-name-field').hidden=!signup;
  document.getElementById('auth-password').autocomplete=signup?'new-password':'current-password';
  document.getElementById('auth-submit').textContent=signup?'Começar 14 dias grátis':'Entrar';
  document.getElementById('auth-copy').textContent=signup?'Crie sua conta e use todos os recursos Pro por 14 dias.':'Entre para acessar seus gastos com segurança.';
  document.getElementById('auth-error').textContent='';
}
function authMessage(error){
  const msg=String(error||'');
  if(/invalid login/i.test(msg)) return 'E-mail ou senha incorretos.';
  if(/already registered|already been registered/i.test(msg)) return 'Este e-mail já possui uma conta.';
  if(/password/i.test(msg)) return 'Use uma senha com pelo menos 6 caracteres.';
  return msg||'Não foi possível autenticar. Tente novamente.';
}
async function authRequest(path, body){
  const res=await fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){const err=new Error(data.msg||data.message||data.error_description||'Falha de autenticação');err.status=res.status;throw err;}
  return data;
}
function persistSession(value){
  session=value; currentUser=value?.user||null;
  if(value) localStorage.setItem(SESSION_KEY,JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY);
  clearTimeout(refreshTimer);
  if(value?.expires_at){
    const delay=Math.max(10000,value.expires_at*1000-Date.now()-60000);
    refreshTimer=setTimeout(refreshSession,delay);
  }
}
async function refreshSession(){
  if(refreshPromise) return refreshPromise;
  if(!session?.refresh_token) return false;
  refreshPromise=(async()=>{
    try{const data=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});persistSession(data);return true;}
    catch(err){
      if(err.status===400||err.status===401){logout();return false;}
      clearTimeout(refreshTimer);refreshTimer=setTimeout(refreshSession,30000);return false;
    }finally{refreshPromise=null;}
  })();
  return refreshPromise;
}
async function ensureValidSession(){
  if(!session?.access_token)return false;
  if(!session.expires_at||session.expires_at*1000-Date.now()<120000)await refreshSession();
  return !!session?.access_token;
}
async function bootstrapAuth(){
  try{
    const saved=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    if(saved?.refresh_token){ persistSession(saved); await refreshSession(); }
  }catch{ persistSession(null); }
  if(session?.access_token) enterApp();
}
function enterApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('account-btn').textContent=currentUser?.email?.split('@')[0]||'Conta';
  init();
}
async function logout(){
  const token=session?.access_token;
  if(token) fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}}).catch(()=>{});
  persistSession(null); categories=[]; months=[]; expenses=[]; expenseNames=[];
  document.getElementById('app').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  _closeModal(); setAuthMode('login');
}
document.getElementById('auth-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=document.getElementById('auth-submit'), error=document.getElementById('auth-error');
  const email=document.getElementById('auth-email').value.trim(), password=document.getElementById('auth-password').value;
  button.disabled=true; error.textContent='';
  try{
    const data=authMode==='signup'
      ?await authRequest('signup',{email,password,data:{display_name:document.getElementById('auth-name').value.trim()}})
      :await authRequest('token?grant_type=password',{email,password});
    if(!data.access_token) throw new Error('Confira seu e-mail para confirmar a conta antes de entrar.');
    persistSession(data); enterApp();
    if(authMode==='signup') setTimeout(()=>{ showWelcomeTrial(); localStorage.removeItem(TUTORIAL_KEY); },300);
  }catch(err){ error.textContent=authMessage(err.message); }
  finally{ button.disabled=false; }
});

// ===================== HAPTIC =====================
function vib(ms=8){ if(navigator.vibrate) navigator.vibrate(ms); }

// ===================== PIN =====================
let pinValue = '';
document.getElementById('pin-grid').addEventListener('pointerdown', e => {
  const key = e.target.closest('.pin-key');
  if(!key || key.classList.contains('empty')) return;
  e.preventDefault();
  vib();
  if(key.dataset.key === 'del') pinDel();
  else pinInput(key.dataset.key);
});
function pinInput(d){
  if(pinValue.length>=4) return;
  pinValue += d;
  updatePinDots();
  if(pinValue.length===4) setTimeout(checkPin, 120);
}
function pinDel(){
  pinValue = pinValue.slice(0,-1);
  updatePinDots();
  document.getElementById('pin-error').textContent='';
}
function updatePinDots(){
  for(let i=0;i<4;i++){
    const d = document.getElementById('d'+i);
    d.classList.remove('filled','error');
    if(i<pinValue.length) d.classList.add('filled');
  }
}
function checkPin(){
  if(pinValue === CORRECT_PIN()){
    vib(20);
    document.getElementById('pin-screen').style.display='none';
    document.getElementById('app').style.display='flex';
    init();
  } else {
    vib(60);
    for(let i=0;i<4;i++) document.getElementById('d'+i).classList.replace('filled','error');
    document.getElementById('pin-error').textContent='PIN incorreto. Tente novamente.';
    setTimeout(()=>{
      pinValue='';
      updatePinDots();
      document.getElementById('pin-error').textContent='';
    }, 900);
  }
}

// ===================== API =====================
async function sbFetch(path, opts={}){
  if(!await ensureValidSession()) throw new Error('Sessão expirada');
  const request=()=>fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    ...opts,
    headers:{
      'apikey':SUPABASE_KEY,'Authorization':`Bearer ${session.access_token}`,
      'Content-Type':'application/json','Prefer':'return=representation',
      ...(opts.headers||{})
    }
  });
  let res=await request();
  if(res.status===401&&await refreshSession())res=await request();
  if(!res.ok){ const e=await res.text(); throw new Error(e); }
  const t=await res.text(); return t?JSON.parse(t):null;
}
const api={
  getSubscription:()=>sbFetch('subscriptions?select=*&limit=1').then(rows=>rows?.[0]||null),
  getCategories:()=>sbFetch('categories?order=position.asc'),
  insertCategory:(d)=>sbFetch('categories',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateCategory:(id,d)=>sbFetch(`categories?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteCategory:(id)=>sbFetch(`categories?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getMonths:()=>sbFetch('months?order=key.desc'),
  insertMonth:(d)=>sbFetch('months',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  closeMonth:(key)=>sbFetch(`months?key=eq.${key}`,{method:'PATCH',body:JSON.stringify({closed:true})}),
  getExpenses:(mk)=>sbFetch(`expenses?month_key=eq.${mk}&order=date.desc`),
  getAllExpenses:()=>sbFetch('expenses?order=date.desc'),
  getExpenseNames:()=>sbFetch('expenses?select=name&order=date.desc'),
  insertExpense:(d)=>sbFetch('expenses',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateExpense:(id,d)=>sbFetch(`expenses?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteExpense:(id)=>sbFetch(`expenses?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  setMonthBudgets:(key,budgets)=>sbFetch(`months?key=eq.${key}`,{method:'PATCH',body:JSON.stringify({budgets})}),
  getSplitGroups:()=>sbFetch('split_groups?order=id.desc'),
  insertSplitGroup:(name)=>sbFetch('split_groups',{method:'POST',body:JSON.stringify({name,created_by:currentUser.id})}),
  getSplitMembers:(groupId)=>sbFetch(`split_members?group_id=eq.${groupId}`),
  insertSplitMembers:(rows)=>sbFetch('split_members',{method:'POST',body:JSON.stringify(rows)}),
  getSplitExpenses:(groupId)=>sbFetch(`split_expenses?group_id=eq.${groupId}&order=id.desc`),
  insertSplitExpense:(row)=>sbFetch('split_expenses',{method:'POST',body:JSON.stringify(row)}),
  getSplitShares:(expenseIds)=>expenseIds.length?sbFetch(`split_shares?expense_id=in.(${expenseIds.join(',')})`):Promise.resolve([]),
  insertSplitShares:(rows)=>sbFetch('split_shares',{method:'POST',body:JSON.stringify(rows)}),
  settleSplitShare:(id,settled)=>sbFetch(`split_shares?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({is_settled:settled,settled_at:settled?new Date().toISOString():null})}),
  getCategoryShares:(catId)=>sbFetch(`category_shares?category_id=eq.${catId}&order=id.desc`),
  getPendingShares:()=>sbFetch(`category_shares?shared_with_email=ilike.${encodeURIComponent(currentUser.email)}&status=eq.pending`),
  insertCategoryShare:(data)=>sbFetch('category_shares',{method:'POST',body:JSON.stringify({...data,shared_by_user_id:currentUser.id})}),
  updateCategoryShare:(id,data)=>sbFetch(`category_shares?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(data)}),
  deleteCategoryShare:(id)=>sbFetch(`category_shares?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getAdminGrant:()=>sbFetch(`admin_grants?email=ilike.${encodeURIComponent(currentUser.email)}&limit=1`),
  insertAdminGrant:(email,plan)=>sbFetch('admin_grants',{method:'POST',body:JSON.stringify({email:email.toLowerCase(),plan,granted_by:currentUser.id})}),
  deleteAdminGrant:(id)=>sbFetch(`admin_grants?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  listAdminGrants:()=>sbFetch('admin_grants?order=id.desc'),
};

// ===================== STATE =====================
let categories=[], months=[], currentMonthKey='', viewMonthKey='', expenses=[], currentTab='home', currentCatIdx=0;
let subscription=null, userPlan='free';
let splitGroups=[], pendingShares=[];
function resolveUserPlan(sub, now=new Date()){
  if(!sub) return 'free';
  if(sub.billing_cycle==='lifetime') return 'pro';
  if(sub.subscription_status==='trialing'&&new Date(sub.trial_ends_at)>now) return 'pro';
  if(sub.subscription_status==='active'&&sub.current_period_end&&new Date(sub.current_period_end)>now) return 'pro';
  return 'free';
}
function isPro(){ return userPlan==='pro'; }
function trialDaysRemaining(){
  if(subscription?.subscription_status!=='trialing') return 0;
  return Math.max(0,Math.ceil((new Date(subscription.trial_ends_at)-new Date())/86400000));
}
function openPaywall(context='este recurso'){
  const price=p=>p.price==null?'Preço em breve':brl(p.price);
  openModal(`<div class="modal-title">Desbloqueie o GastoCerto Pro</div>
    <p class="modal-note">${escapeHtml(context)} faz parte do Pro. Seus dados permanecem salvos mesmo no plano gratuito.</p>
    ${Object.entries(CONFIG.PLANS).map(([key,p])=>`<div class="plan-card ${key==='annual'?'featured':''}"><div><div class="plan-name">${escapeHtml(p.label)}</div><div class="plan-price">${price(p)}</div></div>${key==='annual'?'<span class="plan-tag">MELHOR OPÇÃO</span>':''}</div>`).join('')}
    <p class="modal-note">A cobrança ainda não está habilitada. Os valores e o Pix Automático serão conectados em uma etapa posterior.</p>
    <button class="btn-secondary" onclick="_closeModal()">Agora não</button>`);
}
function lockedCard(title,copy){
  return `<div class="locked-card"><div class="locked-icon"><i class="fa-solid fa-lock" aria-hidden="true"></i></div><div class="locked-title">${escapeHtml(title)}</div><div class="locked-copy">${escapeHtml(copy)}</div><button onclick="openPaywall('${escapeHtml(title)}')">Conhecer o Pro</button></div>`;
}
const uid=()=>Math.random().toString(36).slice(2,9);
const monthKeyOf=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const monthLabel=key=>{ if(!key)return''; const[y,m]=key.split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]} ${y}`; };
const nextMonthKey=key=>{ const[y,m]=key.split('-').map(Number); return monthKeyOf(new Date(y,m,1)); };
const prevMonthKey=key=>{ const[y,m]=key.split('-').map(Number); return monthKeyOf(new Date(y,m-2,1)); };
const brl=v=>`R$ ${parseFloat(v).toFixed(2).replace('.',',')}`;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function effBudget(cat, monthKey){
  const m=months.find(x=>x.key===monthKey);
  const ov=m&&m.budgets?m.budgets[cat.id]:null;
  return (ov!=null&&!isNaN(parseFloat(ov)))?parseFloat(ov):parseFloat(cat.budget);
}
function hasOverride(cat, monthKey){
  const m=months.find(x=>x.key===monthKey);
  return !!(m&&m.budgets&&m.budgets[cat.id]!=null);
}

let expenseNames=[], acResults=[];

// ===================== CACHE LOCAL =====================
function saveCache(){
  try{ localStorage.setItem(`${CACHE_PREFIX}:${currentUser.id}`, JSON.stringify({categories,months,expenses,currentMonthKey,expenseNames,ts:Date.now()})); }catch{}
}

function showWelcomeTrial(){
  openModal(`<div class="modal-title"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Bem-vindo ao GastoCerto!</div>
    <p class="modal-note">Pelos próximos 14 dias você tem acesso completo: categorias ilimitadas, gráficos e comparativos.</p>
    <p class="modal-note">Depois disso sua conta passa para o plano gratuito. <strong>Seus dados continuam salvos.</strong> Não pedimos cartão e você não será cobrado automaticamente.</p>
    <button class="btn-primary" onclick="_closeModal()">Começar</button>`);
}

function openAccountModal(){
  const email=escapeHtml(currentUser?.email||'');
  const isAdmin=currentUser?.email==='2rafab@gmail.com';
  openModal(`<div class="modal-title">Sua conta</div>
    <p class="modal-note">Conectado como <strong>${email}</strong><br>Plano: <strong>${isPro()?'Pro':'Gratuito'}</strong></p>
    <button class="btn-primary" onclick="openPaywall('Planos e assinatura')">Ver planos</button>
    <button class="btn-secondary" onclick="_closeModal();showTutorial(true)"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Ver tutorial</button>
    ${isAdmin?`<button class="btn-secondary" style="border-color:var(--accent);color:var(--accent)" onclick="openAdminPanel()"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Painel Admin</button>`:''}
    <button class="btn-secondary" onclick="logout()">Sair da conta</button>`);
}

// ===================== ADMIN PANEL =====================
function openAdminPanel(){
  if(currentUser?.email!=='2rafab@gmail.com') return;
  openModal(`<div class="modal-title"><i class="fa-solid fa-shield-halved" style="color:var(--accent)" aria-hidden="true"></i> Painel Admin</div>
    <p class="modal-note">Conceder acesso Pro a um usuário pelo e-mail (sem billing).</p>
    <div class="form-group"><label class="form-label">E-mail do usuário</label>
      <input class="form-input" id="f-admin-email" type="email" placeholder="usuario@email.com"/></div>
    <div class="form-group"><label class="form-label">Tipo de plano</label>
      <select class="form-input" id="f-admin-plan">
        <option value="monthly">Mensal</option>
        <option value="lifetime">Vitalício</option>
      </select></div>
    <button class="btn-primary" id="btn-admin-grant" onclick="grantPro()">Conceder Pro</button>
    <button class="btn-secondary" onclick="openAdminList()">Ver concessões ativas</button>
    <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`);
}
async function grantPro(){
  const email=(document.getElementById('f-admin-email').value||'').trim().toLowerCase();
  const plan=document.getElementById('f-admin-plan').value;
  if(!email||!/^\S+@\S+\.\S+$/.test(email)){showToast('E-mail inválido.','error');return;}
  const btn=document.getElementById('btn-admin-grant');btn.disabled=true;btn.textContent='Concedendo...';
  try{
    await api.insertAdminGrant(email,plan);
    showToast(`Pro concedido para ${email}!`,'success');
    document.getElementById('f-admin-email').value='';
  }catch(err){
    const msg=String(err?.message||'');
    if(/relation.*does not exist|42P01/i.test(msg)||msg.includes('admin_grants')){
      openModal(`<div class="modal-title">Tabela não encontrada</div>
        <p class="modal-note">A tabela <code>admin_grants</code> ainda não existe no Supabase. Rode o SQL abaixo no SQL Editor do painel:</p>
        <pre style="background:var(--surface2);border-radius:10px;padding:14px;font-size:11px;overflow-x:auto;line-height:1.6;white-space:pre-wrap;color:var(--accent)">CREATE TABLE admin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  plan text NOT NULL DEFAULT 'monthly',
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE admin_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_insert" ON admin_grants FOR INSERT WITH CHECK (auth.jwt()->>'email' = '2rafab@gmail.com');
CREATE POLICY "admin_all" ON admin_grants FOR ALL USING (auth.jwt()->>'email' = '2rafab@gmail.com');
CREATE POLICY "user_read_own" ON admin_grants FOR SELECT USING (email = auth.jwt()->>'email');</pre>
        <button class="btn-primary" onclick="openAdminPanel()">Tentar novamente</button>
        <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`);
    }else{
      showToast('Erro: '+msg.slice(0,80),'error');
    }
  }
  btn.disabled=false;btn.textContent='Conceder Pro';
}
async function openAdminList(){
  openModal(`<div class="modal-title">Concessões Pro ativas</div><div class="loading"><div class="spinner"></div></div>`);
  try{
    const grants=await api.listAdminGrants();
    const planLabel={monthly:'Mensal',lifetime:'Vitalício'};
    let html=`<div class="modal-title">Concessões Pro ativas</div>`;
    if(!grants||!grants.length) html+=`<p class="modal-note">Nenhuma concessão ainda.</p>`;
    else html+=grants.map(g=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
      <div><div style="font-size:14px;font-weight:500">${escapeHtml(g.email)}</div>
      <div style="font-size:12px;color:var(--text3)">${planLabel[g.plan]||g.plan}</div></div>
      <div class="icon-btn" style="border-color:#ff4f4f44;color:var(--red)" onclick="revokeGrant('${g.id}')"><i class="fa-solid fa-trash" aria-hidden="true"></i></div>
    </div>`).join('');
    html+=`<button class="btn-primary" style="margin-top:16px" onclick="openAdminPanel()">Nova concessão</button>
      <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
    document.getElementById('modal-content').innerHTML=html;
  }catch{document.getElementById('modal-content').innerHTML=`<div class="modal-title">Concessões</div><p class="modal-note">Erro ao carregar.</p><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;}
}
async function revokeGrant(id){
  if(!confirm('Revogar este acesso Pro?'))return;
  try{await api.deleteAdminGrant(id);showToast('Acesso revogado.','success');openAdminList();}
  catch{showToast('Erro ao revogar.','error');}
}

function loadCache(){
  try{
    const raw=localStorage.getItem(`${CACHE_PREFIX}:${currentUser.id}`);
    if(!raw) return false;
    const c=JSON.parse(raw);
    if(!c.categories||!c.months) return false;
    categories=c.categories; months=c.months; expenses=c.expenses||[];
    expenseNames=c.expenseNames||[];
    currentMonthKey=c.currentMonthKey; viewMonthKey=c.currentMonthKey;
    return true;
  }catch{ return false; }
}

// ===================== INIT =====================
async function init(){
  const hadCache = loadCache();
  if(hadCache){
    render();
    document.getElementById('current-month-label').insertAdjacentHTML('afterend','<span class="sync-dot" id="sync-dot"></span>');
  }
  try{
    const [cats, mons, sub, adminGrants] = await Promise.all([api.getCategories(), api.getMonths(), api.getSubscription(), api.getAdminGrant().catch(()=>[])]);
    categories=cats; months=mons; subscription=sub; userPlan=resolveUserPlan(sub);
    if(userPlan==='free'&&adminGrants?.length>0) userPlan='pro';
    const trialDays=sub?.subscription_status==='trialing'?Math.max(0,Math.ceil((new Date(sub.trial_ends_at)-new Date())/86400000)):0;
    document.getElementById('account-btn').textContent=isPro()?(trialDays?`Pro · ${trialDays}d`:'Pro'):'Grátis';
    const now=monthKeyOf(new Date());
    if(!months.find(m=>m.key===now)){ await api.insertMonth({key:now,closed:false}); months=await api.getMonths(); }
    currentMonthKey=now;
    const prevKey=prevMonthKey(now);
    const prevMon=months.find(m=>m.key===prevKey);
    if(prevMon&&!prevMon.closed) api.closeMonth(prevKey).then(()=>{if(prevMon)prevMon.closed=true;}).catch(()=>{});
    if(!hadCache || !months.find(m=>m.key===viewMonthKey)) viewMonthKey=now;
    expenses=await api.getExpenses(viewMonthKey);
    saveCache();
    document.getElementById('sync-dot')?.remove();
    render();
    setTimeout(()=>showTutorial(),600);
    api.getExpenseNames().then(rows=>{
      const freq={};
      (rows||[]).forEach(r=>{const n=(r.name||'').trim(); if(n) freq[n]=(freq[n]||0)+1;});
      expenseNames=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);
      saveCache();
    }).catch(()=>{});
    autoCreateRecurring();
    loadPendingShares();
  }catch(e){
    document.getElementById('sync-dot')?.remove();
    if(!hadCache){
      document.getElementById('content').innerHTML=`<div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Erro ao conectar.<br><small>${e.message}</small></div></div>`;
    } else {
      showToast('Sem conexão — exibindo dados locais.','error');
    }
  }
}

// ===================== BADGES =====================
function badgeHtml(diff){
  if(Math.abs(diff)<0.005) return `<span class="badge ok"><i class="fa-solid fa-check"></i> Na meta</span>`;
  if(diff>0) return `<span class="badge saved">▼ Economizou ${brl(diff)}</span>`;
  return `<span class="badge over">▲ Estourou ${brl(Math.abs(diff))}</span>`;
}

// ===================== COMPARTILHAR CATEGORIA (imagem) =====================
const canvasBlob=canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png',.95));
async function shareCategory(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const items=expenses.filter(e=>e.cat_id===catId).sort((a,b)=>b.date.localeCompare(a.date));
  const spent=items.reduce((s,e)=>s+parseFloat(e.value),0),budget=effBudget(cat,viewMonthKey),diff=budget-spent;
  const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1920;
  const c=canvas.getContext('2d'); c.fillStyle='#0f0f0f';c.fillRect(0,0,1080,1920);c.fillStyle='#c8f04a';c.fillRect(0,0,18,1920);
  c.fillStyle='#f0f0f0';c.font='700 72px serif';c.fillText(cat.name,80,150);c.fillStyle='#888';c.font='34px sans-serif';c.fillText(monthLabel(viewMonthKey),80,210);
  c.fillStyle='#1a1a1a';c.beginPath();c.roundRect(70,270,940,290,32);c.fill();c.fillStyle='#888';c.font='28px sans-serif';c.fillText('TOTAL GASTO',110,340);
  c.fillStyle='#f0f0f0';c.font='700 64px sans-serif';c.fillText(brl(spent),110,425);c.fillStyle=diff>=0?'#c8f04a':'#ff4f4f';c.font='600 28px sans-serif';c.fillText(diff>=0?`Dentro do orçamento · ${brl(diff)} livres`:`Orçamento excedido · ${brl(Math.abs(diff))}`,110,495);
  c.fillStyle='#2a2a2a';c.fillRect(110,520,860,10);c.fillStyle=diff>=0?'#c8f04a':'#ff4f4f';c.fillRect(110,520,budget?Math.min(860,860*spent/budget):0,10);
  c.fillStyle='#888';c.font='600 27px sans-serif';c.fillText('LANÇAMENTOS',80,650);let y=730;
  for(const item of items.slice(0,12)){c.fillStyle='#f0f0f0';c.font='500 31px sans-serif';c.fillText(String(item.name).slice(0,32),80,y);c.textAlign='right';c.font='600 31px sans-serif';c.fillText(brl(item.value),990,y);c.textAlign='left';c.fillStyle='#555';c.font='24px sans-serif';c.fillText(new Date(item.date+'T12:00').toLocaleDateString('pt-BR'),80,y+42);c.fillRect(80,y+75,910,2);y+=105;}
  if(!items.length){c.fillStyle='#888';c.font='30px sans-serif';c.fillText('Nenhum lançamento neste período.',80,y);}
  if(items.length>12){c.fillStyle='#888';c.font='28px sans-serif';c.fillText(`+ ${items.length-12} lançamentos`,80,y);}
  c.fillStyle='#c8f04a';c.font='700 42px serif';c.fillText('GastoCerto',80,1810);c.fillStyle='#888';c.font='25px sans-serif';c.fillText('Controle seu dinheiro. Acerte seus planos.',80,1855);
  const blob=await canvasBlob(canvas);if(!blob){showToast('Não foi possível gerar a imagem.','error');return;}
  const safe=cat.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-'),file=new File([blob],`gastocerto-${safe}.png`,{type:'image/png'});
  try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:`${cat.name} · GastoCerto`,files:[file]});return;}}catch(err){if(err.name==='AbortError')return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Imagem salva!','success');
}

// ===================== RECORRENTES =====================
async function autoCreateRecurring(){
  try{
    const prevKey=prevMonthKey(currentMonthKey);
    const [prevExps,curExps]=await Promise.all([api.getExpenses(prevKey),api.getExpenses(currentMonthKey)]);
    const recurringPrev=prevExps.filter(e=>e.recurring);
    if(!recurringPrev.length) return;
    let created=false;
    for(const exp of recurringPrev){
      const already=curExps.some(e=>e.recurring&&e.cat_id===exp.cat_id&&e.name===exp.name);
      if(already) continue;
      await api.insertExpense({id:uid(),cat_id:exp.cat_id,month_key:currentMonthKey,name:exp.name,value:exp.value,date:`${currentMonthKey}-01`,recurring:true});
      created=true;
    }
    if(created){expenses=await api.getExpenses(viewMonthKey);saveCache();render();showToast('Lançamentos recorrentes adicionados.','success');}
  }catch{}
}

// ===================== COMPARTILHAMENTO ENTRE USUÁRIOS =====================
function openShareCategory(catId){
  const cat=categories.find(c=>c.id===catId);if(!cat)return;
  openModal(`<div class="modal-title">Compartilhar ${escapeHtml(cat.name)}</div>
    <p class="modal-note">O convidado verá uma notificação no app e poderá aceitar ou recusar. Nenhum e-mail é enviado.</p>
    <div class="form-group"><label class="form-label">E-mail do convidado</label>
      <input class="form-input" id="f-share-email" type="email" placeholder="amigo@email.com" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Permissão</label>
      <select class="form-input" id="f-share-perm">
        <option value="view">Visualizar — pode ver os gastos</option>
        <option value="edit">Editar — pode ver e adicionar gastos</option>
      </select></div>
    <button class="btn-primary" id="btn-share-cat" onclick="saveShareCategory('${catId}')">Enviar convite</button>
    <button class="btn-secondary" onclick="openManageShares('${catId}')">Ver compartilhamentos atuais</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveShareCategory(catId){
  const cat=categories.find(c=>c.id===catId);if(!cat)return;
  const email=(document.getElementById('f-share-email').value||'').trim().toLowerCase();
  const permission=document.getElementById('f-share-perm').value;
  if(!email||!/^\S+@\S+\.\S+$/.test(email)){showToast('Informe um e-mail válido.','error');return;}
  if(email===currentUser.email.toLowerCase()){showToast('Você não pode compartilhar com você mesmo.','error');return;}
  const btn=document.getElementById('btn-share-cat');btn.disabled=true;btn.textContent='Enviando...';
  try{
    await api.insertCategoryShare({category_id:catId,category_name:cat.name,shared_with_email:email,permission});
    showToast('Convite enviado!','success');_closeModal();
  }catch{showToast('Erro ao compartilhar. Verifique se a tabela category_shares existe no Supabase.','error');btn.disabled=false;btn.textContent='Enviar convite';}
}

async function openManageShares(catId){
  const cat=categories.find(c=>c.id===catId);
  openModal(`<div class="modal-title">Compartilhamentos</div><div class="loading"><div class="spinner"></div></div>`);
  try{
    const shares=await api.getCategoryShares(catId);
    const statusLabel={pending:'Aguardando',accepted:'Aceito',declined:'Recusado'};
    const permLabel={view:'Visualizar',edit:'Editar'};
    let html=`<div class="modal-title">Compartilhamentos · ${escapeHtml(cat?.name||'')}</div>`;
    if(!shares||!shares.length){
      html+=`<p class="modal-note">Esta categoria ainda não foi compartilhada com ninguém.</p>`;
    }else{
      html+=shares.map(s=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:14px;font-weight:500">${escapeHtml(s.shared_with_email)}</div>
          <div style="font-size:12px;color:var(--text3)">${permLabel[s.permission]||s.permission} · ${statusLabel[s.status]||s.status}</div>
        </div>
        <div class="icon-btn" style="border-color:#ff4f4f44;color:var(--red)" onclick="removeShare('${s.id}','${catId}')"><i class="fa-solid fa-trash" aria-hidden="true"></i></div>
      </div>`).join('');
    }
    html+=`<button class="btn-primary" style="margin-top:16px" onclick="openShareCategory('${catId}')">Adicionar compartilhamento</button>
      <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
    document.getElementById('modal-content').innerHTML=html;
  }catch{
    document.getElementById('modal-content').innerHTML=`<div class="modal-title">Compartilhamentos</div><p class="modal-note">Erro ao carregar. Verifique se a tabela category_shares existe.</p><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
  }
}

async function removeShare(shareId,catId){
  if(!confirm('Remover este compartilhamento?'))return;
  try{await api.deleteCategoryShare(shareId);showToast('Compartilhamento removido.','success');openManageShares(catId);}
  catch{showToast('Erro ao remover.','error');}
}

async function respondToShare(shareId,accept){
  const share=pendingShares.find(s=>s.id===shareId);
  try{
    await api.updateCategoryShare(shareId,{status:accept?'accepted':'declined',shared_with_user_id:accept?currentUser.id:null});
    pendingShares=pendingShares.filter(s=>s.id!==shareId);
    if(accept){
      categories=await api.getCategories();
      saveCache();
      showToast(`"${share?.category_name||'Categoria'}" agora visível no seu app!`,'success');
    }else{
      showToast('Convite recusado.','');
    }
    render();
  }catch{showToast('Erro ao responder ao convite.','error');}
}

async function loadPendingShares(){
  try{
    const shares=await api.getPendingShares();
    pendingShares=shares||[];
    if(pendingShares.length>0&&currentTab==='home') render();
  }catch{}
}

// ===================== RENDER =====================
function render(){
  document.getElementById('current-month-label').textContent=monthLabel(viewMonthKey);
  const isNow=viewMonthKey===currentMonthKey;
  document.getElementById('fab').style.display=(currentTab==='home'||currentTab==='categorias')?'flex':'none';
  const el=document.getElementById('content');
  if(currentTab==='home') renderHome(el);
  else if(currentTab==='categorias') renderCategorias(el);
  else if(currentTab==='historico') renderHistorico(el);
  else renderSplit(el);
}

// ===== HOME (carousel) =====
function renderHome(el){
  const isNow=viewMonthKey===currentMonthKey;
  const mdata=months.find(m=>m.key===viewMonthKey);

  const pendingSharesHtml=pendingShares.length>0?`<div style="padding:8px 20px 0;display:flex;flex-direction:column;gap:8px">${pendingShares.map(s=>`<div class="share-notification"><div style="font-weight:600;font-size:13px;margin-bottom:3px"><i class="fa-solid fa-share-nodes" style="margin-right:6px;color:var(--accent)" aria-hidden="true"></i>Convite de categoria</div><div style="font-size:12px;color:var(--text2);margin-bottom:10px">Você recebeu acesso à categoria <strong>${escapeHtml(s.category_name||'desconhecida')}</strong></div><div style="display:flex;gap:8px"><button onclick="respondToShare('${s.id}',true)" style="flex:1;padding:8px;border-radius:8px;border:none;background:var(--accent);color:#0f0f0f;font:700 12px 'DM Sans',sans-serif;cursor:pointer">Aceitar</button><button onclick="respondToShare('${s.id}',false)" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text2);font:500 12px 'DM Sans',sans-serif;cursor:pointer">Recusar</button></div></div>`).join('')}</div>`:'';

  if(categories.length===0){
    el.innerHTML=`<div style="padding:16px 20px">${pendingSharesHtml}<div class="empty"><div class="empty-icon"><i class="fa-regular fa-folder-open"></i></div><div class="empty-text">Nenhuma categoria ainda.<br><small style="color:var(--text3)">Vá em Categorias para criar a primeira.</small></div></div></div>`;
    return;
  }
  if(currentCatIdx>=categories.length) currentCatIdx=0;

  const days=trialDaysRemaining();
  const trialBannerHtml=days>0&&days<=3?`<div style="padding:8px 20px 0"><div class="trial-banner" style="margin:0"><span>Seu acesso completo termina em <strong>${days} ${days===1?'dia':'dias'}</strong>.</span><button onclick="openPaywall('Continue com seus relatórios')">Ver Pro</button></div></div>`:'';

  const slidesHtml = categories.map((cat,i)=>buildSlide(cat,isNow)).join('');
  const dotsHtml = categories.map((_,i)=>`<div class="cdot${i===currentCatIdx?' active':''}" onclick="goToSlide(${i})"></div>`).join('');

  el.innerHTML=`<div id="home-content" style="display:flex;flex-direction:column;height:100%">
    ${pendingSharesHtml}
    ${trialBannerHtml}
    <div class="cat-nav" style="padding-top:10px">
      <div class="cat-nav-btn${currentCatIdx===0?' disabled':''}" onclick="goToSlide(${currentCatIdx-1})">‹</div>
      <div class="cat-nav-name">${categories[currentCatIdx].name}</div>
      <div class="cat-nav-btn${currentCatIdx===categories.length-1?' disabled':''}" onclick="goToSlide(${currentCatIdx+1})">›</div>
    </div>
    <div class="carousel-dots">${dotsHtml}</div>
    <div class="cat-carousel-wrap" id="carousel-wrap">
      <div class="cat-carousel" id="cat-carousel" style="transform:translateX(-${currentCatIdx*100}%)">
        ${slidesHtml}
      </div>
    </div>
  </div>`;

  setupSwipe();
}

function buildSlide(cat, isNow){
  const catExps=expenses.filter(e=>e.cat_id===cat.id);
  const spent=catExps.reduce((s,e)=>s+parseFloat(e.value),0);
  const budget=effBudget(cat,viewMonthKey);
  const overridden=hasOverride(cat,viewMonthKey);
  const available=budget-spent;
  const pct=budget>0?Math.min((spent/budget)*100,100):0;
  const isOver=available<0, isWarn=!isOver&&pct>75;
  const today=new Date(), dom=today.getDate();
  let forecast='';
  if(isNow&&spent>0&&dom>0){
    const dr=spent/dom;
    if(dr>0&&!isOver){
      const end=new Date(today); end.setDate(dom+Math.floor(available/dr));
      forecast=`Nesse ritmo, o saldo acaba em <strong>${end.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</strong>`;
    } else if(isOver) forecast=`Orçamento estourado em <strong>${brl(Math.abs(available))}</strong>`;
  }
  const expHtml=catExps.map(e=>`<div class="expense-item">
    <div class="expense-left">
      <div class="expense-name">${e.recurring?`<i class="fa-solid fa-arrows-rotate" style="font-size:10px;color:var(--accent);margin-right:5px" title="Recorrente" aria-hidden="true"></i>`:''}${escapeHtml(e.name)}</div>
      <div class="expense-date">${new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
    </div>
    <div class="expense-right">
      <div class="expense-value">${brl(e.value)}</div>
      <div class="expense-actions">
        <div class="exp-btn" onclick="openEditExpense('${e.id}')"><i class="fa-solid fa-pen" aria-label="Editar"></i></div>
        <div class="exp-btn" style="border-color:#ff4f4f44;color:var(--red)" onclick="confirmDeleteExpense('${e.id}')"><i class="fa-solid fa-trash" aria-label="Excluir"></i></div>
      </div>
    </div>
  </div>`).join('');

  const isOwned=cat.user_id===currentUser.id;
  const sharedWith=!isOwned;

  const overrideLink=isNow&&isOwned?`<button class="mini-link${overridden?' adjusted':''}" onclick="openMonthOverride('${cat.id}')">
    <i class="fa-solid fa-pen" aria-hidden="true"></i>
    ${overridden?`Orçamento ajustado este mês · editar`:`Ajustar orçamento só deste mês`}
  </button>`:'';

  const sharedBadge=sharedWith?`<div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--accent);background:#c8f04a18;border:1px solid #c8f04a44;border-radius:100px;padding:3px 10px;margin-bottom:10px"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Compartilhada com você</div>`:'';

  return `<div class="cat-slide">
    <div class="cat-card ${isOver?'over-budget':isWarn?'warning':''}">
      ${sharedBadge}
      <div class="cat-values">
        <div class="val-block"><div class="val-label">Orçamento${overridden?' *':''}</div><div class="val-num budget">${brl(budget)}</div></div>
        <div class="val-block"><div class="val-label">Gasto</div><div class="val-num spent">${brl(spent)}</div></div>
        <div class="val-block" style="grid-column:1/-1"><div class="val-label">Disponível</div><div class="val-num ${available>=0?'positive':'negative'}">${brl(available)}</div></div>
      </div>
      <div class="progress-bar"><div class="progress-fill ${isOver?'danger':isWarn?'warning':''}" style="width:${pct}%"></div></div>
      ${forecast?`<div class="forecast">${forecast}</div>`:''}
      ${overrideLink}
      ${expHtml}
      <button class="add-expense-btn" onclick="openAddExpense('${cat.id}')">
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        Adicionar gasto
      </button>
      ${isOwned?`<button class="share-user-btn" onclick="openShareCategory('${cat.id}')">
        <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
        Compartilhar categoria
      </button>
      <button class="export-category-btn" onclick="shareCategory('${cat.id}')">
        <i class="fa-solid fa-share-from-square" aria-hidden="true"></i>
        Exportar como imagem
      </button>`:''}
    </div>
  </div>`;
}

function closeMonthBtnHtml(){
  return `<button class="close-month-btn" onclick="openCloseMonth()">
    <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
    Fechar Mês e Abrir Próximo
  </button>`;
}

function goToSlide(i){
  if(i<0||i>=categories.length) return;
  vib(5);
  currentCatIdx=i;
  const carousel=document.getElementById('cat-carousel');
  if(carousel) carousel.style.transform=`translateX(-${i*100}%)`;
  document.querySelectorAll('.cdot').forEach((d,j)=>d.classList.toggle('active',j===i));
  const nameEl=document.querySelector('.cat-nav-name');
  if(nameEl) nameEl.textContent=categories[i].name;
  document.querySelectorAll('.cat-nav-btn').forEach((btn,j)=>{
    btn.classList.toggle('disabled', j===0?i===0:i===categories.length-1);
    btn.onclick=j===0?()=>goToSlide(i-1):()=>goToSlide(i+1);
  });
}

function setupSwipe(){
  const wrap=document.getElementById('carousel-wrap');
  if(!wrap) return;
  let startX=0,startY=0,dragging=false,locked=false;
  wrap.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;dragging=true;locked=false},{passive:true});
  wrap.addEventListener('touchmove',e=>{
    if(!dragging) return;
    const dx=e.touches[0].clientX-startX, dy=e.touches[0].clientY-startY;
    if(!locked){ if(Math.abs(dx)>Math.abs(dy)){locked='h';} else {locked='v';dragging=false;} }
    if(locked==='h') e.preventDefault();
  },{passive:false});
  wrap.addEventListener('touchend',e=>{
    if(!dragging) return; dragging=false;
    const dx=e.changedTouches[0].clientX-startX;
    if(Math.abs(dx)>40){ if(dx<0) goToSlide(currentCatIdx+1); else goToSlide(currentCatIdx-1); }
  });
}

// ===== CATEGORIAS (drag & drop) =====
function renderCategorias(el){
  if(categories.length===0){
    el.innerHTML=`<div class="cat-list"><div class="empty"><div class="empty-icon"><i class="fa-regular fa-folder-open"></i></div><div class="empty-text">Nenhuma categoria ainda.</div></div></div>`;
    return;
  }
  el.innerHTML=`<div class="cat-list" id="cat-list">
    ${categories.map(cat=>`
    <div class="cat-manage-item" draggable="true" data-id="${cat.id}" id="cmi-${cat.id}">
      <div class="drag-handle" title="Arrastar">⠿</div>
      <div class="cat-manage-info">
        <div class="cat-manage-name">${cat.name}</div>
        <div class="cat-manage-budget">${brl(cat.budget)}/mês</div>
      </div>
      <div style="display:flex;gap:8px">
        <div class="icon-btn" onclick="openEditCategory('${cat.id}')"><i class="fa-solid fa-pen" aria-label="Editar"></i></div>
        <div class="icon-btn" style="border-color:#ff4f4f44;color:var(--red)" onclick="confirmDeleteCategory('${cat.id}')"><i class="fa-solid fa-trash" aria-label="Excluir"></i></div>
      </div>
    </div>`).join('')}
  </div>`;
  setupDragDrop();
}

function setupDragDrop(){
  const list=document.getElementById('cat-list');
  if(!list) return;
  let dragSrc=null;

  list.querySelectorAll('.cat-manage-item').forEach(item=>{
    item.addEventListener('dragstart',e=>{
      dragSrc=item; item.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
    });
    item.addEventListener('dragend',()=>{ item.classList.remove('dragging'); list.querySelectorAll('.cat-manage-item').forEach(i=>i.classList.remove('drag-over')); });
    item.addEventListener('dragover',e=>{ e.preventDefault(); if(item!==dragSrc){ list.querySelectorAll('.cat-manage-item').forEach(i=>i.classList.remove('drag-over')); item.classList.add('drag-over'); } });
    item.addEventListener('drop',e=>{ e.preventDefault(); if(dragSrc&&item!==dragSrc){ reorderCats(dragSrc.dataset.id, item.dataset.id); } });
  });

  let touchItem=null, clone=null, touchOffY=0;
  list.querySelectorAll('.drag-handle').forEach(handle=>{
    handle.addEventListener('touchstart',e=>{
      vib();
      touchItem=handle.closest('.cat-manage-item');
      const r=touchItem.getBoundingClientRect();
      touchOffY=e.touches[0].clientY-r.top;
      clone=touchItem.cloneNode(true);
      clone.style.cssText=`position:fixed;left:${r.left}px;width:${r.width}px;top:${r.top}px;z-index:999;opacity:.85;pointer-events:none;background:var(--surface);border:1px solid var(--accent);border-radius:12px;`;
      document.body.appendChild(clone);
      touchItem.classList.add('dragging');
    },{passive:true});
    handle.addEventListener('touchmove',e=>{
      if(!clone) return;
      e.preventDefault();
      const y=e.touches[0].clientY-touchOffY;
      clone.style.top=y+'px';
      const els=[...list.querySelectorAll('.cat-manage-item:not(.dragging)')];
      list.querySelectorAll('.cat-manage-item').forEach(i=>i.classList.remove('drag-over'));
      const over=els.find(i=>{ const r=i.getBoundingClientRect(); return e.touches[0].clientY>r.top&&e.touches[0].clientY<r.bottom; });
      if(over) over.classList.add('drag-over');
    },{passive:false});
    handle.addEventListener('touchend',e=>{
      if(!clone) return;
      clone.remove(); clone=null;
      if(touchItem) touchItem.classList.remove('dragging');
      const over=list.querySelector('.cat-manage-item.drag-over');
      if(over&&touchItem&&over!==touchItem) reorderCats(touchItem.dataset.id, over.dataset.id);
      list.querySelectorAll('.cat-manage-item').forEach(i=>i.classList.remove('drag-over'));
      touchItem=null;
    });
  });
}

async function reorderCats(srcId, targetId){
  const srcIdx=categories.findIndex(c=>c.id===srcId);
  const tgtIdx=categories.findIndex(c=>c.id===targetId);
  if(srcIdx<0||tgtIdx<0) return;
  const moved=categories.splice(srcIdx,1)[0];
  categories.splice(tgtIdx,0,moved);
  try{
    await Promise.all(categories.map((c,i)=>api.updateCategory(c.id,{position:i})));
    saveCache();
    showToast('Ordem salva!','success');
  }catch{ showToast('Erro ao salvar ordem.','error'); }
  renderCategorias(document.getElementById('content'));
}

// ===== HISTORICO =====
function renderHistorico(el){
  if(!isPro()){
    const current=expenses.reduce((s,e)=>s+parseFloat(e.value),0);
    const totalBudget=categories.reduce((s,c)=>s+effBudget(c,currentMonthKey),0);
    const totalAvail=totalBudget-current;
    const totalPct=totalBudget>0?Math.min((current/totalBudget)*100,100):0;
    el.innerHTML=`<div style="padding:16px 20px calc(80px + var(--safe-bot))">
      <div class="month-title">${monthLabel(currentMonthKey)}</div>
      <div class="summary-card" style="margin:0 0 12px">
        <div class="summary-grid">
          <div class="summary-block"><div class="summary-label">Orçamento</div><div class="summary-num">${brl(totalBudget)}</div></div>
          <div class="summary-block"><div class="summary-label">Gasto</div><div class="summary-num" style="color:var(--text2)">${brl(current)}</div></div>
          <div class="summary-block"><div class="summary-label">Disponível</div><div class="summary-num ${totalAvail>=0?'positive':'negative'}">${brl(totalAvail)}</div></div>
        </div>
        <div class="progress-bar" style="margin-bottom:0"><div class="progress-fill ${totalAvail<0?'danger':totalPct>75?'warning':''}" style="width:${totalPct}%"></div></div>
      </div>
      ${lockedCard('Histórico e análises','Badges, gráficos e comparativos entre meses estão disponíveis no Pro.')}
    </div>`;
    return;
  }
  el.innerHTML=`<div style="padding:16px 20px calc(80px + var(--safe-bot))"><div class="loading"><div class="spinner"></div>Carregando...</div></div>`;
  renderHistoricoAsync(el);
}
async function renderHistoricoAsync(el){
  let allExps=[];
  try{ allExps=await api.getAllExpenses(); }
  catch{ el.innerHTML=`<div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Erro ao carregar histórico.</div></div>`; return; }

  const byMonth={};
  allExps.forEach(e=>{ (byMonth[e.month_key]=byMonth[e.month_key]||[]).push(e); });

  const budgetOf=mk=>categories.reduce((s,c)=>s+effBudget(c,mk),0);

  const chartMonths=months.filter(m=>byMonth[m.key]).slice(0,6).reverse();
  let chartHtml='';
  if(chartMonths.length>1){
    const totals=chartMonths.map(m=>byMonth[m.key].reduce((s,e)=>s+parseFloat(e.value),0));
    const max=Math.max(...totals, ...chartMonths.map(m=>budgetOf(m.key)), 1);
    chartHtml=`<div class="chart-card">
      <div class="chart-title">Gasto total por mês</div>
      <div class="chart-bars">
        ${chartMonths.map((m,i)=>{
          const h=Math.max((totals[i]/max)*100,4);
          const mb=budgetOf(m.key);
          const over=mb>0&&totals[i]>mb;
          return `<div class="chart-col">
            <div class="chart-val">${totals[i]>=1000?(totals[i]/1000).toFixed(1).replace('.',',')+'k':Math.round(totals[i])}</div>
            <div class="chart-bar${over?' over':''}" style="height:${h}%"></div>
            <div class="chart-label">${monthLabel(m.key).split(' ')[0]}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  const totalSpentSummary=expenses.reduce((s,e)=>s+parseFloat(e.value),0);
  const totalBudgetSummary=categories.reduce((s,c)=>s+effBudget(c,viewMonthKey),0);
  const totalAvailSummary=totalBudgetSummary-totalSpentSummary;
  const totalPctSummary=totalBudgetSummary>0?Math.min((totalSpentSummary/totalBudgetSummary)*100,100):0;
  const summaryHtml=`<div class="summary-card" style="margin:0 0 16px">
    <div class="summary-grid">
      <div class="summary-block"><div class="summary-label">Orçamento</div><div class="summary-num">${brl(totalBudgetSummary)}</div></div>
      <div class="summary-block"><div class="summary-label">Gasto</div><div class="summary-num" style="color:var(--text2)">${brl(totalSpentSummary)}</div></div>
      <div class="summary-block"><div class="summary-label">Disponível</div><div class="summary-num ${totalAvailSummary>=0?'positive':'negative'}">${brl(totalAvailSummary)}</div></div>
    </div>
    <div class="progress-bar" style="margin-bottom:8px"><div class="progress-fill ${totalAvailSummary<0?'danger':totalPctSummary>75?'warning':''}" style="width:${totalPctSummary}%"></div></div>
    <button class="summary-btn" onclick="openConsolidado()">Ver consolidado do mês ›</button>
  </div>`;

  let html=summaryHtml+chartHtml;
  for(const month of months){
    const exps=byMonth[month.key];
    if(!exps||exps.length===0) continue;
    const monthSpent=exps.reduce((s,e)=>s+parseFloat(e.value),0);
    const monthDiff=budgetOf(month.key)-monthSpent;
    html+=`<div class="month-block">
      <div class="month-title">${monthLabel(month.key)}
        ${month.closed?'<span style="font-size:11px;color:var(--accent);font-family:DM Sans"><i class="fa-solid fa-check"></i> Fechado</span>':''}
        ${badgeHtml(monthDiff)}
      </div>`;
    categories.forEach(cat=>{
      const ce=exps.filter(e=>e.cat_id===cat.id);
      if(!ce.length) return;
      const spent=ce.reduce((s,e)=>s+parseFloat(e.value),0);
      const cb=effBudget(cat,month.key);
      const avail=cb-spent;
      html+=`<div class="hist-cat-item">
        <div class="hist-cat-name"><span>${cat.name}</span>${badgeHtml(avail)}</div>
        <div class="hist-row"><span>Orçamento</span><span>${brl(cb)}</span></div>
        <div class="hist-row"><span>Gasto</span><span>${brl(spent)}</span></div>
        <div class="hist-row"><span>Saldo</span><span style="color:${avail>=0?'var(--accent)':'var(--red)'}">${brl(avail)}</span></div>
        <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
          ${ce.map(e=>`<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);padding:3px 0">
            <span>${e.name} <span style="color:var(--text3)">${new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</span></span>
            <span style="color:var(--text)">${brl(e.value)}</span>
          </div>`).join('')}
        </div>
      </div>`;
    });
    html+=`</div>`;
  }
  el.innerHTML=`<div style="padding:16px 20px calc(80px + var(--safe-bot))">${html||'<div class="empty"><div class="empty-icon"><i class="fa-regular fa-calendar-xmark"></i></div><div class="empty-text">Nenhum gasto registrado ainda.</div></div>'}</div>`;
}

// ===================== DIVISÃO DE GASTOS =====================
async function renderSplit(el){
  el.innerHTML=`<div class="split-wrap"><div class="loading"><div class="spinner"></div>Carregando divisões...</div></div>`;
  try{splitGroups=await api.getSplitGroups();}
  catch(err){
    const msg=String(err?.message||'Erro desconhecido').slice(0,120);
    el.innerHTML=`<div class="split-wrap"><div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Não foi possível carregar as divisões.</div><div style="font-size:11px;color:var(--text3);margin-top:8px;padding:0 12px">${escapeHtml(msg)}</div></div></div>`;
    return;
  }
  const create=isPro()?`<button class="btn-primary" onclick="openCreateSplitGroup()" style="margin-bottom:14px">Novo grupo</button>`:`${lockedCard('Criar divisões de gastos','Usuários do plano gratuito podem consultar convites, mas a criação é Pro.')}`;
  el.innerHTML=`<div class="split-wrap">${create}${splitGroups.map(g=>`<div class="split-group" onclick="openSplitGroup('${g.id}')"><div class="split-group-title">${escapeHtml(g.name)}</div><div class="split-group-meta">${g.created_by===currentUser.id?'Criado por você':'Você foi convidado'} · ver detalhes ›</div></div>`).join('')||'<div class="empty"><div class="empty-icon"><i class="fa-solid fa-user-group"></i></div><div class="empty-text">Nenhuma divisão ainda.</div></div>'}</div>`;
}
function openCreateSplitGroup(){
  if(!isPro()){openPaywall('Criar divisões de gastos');return;}
  openModal(`<div class="modal-title">Novo grupo</div><div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="f-split-name" placeholder="Ex: Viagem para Paraty" maxlength="100"></div><div class="form-group"><label class="form-label">Convidados por e-mail</label><textarea class="form-input" id="f-split-emails" rows="4" placeholder="amigo@email.com, outra@email.com"></textarea></div><button class="btn-primary" id="btn-split-group" onclick="saveSplitGroup()">Criar grupo</button><button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}
async function saveSplitGroup(){
  const name=document.getElementById('f-split-name').value.trim();
  const emails=[...new Set(document.getElementById('f-split-emails').value.split(/[\s,;]+/).map(x=>x.trim().toLowerCase()).filter(Boolean))];
  if(!name){showToast('Informe o nome do grupo.','error');return;}
  if(emails.some(e=>!/^\S+@\S+\.\S+$/.test(e))){showToast('Confira os e-mails informados.','error');return;}
  const btn=document.getElementById('btn-split-group');btn.disabled=true;btn.textContent='Criando...';
  try{
    const rows=await api.insertSplitGroup(name);
    const group=Array.isArray(rows)?rows[0]:rows;
    if(!group?.id) throw new Error('Grupo não retornado');
    const memberEmails=[currentUser.email.toLowerCase(),...emails.filter(e=>e!==currentUser.email.toLowerCase())];
    await api.insertSplitMembers(memberEmails.map(email=>({group_id:group.id,email,user_id:email===currentUser.email.toLowerCase()?currentUser.id:null,display_name:email===currentUser.email.toLowerCase()?'Você':null})));
    _closeModal();showToast('Grupo criado!','success');renderSplit(document.getElementById('content'));
  }catch(e){
    const msg=String(e?.message||'');
    showToast('Erro: '+msg.slice(0,60),'error');
    btn.disabled=false;btn.textContent='Criar grupo';
  }
}
async function openSplitGroup(groupId){
  const group=splitGroups.find(g=>g.id===groupId);if(!group)return;
  openModal(`<div class="modal-title">${escapeHtml(group.name)}</div><div class="loading"><div class="spinner"></div>Calculando saldos...</div>`);
  try{
    const [members,exps]=await Promise.all([api.getSplitMembers(groupId),api.getSplitExpenses(groupId)]),shares=await api.getSplitShares(exps.map(e=>e.id));
    const memberById=Object.fromEntries(members.map(m=>[m.id,m]));
    const canManage=isPro()&&group.created_by===currentUser.id;
    let html=`<div class="modal-title">${escapeHtml(group.name)}</div>${canManage?`<button class="btn-primary" onclick="openAddSplitExpense('${groupId}')" style="margin-bottom:14px">Adicionar despesa</button>`:''}`;
    html+=exps.map(e=>`<div class="split-expense"><div class="split-expense-head"><span>${escapeHtml(e.description)}</span><span>${brl(e.total_amount)}</span></div><div class="split-group-meta">Pago por ${escapeHtml(e.paid_by_email)}</div>${shares.filter(s=>s.expense_id===e.id).map(s=>{const m=memberById[s.member_id]||{};return `<div class="split-share"><span>${escapeHtml(m.display_name||m.email||'Participante')} · ${brl(s.amount)}</span>${s.is_settled?'<span class="settled"><i class="fa-solid fa-check"></i> Pago</span>':canManage?`<button class="settle-btn" onclick="settleShare('${s.id}','${groupId}')">Marcar pago</button>`:'<span>Pendente</span>'}</div>`}).join('')}</div>`).join('')||'<div class="empty"><div class="empty-text">Nenhuma despesa neste grupo.</div></div>';
    html+=`<button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;document.getElementById('modal-content').innerHTML=html;
  }catch{document.getElementById('modal-content').innerHTML=`<div class="modal-title">${escapeHtml(group.name)}</div><p class="modal-note">Erro ao carregar o grupo.</p><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;}
}
async function openAddSplitExpense(groupId){
  const members=await api.getSplitMembers(groupId);
  const memberCheckboxes=members.map(m=>`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:8px;margin-bottom:6px">
    <input type="checkbox" id="split-m-${m.id}" value="${m.id}" checked style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
    <label for="split-m-${m.id}" style="font-size:14px;cursor:pointer;flex:1">${escapeHtml(m.display_name||m.email)}</label>
  </div>`).join('');
  openModal(`<div class="modal-title">Nova despesa compartilhada</div>
    <div class="form-group"><label class="form-label">Descrição</label>
      <input class="form-input" id="f-split-desc" maxlength="160" placeholder="Ex: Jantar, Uber, Mercado"></div>
    <div class="form-group"><label class="form-label">Valor total (R$)</label>
      <input class="form-input" id="f-split-value" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00"></div>
    <div class="form-group"><label class="form-label">Dividir com</label>${memberCheckboxes}</div>
    <button class="btn-primary" id="btn-split-exp" onclick="saveSplitExpense('${groupId}')">Dividir igualmente</button>
    <button class="btn-secondary" onclick="openSplitGroup('${groupId}')">Cancelar</button>`);
}
async function saveSplitExpense(groupId){
  const description=document.getElementById('f-split-desc').value.trim(),total=parseFloat(document.getElementById('f-split-value').value);
  if(!description||!total||total<=0){showToast('Preencha descrição e valor.','error');return;}
  const allMembers=await api.getSplitMembers(groupId);
  const selected=allMembers.filter(m=>document.getElementById('split-m-'+m.id)?.checked);
  if(!selected.length){showToast('Selecione pelo menos um participante.','error');return;}
  const btn=document.getElementById('btn-split-exp');btn.disabled=true;btn.textContent='Salvando...';
  try{
    const exp=(await api.insertSplitExpense({group_id:groupId,description,total_amount:total,paid_by_user_id:currentUser.id,paid_by_email:currentUser.email}))[0];
    const cents=Math.round(total*100),base=Math.floor(cents/selected.length),remainder=cents%selected.length;
    await api.insertSplitShares(selected.map((m,i)=>({expense_id:exp.id,member_id:m.id,amount:(base+(i<remainder?1:0))/100,is_settled:m.user_id===currentUser.id,settled_at:m.user_id===currentUser.id?new Date().toISOString():null})));
    showToast('Despesa dividida!','success');openSplitGroup(groupId);
  }catch{showToast('Erro ao dividir despesa.','error');btn.disabled=false;btn.textContent='Dividir igualmente';}
}
async function settleShare(shareId,groupId){try{await api.settleSplitShare(shareId,true);showToast('Pagamento confirmado!','success');openSplitGroup(groupId);}catch{showToast('Erro ao confirmar pagamento.','error');}}

// ===================== MODAIS =====================
function openModal(html){ document.getElementById('modal-content').innerHTML=html; document.getElementById('modal-overlay').classList.add('open'); }
function _closeModal(){ document.getElementById('modal-overlay').classList.remove('open'); }
function closeModalOverlay(e){ if(e.target===document.getElementById('modal-overlay')) _closeModal(); }

function openAddExpense(catId){
  if(!isPro()){
    const today=new Date().toISOString().split('T')[0];
    const used=expenses.filter(e=>e.date===today).length;
    if(used>=CONFIG.FREE_DAILY_LAUNCHES){ openPaywall(`Você já registrou ${used} gastos hoje. No Pro, os lançamentos são ilimitados.`); return; }
  }
  const today=new Date().toISOString().split('T')[0];
  openModal(`<div class="modal-title">Novo Gasto</div>
    <div class="form-group"><label class="form-label">Categoria</label>
      <select class="form-input" id="f-catId">${categories.map(c=>`<option value="${c.id}"${c.id===catId?' selected':''}>${c.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Descrição</label>
      <div class="ac-wrap">
        <input class="form-input" id="f-name" placeholder="Ex: Gasolina Shell" autocomplete="off" oninput="acFilter(this.value)" onfocus="acFilter(this.value)" onblur="acBlur()"/>
        <div class="ac-list" id="ac-list"></div>
      </div></div>
    <div class="form-group"><label class="form-label">Valor (R$)</label>
      <input class="form-input" id="f-value" type="number" inputmode="decimal" placeholder="0,00" step="0.01" min="0"/></div>
    <div class="form-group"><label class="form-label">Data</label>
      <input class="form-input" id="f-date" type="date" value="${today}"/></div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:4px">
      <input type="checkbox" id="f-recurring" style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-recurring" style="font-size:14px;cursor:pointer;flex:1">Recorrente <span style="color:var(--text2);font-size:12px">(repetir todo mês)</span></label>
    </div>
    <button class="btn-primary" id="btn-save-exp" onclick="saveExpense(null)">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

function openEditExpense(expId){
  const e=expenses.find(x=>x.id===expId); if(!e) return;
  openModal(`<div class="modal-title">Editar Gasto</div>
    <div class="form-group"><label class="form-label">Categoria</label>
      <select class="form-input" id="f-catId">${categories.map(c=>`<option value="${c.id}"${c.id===e.cat_id?' selected':''}>${c.name}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Descrição</label>
      <div class="ac-wrap">
        <input class="form-input" id="f-name" value="${escapeHtml(e.name)}" autocomplete="off" oninput="acFilter(this.value)" onfocus="acFilter(this.value)" onblur="acBlur()"/>
        <div class="ac-list" id="ac-list"></div>
      </div></div>
    <div class="form-group"><label class="form-label">Valor (R$)</label>
      <input class="form-input" id="f-value" type="number" inputmode="decimal" value="${e.value}" step="0.01" min="0"/></div>
    <div class="form-group"><label class="form-label">Data</label>
      <input class="form-input" id="f-date" type="date" value="${e.date}"/></div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:4px">
      <input type="checkbox" id="f-recurring" ${e.recurring?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-recurring" style="font-size:14px;cursor:pointer;flex:1">Recorrente <span style="color:var(--text2);font-size:12px">(repetir todo mês)</span></label>
    </div>
    <button class="btn-primary" id="btn-save-exp" onclick="saveExpense('${expId}')">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveExpense(expId){
  const catId=document.getElementById('f-catId').value;
  const name=document.getElementById('f-name').value.trim();
  const value=parseFloat(document.getElementById('f-value').value);
  const date=document.getElementById('f-date').value;
  const recurring=document.getElementById('f-recurring')?.checked||false;
  if(!name||isNaN(value)||value<=0||!date){ showToast('Preencha todos os campos.','error'); return; }
  if(!expId&&!isPro()&&expenses.filter(e=>e.date===date).length>=CONFIG.FREE_DAILY_LAUNCHES){ openPaywall('Limite diário de lançamentos atingido'); return; }
  const btn=document.getElementById('btn-save-exp'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    if(expId) await api.updateExpense(expId,{cat_id:catId,name,value,date,recurring});
    else await api.insertExpense({id:uid(),cat_id:catId,month_key:viewMonthKey,name,value,date,recurring});
    if(name && !expenseNames.includes(name)) expenseNames.unshift(name);
    expenses=await api.getExpenses(viewMonthKey);
    saveCache();
    vib(15);
    _closeModal(); render(); showToast('Salvo!','success');
  }catch(err){
    const msg=String(err?.message||'');
    if(/recurring/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN recurring boolean DEFAULT false','error');
    }else{
      showToast('Erro ao salvar.','error');
    }
    btn.disabled=false; btn.textContent='Salvar';
  }
}

async function confirmDeleteExpense(expId){
  if(!confirm('Deletar este gasto?')) return;
  try{ await api.deleteExpense(expId); expenses=expenses.filter(e=>e.id!==expId); saveCache(); render(); showToast('Removido.','success'); }
  catch{ showToast('Erro ao deletar.','error'); }
}

function openAddCategory(){
  if(!isPro()&&categories.length>=CONFIG.FREE_MAX_CATEGORIES){ openPaywall('Crie categorias ilimitadas'); return; }
  openModal(`<div class="modal-title">Nova Categoria</div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-cname" placeholder="Ex: Academia" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Orçamento mensal (R$)</label>
      <input class="form-input" id="f-cbudget" type="number" inputmode="decimal" placeholder="0,00" step="0.01" min="0"/></div>
    <button class="btn-primary" id="btn-save-cat" onclick="saveCategory(null)">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

function openEditCategory(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  openModal(`<div class="modal-title">Editar Categoria</div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-cname" value="${cat.name}" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Orçamento mensal (R$)</label>
      <input class="form-input" id="f-cbudget" type="number" inputmode="decimal" value="${cat.budget}" step="0.01" min="0"/></div>
    <button class="btn-primary" id="btn-save-cat" onclick="saveCategory('${catId}')">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveCategory(catId){
  const name=document.getElementById('f-cname').value.trim();
  const budget=parseFloat(document.getElementById('f-cbudget').value);
  if(!name||isNaN(budget)||budget<=0){ showToast('Preencha todos os campos.','error'); return; }
  if(!catId&&!isPro()&&categories.length>=CONFIG.FREE_MAX_CATEGORIES){ openPaywall('Limite de categorias atingido'); return; }
  const btn=document.getElementById('btn-save-cat'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    if(catId) await api.updateCategory(catId,{name,budget});
    else await api.insertCategory({id:uid(),name,budget,position:categories.length});
    categories=await api.getCategories();
    saveCache();
    vib(15);
    _closeModal(); render(); showToast('Categoria salva!','success');
  }catch{ showToast('Erro ao salvar.','error'); btn.disabled=false; btn.textContent='Salvar'; }
}

async function confirmDeleteCategory(catId){
  if(!confirm('Deletar esta categoria?')) return;
  try{ await api.deleteCategory(catId); categories=categories.filter(c=>c.id!==catId); saveCache(); render(); showToast('Removida.','success'); }
  catch{ showToast('Erro ao deletar.','error'); }
}

function openCloseMonth(){
  const next=nextMonthKey(currentMonthKey);
  openModal(`<div class="modal-title">Fechar Mês</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Ajuste os orçamentos para <strong style="color:var(--text)">${monthLabel(next)}</strong>:</p>
    ${categories.map(cat=>`<div class="month-adj-item">
      <div class="month-adj-name">${cat.name}</div>
      <div class="month-adj-row"><span style="font-size:12px;color:var(--text3);white-space:nowrap">Orçamento (R$)</span>
        <input class="form-input" id="adj-${cat.id}" type="number" inputmode="decimal" value="${cat.budget}" step="0.01" min="0"/></div>
    </div>`).join('')}
    <button class="btn-primary" id="btn-close-month" onclick="confirmCloseMonth('${next}')" style="margin-top:8px">Fechar e Abrir ${monthLabel(next)}</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function confirmCloseMonth(nextKey){
  const btn=document.getElementById('btn-close-month'); btn.disabled=true; btn.textContent='Processando...';
  try{
    for(const cat of categories){ const inp=document.getElementById(`adj-${cat.id}`); if(inp){const v=parseFloat(inp.value);if(!isNaN(v)&&v>0) await api.updateCategory(cat.id,{budget:v});} }
    await api.closeMonth(currentMonthKey);
    if(!months.find(m=>m.key===nextKey)) await api.insertMonth({key:nextKey,closed:false});
    categories=await api.getCategories(); months=await api.getMonths();
    currentMonthKey=nextKey; viewMonthKey=nextKey; currentCatIdx=0;
    expenses=await api.getExpenses(viewMonthKey);
    saveCache();
    vib(20);
    _closeModal(); render(); showToast(`${monthLabel(nextKey)} aberto!`,'success');
  }catch{ showToast('Erro ao fechar mês.','error'); btn.disabled=false; btn.textContent='Tentar novamente'; }
}

function openMonthPicker(){
  if(!isPro()){ openPaywall('Histórico de meses anteriores'); return; }
  openModal(`<div class="modal-title">Selecionar Mês</div>
    ${months.map(m=>`<div onclick="selectMonth('${m.key}')" style="padding:14px 16px;border-radius:10px;margin-bottom:8px;background:${m.key===viewMonthKey?'var(--accent)':'var(--surface2)'};color:${m.key===viewMonthKey?'#0f0f0f':'var(--text)'};font-weight:${m.key===viewMonthKey?600:400};cursor:pointer">
      ${monthLabel(m.key)} ${m.closed?'<span style="font-size:11px;opacity:.6">Fechado</span>':''}
    </div>`).join('')}`);
}

async function selectMonth(key){
  viewMonthKey=key; currentCatIdx=0;
  _closeModal();
  expenses=await api.getExpenses(viewMonthKey);
  render();
}

function onFab(){
  vib();
  if(currentTab==='categorias') openAddCategory();
  else{ if(!categories.length){ showToast('Crie uma categoria primeiro.','error'); return; } openAddExpense(categories[currentCatIdx]?.id||categories[0].id); }
}

async function switchTab(tab,btn){
  vib(5);
  currentTab=tab; currentCatIdx=0;
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  viewMonthKey=currentMonthKey;
  expenses=await api.getExpenses(viewMonthKey);
  render();
}

// ===================== AUTOCOMPLETE =====================
function acFilter(q){
  const list=document.getElementById('ac-list'); if(!list) return;
  q=(q||'').trim().toLowerCase();
  if(!q){ acClose(); return; }
  const starts=[], incl=[];
  for(const n of expenseNames){
    const ln=n.toLowerCase();
    if(ln===q) continue;
    if(ln.startsWith(q)) starts.push(n);
    else if(ln.includes(q)) incl.push(n);
  }
  acResults=[...starts,...incl].slice(0,6);
  if(!acResults.length){ acClose(); return; }
  list.innerHTML=acResults.map((n,i)=>`<div class="ac-item" onpointerdown="acPick(${i})">${escapeHtml(n)}</div>`).join('');
  list.classList.add('open');
}
function acPick(i){
  const n=acResults[i]; if(n==null) return;
  const inp=document.getElementById('f-name'); if(inp) inp.value=n;
  acClose();
}
function acClose(){ const l=document.getElementById('ac-list'); if(l){ l.innerHTML=''; l.classList.remove('open'); } }
function acBlur(){ setTimeout(acClose,150); }

// ===================== CONSOLIDADO DO MÊS =====================
async function openConsolidado(){
  if(!isPro()){ openPaywall('Consolidado completo e comparativos'); return; }
  const k0=viewMonthKey, k1=prevMonthKey(k0), k2=prevMonthKey(k1);
  openModal(`<div class="modal-title">Consolidado · ${monthLabel(k0)}</div><div class="loading"><div class="spinner"></div>Calculando...</div>`);
  let e0=[],e1=[],e2=[];
  try{ [e0,e1,e2]=await Promise.all([api.getExpenses(k0),api.getExpenses(k1),api.getExpenses(k2)]); }
  catch{ document.getElementById('modal-content').innerHTML=`<div class="modal-title">Consolidado</div><div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Erro ao calcular.</div></div><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`; return; }

  const sum=arr=>arr.reduce((s,x)=>s+parseFloat(x.value),0);
  const T0=sum(e0),T1=sum(e1),T2=sum(e2);
  const catName=id=>{const c=categories.find(x=>x.id===id);return c?c.name:'—';};
  const deltaBadge=(curr,prev)=>{
    if(prev<=0) return curr>0?`<span class="badge over">novo</span>`:`<span class="badge ok">—</span>`;
    const pct=((curr-prev)/prev)*100;
    if(Math.abs(pct)<0.5) return `<span class="badge ok">≈ igual</span>`;
    return pct>0?`<span class="badge over">▲ ${Math.abs(pct).toFixed(0)}%</span>`:`<span class="badge saved">▼ ${Math.abs(pct).toFixed(0)}%</span>`;
  };

  const top=[...e0].sort((a,b)=>parseFloat(b.value)-parseFloat(a.value)).slice(0,5);
  const byCat={};
  e0.forEach(e=>{byCat[e.cat_id]=(byCat[e.cat_id]||0)+parseFloat(e.value);});
  const catRank=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const maxCat=catRank.length?catRank[0][1]:1;

  const rows=[[k0,T0,T1,'mês atual'],[k1,T1,T2,'mês anterior'],[k2,T2,0,'2 meses atrás']];
  let html=`<div class="modal-title">Consolidado · ${monthLabel(k0)}</div>`;

  html+=`<div class="cons-section">Comparação mensal</div>`;
  html+=rows.map(([k,cur,prev,tag])=>`<div class="cons-row">
    <div><div style="font-weight:500">${monthLabel(k)}</div><div style="font-size:12px;color:var(--text3)">${tag}</div></div>
    <div style="text-align:right"><div style="font-weight:600">${brl(cur)}</div><div style="margin-top:3px">${deltaBadge(cur,prev)}</div></div>
  </div>`).join('');

  html+=`<div class="cons-section" style="margin-top:22px">Maiores gastos do mês</div>`;
  html+= top.length? top.map((e,i)=>`<div class="cons-row">
    <div style="display:flex;align-items:center;gap:10px"><div class="cons-rank">${i+1}</div>
      <div><div style="font-weight:500">${escapeHtml(e.name)}</div><div style="font-size:12px;color:var(--text3)">${escapeHtml(catName(e.cat_id))} · ${new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}</div></div>
    </div>
    <div style="font-weight:600">${brl(e.value)}</div>
  </div>`).join('') : `<div style="color:var(--text3);font-size:13px;padding:8px 0">Nenhum gasto neste mês.</div>`;

  if(catRank.length){
    html+=`<div class="cons-section" style="margin-top:22px">Onde foi o dinheiro</div>`;
    html+=catRank.map(([id,val])=>`<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span>${escapeHtml(catName(id))}</span><span style="font-weight:600">${brl(val)} · ${T0>0?((val/T0)*100).toFixed(0):0}%</span></div>
      <div class="progress-bar"><div class="progress-fill" style="width:${(val/maxCat)*100}%"></div></div>
    </div>`).join('');
  }

  html+=`<button class="btn-secondary" style="margin-top:22px" onclick="_closeModal()">Fechar</button>`;
  document.getElementById('modal-content').innerHTML=html;
}

// ===================== ORÇAMENTO DO MÊS (override) =====================
function openMonthOverride(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const eff=effBudget(cat,currentMonthKey);
  const ov=hasOverride(cat,currentMonthKey);
  openModal(`<div class="modal-title">Orçamento de ${escapeHtml(cat.name)}</div>
    <p class="modal-note">Vale só para <strong>${monthLabel(currentMonthKey)}</strong>. O orçamento padrão (<strong>${brl(cat.budget)}/mês</strong>) continua o mesmo nos próximos meses.</p>
    <div class="form-group"><label class="form-label">Orçamento deste mês (R$)</label>
      <input class="form-input" id="f-ovbudget" type="number" inputmode="decimal" value="${eff}" step="0.01" min="0"/></div>
    <button class="btn-primary" id="btn-ov" onclick="saveMonthOverride('${catId}')">Salvar ajuste do mês</button>
    ${ov?`<button class="btn-secondary" onclick="revertMonthOverride('${catId}')">Voltar ao padrão (${brl(cat.budget)})</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveMonthOverride(catId){
  const v=parseFloat(document.getElementById('f-ovbudget').value);
  if(isNaN(v)||v<=0){ showToast('Informe um valor válido.','error'); return; }
  const m=months.find(x=>x.key===currentMonthKey); if(!m) return;
  const budgets={...(m.budgets||{}), [catId]:v};
  const btn=document.getElementById('btn-ov'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    await api.setMonthBudgets(currentMonthKey, budgets);
    m.budgets=budgets;
    saveCache(); vib(15);
    _closeModal(); render(); showToast('Orçamento do mês ajustado!','success');
  }catch(e){
    btn.disabled=false; btn.textContent='Salvar ajuste do mês';
    showToast('Erro — confira se a coluna "budgets" existe no Supabase.','error');
  }
}

async function revertMonthOverride(catId){
  const m=months.find(x=>x.key===currentMonthKey); if(!m||!m.budgets) return;
  const budgets={...m.budgets}; delete budgets[catId];
  try{
    await api.setMonthBudgets(currentMonthKey, budgets);
    m.budgets=budgets;
    saveCache(); vib(10);
    _closeModal(); render(); showToast('Voltou ao orçamento padrão.','success');
  }catch{ showToast('Erro ao reverter.','error'); }
}

function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),2500);
}

// ===================== TUTORIAL =====================
const TUTORIAL_KEY = 'gc-tutorial-v1';
const TUTORIAL_STEPS = [
  {
    title: 'Bem-vindo ao GastoCerto!',
    body: 'Em poucos passos você vai conhecer tudo. Vamos lá?',
    target: null,
  },
  {
    title: 'Início — seus gastos do mês',
    body: 'Aqui ficam suas categorias em carrossel. Deslize para navegar entre elas e veja quanto gastou em cada uma.',
    target: ()=>document.querySelector('.tab.active'),
  },
  {
    title: 'Categorias',
    body: 'Crie categorias como "Alimentação", "Academia" ou "Aluguel". Cada uma tem um orçamento mensal. Arraste para reordenar.',
    target: ()=>document.querySelectorAll('.tab')[1],
    action: ()=>{ const t=document.querySelectorAll('.tab')[1]; if(t) t.click(); },
  },
  {
    title: 'Histórico',
    body: 'Veja gráficos, badges e comparativos dos últimos meses. Disponível no plano Pro.',
    target: ()=>document.querySelectorAll('.tab')[2],
    action: ()=>{ const t=document.querySelectorAll('.tab')[2]; if(t) t.click(); },
  },
  {
    title: 'Grupos de divisão',
    body: 'Divida despesas com amigos ou família. Crie um grupo, adicione participantes e registre o que cada um deve.',
    target: ()=>document.querySelectorAll('.tab')[3],
    action: ()=>{ const t=document.querySelectorAll('.tab')[3]; if(t) t.click(); },
  },
  {
    title: 'Botão de ação rápida',
    body: 'O botão verde no canto adiciona gastos ou categorias dependendo da aba que você está.',
    target: ()=>document.getElementById('fab'),
    action: ()=>{ const t=document.querySelectorAll('.tab')[0]; if(t) t.click(); },
  },
  {
    title: 'Tudo pronto!',
    body: 'Crie sua primeira categoria para começar a registrar seus gastos. Qualquer dúvida, acesse sua conta pelo botão no topo.',
    target: null,
  },
];

let tutStep=0, tutEl=null;

function showTutorial(force=false){
  if(!force&&localStorage.getItem(TUTORIAL_KEY)) return;
  tutStep=0;
  renderTutStep();
}

function renderTutStep(){
  document.getElementById('tut-overlay')?.remove();
  const step=TUTORIAL_STEPS[tutStep];
  if(!step) return endTutorial();

  if(step.action) step.action();

  const overlay=document.createElement('div');
  overlay.id='tut-overlay';
  overlay.className='tut-overlay';

  const backdrop=document.createElement('div');
  backdrop.className='tut-backdrop';
  backdrop.onclick=()=>{};
  overlay.appendChild(backdrop);

  const target=step.target?.();
  if(target){
    const r=target.getBoundingClientRect();
    const spot=document.createElement('div');
    spot.className='tut-spotlight';
    spot.style.cssText=`top:${r.top-6}px;left:${r.left-6}px;width:${r.width+12}px;height:${r.height+12}px`;
    overlay.appendChild(spot);
  }

  const isLast=tutStep===TUTORIAL_STEPS.length-1;
  const card=document.createElement('div');
  card.className='tut-card';
  const cardTop=target?Math.min(target.getBoundingClientRect().bottom+18, window.innerHeight-220):window.innerHeight/2-100;
  card.style.top=`${cardTop}px`;

  const dotsHtml=TUTORIAL_STEPS.map((_,i)=>`<div class="tut-dot${i===tutStep?' active':''}"></div>`).join('');
  card.innerHTML=`
    <div class="tut-step">Passo ${tutStep+1} de ${TUTORIAL_STEPS.length}</div>
    <div class="tut-title">${step.title}</div>
    <div class="tut-body">${step.body}</div>
    <div class="tut-actions">
      <div class="tut-dots">${dotsHtml}</div>
      ${tutStep>0?`<button class="tut-skip" onclick="endTutorial()">Pular</button>`:''}
      <button class="tut-next" onclick="${isLast?'endTutorial()':'nextTutStep()'}">${isLast?'Começar!':'Próximo'}</button>
    </div>`;
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function nextTutStep(){
  tutStep++;
  renderTutStep();
}

function endTutorial(){
  localStorage.setItem(TUTORIAL_KEY,'1');
  document.getElementById('tut-overlay')?.remove();
  const t=document.querySelectorAll('.tab')[0]; if(t) t.click();
}

document.addEventListener('touchstart', function(e){
  if(e.touches.length > 1) e.preventDefault();
}, {passive: false});

let lastTap = 0;
document.addEventListener('touchend', function(e){
  if(e.target.closest('button,.pin-key,.exp-btn,.icon-btn,.cat-nav-btn,.cdot,.tab,input,select,[onclick]')) { lastTap = Date.now(); return; }
  const now = Date.now();
  if(now - lastTap < 300) e.preventDefault();
  lastTap = now;
}, {passive: false});

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
bootstrapAuth();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ensureValidSession();});
window.addEventListener('pageshow',()=>ensureValidSession());
window.addEventListener('online',()=>ensureValidSession());
