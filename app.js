(function(){const t=localStorage.getItem('gc-theme')||'light';document.documentElement.setAttribute('data-theme',t);})();
const IS_STANDALONE=(typeof navigator!=='undefined'&&navigator.standalone===true)||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
function measuredAppHeight(){
  let h=window.innerHeight||document.documentElement.clientHeight||0;
  if(window.visualViewport&&window.visualViewport.height) h=Math.max(h,Math.round(window.visualViewport.height));
  if(IS_STANDALONE&&window.screen&&window.screen.height) h=Math.max(h,window.screen.height);
  return h;
}
function fitViewport(){
  const h=measuredAppHeight();
  if(!h) return;
  const de=document.documentElement;
  de.style.setProperty('--vh',h+'px');
  de.style.height=h+'px';
  document.body.style.height=h+'px';
  const app=document.getElementById('app');
  if(app) app.style.height=h+'px';
  const ovs=document.querySelectorAll('.modal-overlay,.dm-overlay,.dm-sheet-overlay,#auth-screen,#pin-screen,.tut-overlay');
  for(let i=0;i<ovs.length;i++){ ovs[i].style.height=h+'px'; ovs[i].style.top='0'; ovs[i].style.bottom='auto'; }
}
(function(){
  if(IS_STANDALONE) document.documentElement.classList.add('pwa-standalone');
  fitViewport();
  window.addEventListener('resize',fitViewport);
  window.addEventListener('orientationchange',function(){ fitViewport(); setTimeout(fitViewport,300); });
  window.addEventListener('pageshow',fitViewport);
  window.addEventListener('load',fitViewport);
  if(window.visualViewport) window.visualViewport.addEventListener('resize',fitViewport);
  setTimeout(fitViewport,150); setTimeout(fitViewport,500); setTimeout(fitViewport,1200);
})();
function toggleTheme(){
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  const next=isLight?'dark':'light';
  document.documentElement.setAttribute('data-theme',next);
  localStorage.setItem('gc-theme',next);
  if(session) api.updateUserMeta({theme:next}).catch(()=>{});
  vib(6);
}
function syncThemeRow(){
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  const icon=document.getElementById('theme-icon');
  const label=icon?.parentElement;
  if(icon){icon.className=`fa-solid ${isLight?'fa-sun':'fa-moon'}`;}
  if(label){label.innerHTML=`<i class="fa-solid ${isLight?'fa-sun':'fa-moon'}" id="theme-icon" aria-hidden="true"></i> Tema ${isLight?'claro':'escuro'}`;}
}

const APP_VERSION = '4.5';
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
  document.getElementById('auth-username-field').hidden=!signup;
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
  fitViewport();
  const metaTheme=currentUser?.user_metadata?.theme;
  if(metaTheme&&!localStorage.getItem('gc-theme')){
    document.documentElement.setAttribute('data-theme',metaTheme);
    localStorage.setItem('gc-theme',metaTheme);
  }
  const metaPlan=currentUser?.user_metadata?.planning_enabled;
  if(metaPlan!=null) localStorage.setItem('gc-planning',metaPlan?'1':'0');
  init();
}
function updatePlanBadge(isAdminPro,trialDays){
  const badge=document.getElementById('plan-badge');
  if(!badge) return;
  if(isPro()){
    badge.classList.remove('free');
    badge.innerHTML=`<i class="fa-solid fa-crown" aria-hidden="true"></i> ${isAdminPro?'Pro':(trialDays?`Pro · ${trialDays}d`:'Pro')}`;
  }else{
    badge.classList.add('free');
    badge.textContent='Grátis';
  }
}
function userTag(uid){
  if(!uid) return null;
  if(uid===currentUser.id) return myProfile?.username?`@${myProfile.username}`:null;
  const p=profilesById[uid];
  if(p?.username) return `@${p.username}`;
  const email=sharedOutMap[uid];
  return email?email.split('@')[0]:null;
}
async function logout(){
  const token=session?.access_token;
  if(token) fetch(`${SUPABASE_URL}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}}).catch(()=>{});
  persistSession(null); categories=[]; months=[]; expenses=[]; expenseNames=[]; acceptedShares=[]; sharedOutMap={}; pendingSplitInvites=[]; acceptedGroupIds=new Set(); friends=[]; budgetTransfers=[]; cards=[]; rollovers=[]; futureMonthKeys=[]; anchors=[]; planEntries=[]; histView='hist'; planUntilYear=0; document.body.classList.remove('plan-wide');
  stopUnreadPoll(); unreadDm={}; updateAmigosBadge();
  document.documentElement.classList.remove('gc-has-session');
  document.getElementById('app').style.display='none';
  document.getElementById('auth-screen').style.display='flex';
  _closeModal(); setAuthMode('login');
}
document.getElementById('auth-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const button=document.getElementById('auth-submit'), error=document.getElementById('auth-error');
  const email=document.getElementById('auth-email').value.trim(), password=document.getElementById('auth-password').value;
  const username=(document.getElementById('auth-username').value||'').trim().toLowerCase();
  button.disabled=true; error.textContent='';
  try{
    if(authMode==='signup'){
      if(username.length<3) throw new Error('O nome de usuário precisa ter ao menos 3 caracteres.');
      if(!/^[a-z0-9_]+$/.test(username)) throw new Error('Use apenas letras minúsculas, números e _ no nome de usuário.');
    }
    const data=authMode==='signup'
      ?await authRequest('signup',{email,password,data:{display_name:document.getElementById('auth-name').value.trim(),username}})
      :await authRequest('token?grant_type=password',{email,password});
    if(!data.access_token) throw new Error('Confira seu e-mail para confirmar a conta antes de entrar.');
    persistSession(data);
    if(authMode==='signup'){
      try{
        const taken=await api.checkUsername(username);
        if(taken){ persistSession(null); throw new Error('Este nome de usuário já está em uso. Escolha outro.'); }
        await api.insertProfile(username);
        myProfile={id:currentUser.id,username,email};
      }catch(pErr){
        if(/já está em uso/.test(pErr.message)){ button.disabled=false; error.textContent=pErr.message; return; }
      }
    }
    enterApp();
    if(authMode==='signup') setTimeout(()=>showWelcomeTrial(),300);
  }catch(err){ error.textContent=authMessage(err.message); }
  finally{ button.disabled=false; }
});

function vib(ms=8){ if(navigator.vibrate) navigator.vibrate(ms); }

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
    fitViewport();
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
  deleteExpense:(id)=>sbFetch(`expenses?id=eq.${id}&select=id`,{method:'DELETE'}),
  getActivity:(catId)=>sbFetch(`activity_log?category_id=eq.${catId}&order=created_at.desc&limit=50`),
  getAllActivity:()=>sbFetch('activity_log?order=created_at.desc&limit=80'),
  insertActivity:(d)=>sbFetch('activity_log',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...d,actor_user_id:currentUser.id,actor_email:currentUser.email})}),
  setMonthBudgets:(key,budgets)=>sbFetch(`months?key=eq.${key}`,{method:'PATCH',body:JSON.stringify({budgets})}),
  getBudgetTransfers:(monthKey)=>sbFetch(`budget_transfers?month_key=eq.${monthKey}&order=created_at.desc`),
  insertBudgetTransfer:(d)=>sbFetch('budget_transfers',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  getCards:()=>sbFetch(`cards?user_id=eq.${currentUser.id}&order=name.asc`),
  insertCard:(d)=>sbFetch('cards',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateCard:(id,d)=>sbFetch(`cards?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteCard:(id)=>sbFetch(`cards?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getRollovers:(monthKey)=>sbFetch(`budget_rollovers?to_month=eq.${monthKey}&order=created_at.desc`),
  insertRollover:(d)=>sbFetch('budget_rollovers',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...d,user_id:currentUser.id})}),
  deleteRollover:(id)=>sbFetch(`budget_rollovers?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getExpensesFrom:(monthKey)=>sbFetch(`expenses?month_key=gte.${monthKey}&order=month_key.asc`),
  getIncomes:()=>sbFetch(`incomes?user_id=eq.${currentUser.id}&order=start_month.asc`),
  insertIncome:(d)=>sbFetch('incomes',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateIncome:(id,d)=>sbFetch(`incomes?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteIncome:(id)=>sbFetch(`incomes?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getPlanEntries:()=>sbFetch(`plan_entries?user_id=eq.${currentUser.id}&order=position.asc,name.asc`),
  insertPlanEntry:(d)=>sbFetch('plan_entries',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updatePlanEntry:(id,d)=>sbFetch(`plan_entries?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deletePlanEntry:(id)=>sbFetch(`plan_entries?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getAnchors:()=>sbFetch(`balance_anchors?user_id=eq.${currentUser.id}&order=month_key.asc`),
  upsertAnchor:(d)=>sbFetch('balance_anchors',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...d,user_id:currentUser.id})}),
  deleteAnchor:(id)=>sbFetch(`balance_anchors?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteInstallmentsAfter:(group,afterNo)=>sbFetch(`expenses?installment_group=eq.${group}&installment_no=gt.${afterNo}&select=id`,{method:'DELETE'}),
  getSplitGroups:()=>sbFetch('split_groups?order=id.desc'),
  insertSplitGroup:(name)=>sbFetch('split_groups',{method:'POST',body:JSON.stringify({name,created_by:currentUser.id})}),
  updateSplitGroup:(id,name)=>sbFetch(`split_groups?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({name})}),
  deleteSplitGroup:(id)=>sbFetch(`split_groups?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getSplitMembers:(groupId)=>sbFetch(`split_members?group_id=eq.${groupId}`),
  insertSplitMembers:(rows)=>sbFetch('split_members',{method:'POST',body:JSON.stringify(rows)}),
  updateSplitMember:(id,data)=>sbFetch(`split_members?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(data)}),
  getPendingSplitInvites:()=>sbFetch(`split_members?email=ilike.${encodeURIComponent(currentUser.email)}&status=eq.pending&select=id,group_id,split_groups(name)`),
  getAcceptedSplitMemberships:()=>sbFetch(`split_members?email=ilike.${encodeURIComponent(currentUser.email)}&status=eq.accepted&select=group_id`),
  getSplitExpenses:(groupId)=>sbFetch(`split_expenses?group_id=eq.${groupId}&order=id.desc`),
  insertSplitExpense:(row)=>sbFetch('split_expenses',{method:'POST',body:JSON.stringify(row)}),
  updateSplitExpense:(id,d)=>sbFetch(`split_expenses?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  getSplitShares:(expenseIds)=>expenseIds.length?sbFetch(`split_shares?expense_id=in.(${expenseIds.join(',')})`):Promise.resolve([]),
  insertSplitShares:(rows)=>sbFetch('split_shares',{method:'POST',body:JSON.stringify(rows)}),
  settleSplitShare:(id,settled)=>sbFetch(`split_shares?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({is_settled:settled,settled_at:settled?new Date().toISOString():null})}),
  settleAllSharesForMember:(memberId)=>sbFetch(`split_shares?member_id=eq.${memberId}&is_settled=eq.false`,{method:'PATCH',body:JSON.stringify({is_settled:true,settled_at:new Date().toISOString()})}),
  getSplitPayments:(groupId)=>sbFetch(`split_payments?group_id=eq.${groupId}&order=created_at.desc`),
  insertSplitPayment:(row)=>sbFetch('split_payments',{method:'POST',body:JSON.stringify(row)}),
  deleteSplitPayment:(id)=>sbFetch(`split_payments?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getCategoryShares:(catId)=>sbFetch(`category_shares?category_id=eq.${catId}&order=id.desc`),
  getPendingShares:()=>sbFetch(`category_shares?shared_with_email=ilike.${encodeURIComponent(currentUser.email)}&status=eq.pending`),
  insertCategoryShare:(data)=>sbFetch('category_shares',{method:'POST',body:JSON.stringify({...data,shared_by_user_id:currentUser.id})}),
  updateCategoryShare:(id,data)=>sbFetch(`category_shares?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(data)}),
  deleteCategoryShare:(id)=>sbFetch(`category_shares?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getAcceptedShares:()=>sbFetch(`category_shares?shared_with_email=ilike.${encodeURIComponent(currentUser.email)}&status=eq.accepted`),
  getMyShares:()=>sbFetch(`category_shares?shared_by_user_id=eq.${currentUser.id}&status=eq.accepted`),
  getFriends:()=>sbFetch(`friends?user_id=eq.${currentUser.id}&order=username.asc.nullslast`),
  addFriend:(email,username,friendUserId)=>sbFetch('friends',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({user_id:currentUser.id,email,username:username||null,friend_user_id:friendUserId||null})}),
  updateFriend:(id,d)=>sbFetch(`friends?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(d)}),
  lookupFriend:(identifier)=>sbFetch('rpc/friend_lookup',{method:'POST',body:JSON.stringify({identifier})}),
  deleteFriend:(id)=>sbFetch(`friends?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getDmEntries:(friendId)=>sbFetch(`dm_entries?or=(and(sender_id.eq.${currentUser.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${currentUser.id}))&order=created_at.asc`),
  insertDm:(row)=>sbFetch('dm_entries',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...row,sender_id:currentUser.id})}),
  deleteDm:(id)=>sbFetch(`dm_entries?id=eq.${id}&select=id`,{method:'DELETE'}),
  getIncomingDms:()=>sbFetch(`dm_entries?recipient_id=eq.${currentUser.id}&order=created_at.desc&limit=100`),
  ensureReverseFriend:(targetId,email,username)=>sbFetch('rpc/ensure_reverse_friend',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({target_id:targetId,my_email:email,my_username:username||null})}),
  getMyProfile:()=>sbFetch(`profiles?id=eq.${currentUser.id}&limit=1`).then(r=>r?.[0]||null),
  checkUsername:(u)=>sbFetch(`profiles?username=ilike.${encodeURIComponent(u)}&id=neq.${currentUser.id}&select=id&limit=1`).then(r=>r?.[0]||null),
  insertProfile:(username)=>sbFetch('profiles',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:currentUser.id,username:username.toLowerCase(),email:currentUser.email})}),
  getProfilesByIds:(ids)=>ids.length?sbFetch(`profiles?id=in.(${ids.join(',')})&select=id,username`):Promise.resolve([]),
  getAdminGrant:()=>sbFetch(`admin_grants?email=ilike.${encodeURIComponent(currentUser.email)}&limit=1`),
  insertAdminGrant:(email,plan)=>sbFetch('admin_grants',{method:'POST',body:JSON.stringify({email:email.toLowerCase(),plan,granted_by:currentUser.id})}),
  deleteAdminGrant:(id)=>sbFetch(`admin_grants?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  listAdminGrants:()=>sbFetch('admin_grants?order=id.desc'),
  updateUserMeta:(data)=>fetch(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({data})}).then(r=>r.json()),
};

let categories=[], months=[], currentMonthKey='', viewMonthKey='', expenses=[], currentTab='home', currentCatIdx=0, budgetTransfers=[], cards=[], rollovers=[], futureMonthKeys=[];
let anchors=[], planEntries=[], histView='hist', planUntilYear=0, planScale='month', planOpenGroups={}, planView='table', planStmtMonths=12;
function isPlanningOn(){ return localStorage.getItem('gc-planning')==='1'; }
let subscription=null, userPlan='free';
let splitGroups=[], pendingShares=[], acceptedShares=[], sharedOutMap={}, pendingSplitInvites=[], acceptedGroupIds=new Set(), friends=[];
let myProfile=null, profilesById={};
let unreadDm={}, _unreadPoll=null;
function dmSeenMap(){ try{ return JSON.parse(localStorage.getItem('gc-dm-seen')||'{}'); }catch{ return {}; } }
function markDmSeen(friendId){ if(!friendId) return; const m=dmSeenMap(); m[friendId]=new Date().toISOString(); try{ localStorage.setItem('gc-dm-seen',JSON.stringify(m)); }catch{} }
function unreadTotal(){ return Object.values(unreadDm).reduce((a,b)=>a+b,0); }
function updateAmigosBadge(){
  const total=unreadTotal();
  const nav=document.querySelector('.nav-item[data-tab="amigos"]'); if(!nav) return;
  const ico=nav.querySelector('.nav-ico')||nav;
  let b=ico.querySelector('.nav-badge');
  if(total>0){ if(!b){ b=document.createElement('span'); b.className='nav-badge'; ico.appendChild(b); } b.textContent=total>9?'9+':String(total); }
  else if(b){ b.remove(); }
}
async function refreshUnread(notify){
  if(!currentUser) return;
  let incoming=[]; try{ incoming=await api.getIncomingDms()||[]; }catch{ return; }
  const seen=dmSeenMap();
  const prev=unreadTotal();
  const bySender={};
  for(const e of incoming){ const s=seen[e.sender_id]; if(!s||new Date(e.created_at)>new Date(s)) bySender[e.sender_id]=(bySender[e.sender_id]||0)+1; }
  unreadDm=bySender;
  updateAmigosBadge();
  if(notify&&unreadTotal()>prev) maybeNotify(incoming);
  if(currentTab==='amigos'&&!document.getElementById('dm-chat')) render();
}
function maybeNotify(incoming){
  if(!('Notification'in window)||Notification.permission!=='granted') return;
  const seen=dmSeenMap();
  const fresh=(incoming||[]).filter(e=>{ const s=seen[e.sender_id]; return !s||new Date(e.created_at)>new Date(s); });
  if(!fresh.length) return;
  const latest=fresh[0];
  const f=friends.find(x=>x.friend_user_id===latest.sender_id);
  const who=f?friendLabel(f):'Alguém';
  const kind=latest.type==='expense'?'registrou um gasto para dividir':latest.type==='payment'?'registrou um pagamento':'te enviou uma mensagem';
  try{ new Notification('GastoCerto',{body:`${who} ${kind}`,icon:'./icon-192.png',tag:'gc-dm'}); }catch{}
}
function requestNotifPerm(){ try{ if('Notification'in window&&Notification.permission==='default') Notification.requestPermission().catch(()=>{}); }catch{} }
function startUnreadPoll(){ stopUnreadPoll(); refreshUnread(false); _unreadPoll=setInterval(()=>{ if(!document.hidden) refreshUnread(true); },25000); }
function stopUnreadPoll(){ if(_unreadPoll){ clearInterval(_unreadPoll); _unreadPoll=null; } }
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&currentUser) refreshUnread(true); });
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
const todayLocal=()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const monthLabel=key=>{ if(!key)return''; const[y,m]=key.split('-'); return `${['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][+m-1]} ${y}`; };
const nextMonthKey=key=>{ const[y,m]=key.split('-').map(Number); return monthKeyOf(new Date(y,m,1)); };
const prevMonthKey=key=>{ const[y,m]=key.split('-').map(Number); return monthKeyOf(new Date(y,m-2,1)); };
const brl=v=>`R$ ${parseFloat(v).toFixed(2).replace('.',',')}`;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function parseNum(s){
  if(s==null||s==='') return NaN;
  s=String(s).trim();
  if(s.indexOf(',')>-1&&s.indexOf('.')>-1) s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(',','.');
  return parseFloat(s);
}
function moneyKey(el){ el.value=el.value.replace(/[^0-9.,]/g,''); }

function baseBudget(cat, monthKey){
  const m=months.find(x=>x.key===monthKey);
  const ov=m&&m.budgets?m.budgets[cat.id]:null;
  return (ov!=null&&!isNaN(parseFloat(ov)))?parseFloat(ov):parseFloat(cat.budget);
}
function rolloverAmount(catId, monthKey){
  return rollovers.filter(r=>r.cat_id===catId&&r.to_month===monthKey)
    .reduce((s,r)=>s+parseFloat(r.amount||0),0);
}
function effBudget(cat, monthKey){
  return Math.round((baseBudget(cat,monthKey)+rolloverAmount(cat.id,monthKey))*100)/100;
}
function hasOverride(cat, monthKey){
  const m=months.find(x=>x.key===monthKey);
  return !!(m&&m.budgets&&m.budgets[cat.id]!=null);
}

let expenseNames=[], acResults=[];

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
  const uname=myProfile?.username?`@${escapeHtml(myProfile.username)}`:'';
  const isAdmin=currentUser?.email==='2rafab@gmail.com';
  const isLight=document.documentElement.getAttribute('data-theme')==='light';
  openModal(`<div class="modal-title">Sua conta</div>
    <div style="display:flex;align-items:center;gap:12px;padding:14px;background:var(--surface2);border-radius:14px;margin-bottom:16px">
      <div style="width:44px;height:44px;border-radius:50%;background:var(--accent-soft);border:1px solid var(--accent-line);display:flex;align-items:center;justify-content:center;color:var(--accent-text);font-weight:700;font-size:18px;flex-shrink:0">${escapeHtml((myProfile?.username||email||'?').charAt(0).toUpperCase())}</div>
      <div style="min-width:0;flex:1">
        ${uname?`<div style="font-weight:700;font-size:15px">${uname}</div>`:`<div style="font-weight:700;font-size:14px;color:var(--accent-text);cursor:pointer" onclick="openSetUsername()"><i class="fa-solid fa-at" aria-hidden="true"></i> Definir nome de usuário</div>`}
        <div style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${email}</div>
        <div style="font-size:11px;color:var(--accent-text);font-weight:600;margin-top:2px">${isPro()?'Plano Pro':'Plano Gratuito'}</div>
      </div>
    </div>
    <div class="theme-row">
      <span class="theme-row-label"><i class="fa-solid ${isLight?'fa-sun':'fa-moon'}" id="theme-icon" aria-hidden="true"></i> Tema ${isLight?'claro':'escuro'}</span>
      <label class="switch"><input type="checkbox" id="theme-switch" ${isLight?'checked':''} onchange="toggleTheme();syncThemeRow()"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    <div class="theme-row">
      <span class="theme-row-label"><i class="fa-solid fa-chart-line" aria-hidden="true"></i> Planejamento futuro</span>
      <label class="switch"><input type="checkbox" id="planning-switch" ${isPlanningOn()?'checked':''} onchange="togglePlanning()"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    ${isPlanningOn()?`<button class="btn-secondary" onclick="openPlanEntries()"><i class="fa-solid fa-calendar-check" aria-hidden="true"></i> Meus compromissos</button>`:''}
    <button class="btn-secondary" onclick="openCards()"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> Meus cartões</button>
    <button class="btn-secondary" onclick="openPaywall('Planos e assinatura')"><i class="fa-solid fa-crown" aria-hidden="true"></i> Ver planos</button>
    <button class="btn-secondary" onclick="_closeModal();showTutorial(true)"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Ver tutorial</button>
    ${isAdmin?`<button class="btn-secondary" style="border-color:var(--accent-line);color:var(--accent-text)" onclick="openAdminPanel()"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Painel Admin</button>`:''}
    <button class="btn-secondary" onclick="logout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sair da conta</button>
    <div style="text-align:center;font-size:11px;color:var(--text3);margin-top:14px">GastoCerto · v${APP_VERSION}</div>`);
}

function openSetUsername(){
  openModal(`<div class="modal-title">Nome de usuário</div>
    <p class="modal-note">É assim que você aparece para outras pessoas (ex.: ao compartilhar uma categoria). Único, sem espaços.</p>
    <div class="form-group"><label class="form-label">@usuário</label>
      <input class="form-input" id="f-set-username" maxlength="20" placeholder="ex: rafael" autocomplete="off" oninput="this.value=this.value.toLowerCase().replace(/[^a-z0-9_]/g,'')"/></div>
    <button class="btn-primary" id="btn-set-username" onclick="saveUsername()">Salvar</button>
    <button class="btn-secondary" onclick="openAccountModal()">Cancelar</button>`);
}
async function saveUsername(){
  const u=(document.getElementById('f-set-username').value||'').trim().toLowerCase();
  if(u.length<3){showToast('Use ao menos 3 caracteres.','error');return;}
  if(!/^[a-z0-9_]+$/.test(u)){showToast('Apenas letras minúsculas, números e _.','error');return;}
  const btn=document.getElementById('btn-set-username');btn.disabled=true;btn.textContent='Salvando...';
  try{
    const taken=await api.checkUsername(u);
    if(taken){showToast('Nome de usuário já em uso.','error');btn.disabled=false;btn.textContent='Salvar';return;}
    await api.insertProfile(u);
    myProfile={id:currentUser.id,username:u,email:currentUser.email};
    showToast('Nome de usuário definido!','success');
    openAccountModal();
  }catch(e){showToast('Erro ao salvar: '+String(e?.message||'').slice(0,50),'error');btn.disabled=false;btn.textContent='Salvar';}
}

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

async function init(){
  const hadCache = loadCache();
  if(hadCache){
    render();
    document.getElementById('current-month-label').insertAdjacentHTML('afterend','<span class="sync-dot" id="sync-dot"></span>');
  }
  try{
    const [cats, mons, sub, adminGrants, accShares, myShares, prof, frs] = await Promise.all([
      api.getCategories(), api.getMonths(), api.getSubscription(),
      api.getAdminGrant().catch(()=>[]),
      api.getAcceptedShares().catch(()=>[]),
      api.getMyShares().catch(()=>[]),
      api.getMyProfile().catch(()=>null),
      api.getFriends().catch(()=>[]),
    ]);
    categories=cats; months=mons; subscription=sub; userPlan=resolveUserPlan(sub);
    friends=frs||[];
    if(adminGrants?.length>0) userPlan='pro';
    if(prof) myProfile=prof;
    acceptedShares=accShares||[];
    sharedOutMap=Object.fromEntries((myShares||[]).filter(s=>s.shared_with_user_id).map(s=>[s.shared_with_user_id,s.shared_with_email]));
    const relatedIds=[...new Set([...(myShares||[]).map(s=>s.shared_with_user_id),...(accShares||[]).map(s=>s.shared_by_user_id)].filter(id=>id&&id!==currentUser.id))];
    api.getProfilesByIds(relatedIds).then(rows=>{(rows||[]).forEach(p=>{profilesById[p.id]=p;});render();}).catch(()=>{});
    const [splitInvites, splitMemberships] = await Promise.all([api.getPendingSplitInvites().catch(()=>[]), api.getAcceptedSplitMemberships().catch(()=>[])]);
    pendingSplitInvites=splitInvites||[];
    acceptedGroupIds=new Set((splitMemberships||[]).map(m=>m.group_id));
    const trialDays=sub?.subscription_status==='trialing'?Math.max(0,Math.ceil((new Date(sub.trial_ends_at)-new Date())/86400000)):0;
    const isAdminPro=adminGrants?.length>0;
    updatePlanBadge(isAdminPro,trialDays);
    const now=monthKeyOf(new Date());
    if(!months.find(m=>m.key===now)){ await api.insertMonth({key:now,closed:false}); months=await api.getMonths(); }
    currentMonthKey=now;
    const prevKey=prevMonthKey(now);
    const prevMon=months.find(m=>m.key===prevKey);
    if(prevMon&&!prevMon.closed) api.closeMonth(prevKey).then(()=>{if(prevMon)prevMon.closed=true;}).catch(()=>{});
    if(!hadCache || !months.find(m=>m.key===viewMonthKey)) viewMonthKey=now;
    expenses=await api.getExpenses(viewMonthKey);
    budgetTransfers=await api.getBudgetTransfers(currentMonthKey).catch(()=>[]);
    rollovers=await api.getRollovers(viewMonthKey).catch(()=>[]);
    cards=await api.getCards().catch(()=>[]);
    anchors=await api.getAnchors().catch(()=>[]);
    if(isPlanningOn()) planEntries=await api.getPlanEntries().catch(()=>[]);
    refreshFutureMonths();
    applyAutoRollover();
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
    startUnreadPoll();
  }catch(e){
    document.getElementById('sync-dot')?.remove();
    if(!hadCache){
      document.getElementById('content').innerHTML=`<div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Erro ao conectar.<br><small>${e.message}</small></div></div>`;
    } else {
      showToast('Sem conexão — exibindo dados locais.','error');
    }
  }
}

function badgeHtml(diff){
  if(Math.abs(diff)<0.005) return `<span class="badge ok"><i class="fa-solid fa-check"></i> Na meta</span>`;
  if(diff>0) return `<span class="badge saved"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i> Economizou ${brl(diff)}</span>`;
  return `<span class="badge over"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i> Estourou ${brl(Math.abs(diff))}</span>`;
}

const canvasBlob=canvas=>new Promise(resolve=>canvas.toBlob(resolve,'image/png',.95));
async function shareCategory(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const items=expenses.filter(e=>e.cat_id===catId).sort((a,b)=>b.date.localeCompare(a.date));
  const spent=items.reduce((s,e)=>s+parseFloat(e.value),0),budget=effBudget(cat,viewMonthKey),diff=budget-spent;
  const canvas=document.createElement('canvas'); canvas.width=1080; canvas.height=1920;
  const c=canvas.getContext('2d'); c.fillStyle='#0f0f0f';c.fillRect(0,0,1080,1920);c.fillStyle='#27C892';c.fillRect(0,0,18,1920);
  c.fillStyle='#f0f0f0';c.font='700 72px serif';c.fillText(cat.name,80,150);c.fillStyle='#888';c.font='34px sans-serif';c.fillText(monthLabel(viewMonthKey),80,210);
  c.fillStyle='#1a1a1a';c.beginPath();c.roundRect(70,270,940,290,32);c.fill();c.fillStyle='#888';c.font='28px sans-serif';c.fillText('TOTAL GASTO',110,340);
  c.fillStyle='#f0f0f0';c.font='700 64px sans-serif';c.fillText(brl(spent),110,425);c.fillStyle=diff>=0?'#27C892':'#ff4f4f';c.font='600 28px sans-serif';c.fillText(diff>=0?`Dentro do orçamento · ${brl(diff)} livres`:`Orçamento excedido · ${brl(Math.abs(diff))}`,110,495);
  c.fillStyle='#2a2a2a';c.fillRect(110,520,860,10);c.fillStyle=diff>=0?'#27C892':'#ff4f4f';c.fillRect(110,520,budget?Math.min(860,860*spent/budget):0,10);
  c.fillStyle='#888';c.font='600 27px sans-serif';c.fillText('LANÇAMENTOS',80,650);let y=730;
  for(const item of items.slice(0,12)){c.fillStyle='#f0f0f0';c.font='500 31px sans-serif';c.fillText(String(item.name).slice(0,32),80,y);c.textAlign='right';c.font='600 31px sans-serif';c.fillText(brl(item.value),990,y);c.textAlign='left';c.fillStyle='#555';c.font='24px sans-serif';c.fillText(new Date(item.date+'T12:00').toLocaleDateString('pt-BR'),80,y+42);c.fillRect(80,y+75,910,2);y+=105;}
  if(!items.length){c.fillStyle='#888';c.font='30px sans-serif';c.fillText('Nenhum lançamento neste período.',80,y);}
  if(items.length>12){c.fillStyle='#888';c.font='28px sans-serif';c.fillText(`+ ${items.length-12} lançamentos`,80,y);}
  c.fillStyle='#27C892';c.font='700 42px serif';c.fillText('GastoCerto',80,1810);c.fillStyle='#888';c.font='25px sans-serif';c.fillText('Controle seu dinheiro. Acerte seus planos.',80,1855);
  const blob=await canvasBlob(canvas);if(!blob){showToast('Não foi possível gerar a imagem.','error');return;}
  const safe=cat.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-'),file=new File([blob],`gastocerto-${safe}.png`,{type:'image/png'});
  try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:`${cat.name} · GastoCerto`,files:[file]});return;}}catch(err){if(err.name==='AbortError')return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Imagem salva!','success');
}

async function autoCreateRecurring(){
  try{
    const prevKey=prevMonthKey(currentMonthKey);
    const [prevExps,curExps]=await Promise.all([api.getExpenses(prevKey),api.getExpenses(currentMonthKey)]);
    const recurringPrev=prevExps.filter(e=>e.recurring);
    const installmentPrev=prevExps.filter(e=>e.installment_group&&e.installment_no<e.installment_total);
    if(!recurringPrev.length&&!installmentPrev.length) return;
    let created=false;
    for(const exp of recurringPrev){
      const already=curExps.some(e=>e.recurring&&e.cat_id===exp.cat_id&&e.name===exp.name);
      if(already) continue;
      await api.insertExpense({id:uid(),cat_id:exp.cat_id,month_key:currentMonthKey,name:exp.name,value:exp.value,date:`${currentMonthKey}-01`,recurring:true});
      created=true;
    }
    for(const exp of installmentPrev){
      const already=curExps.some(e=>e.installment_group===exp.installment_group);
      if(already) continue;
      await api.insertExpense({id:uid(),cat_id:exp.cat_id,month_key:currentMonthKey,name:exp.name,value:exp.value,date:`${currentMonthKey}-01`,installment_group:exp.installment_group,installment_no:exp.installment_no+1,installment_total:exp.installment_total});
      created=true;
    }
    if(created){expenses=await api.getExpenses(viewMonthKey);saveCache();render();showToast('Lançamentos recorrentes e parcelas adicionados.','success');}
  }catch{}
}

function openShareCategory(catId){
  const cat=categories.find(c=>c.id===catId);if(!cat)return;
  openModal(`<div class="modal-title">Compartilhar ${escapeHtml(cat.name)}</div>
    <p class="modal-note">Os convidados verão uma notificação no app e poderão aceitar ou recusar. Nenhum e-mail é enviado.</p>
    ${shareFriendRowsHtml()}
    ${friendNote()}
    <button class="btn-primary" id="btn-share-cat" onclick="saveShareCategory('${catId}')">Compartilhar com selecionados</button>
    <button class="btn-secondary" onclick="openManageShares('${catId}')">Ver compartilhamentos atuais</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveShareCategory(catId){
  const cat=categories.find(c=>c.id===catId);if(!cat)return;
  const picks=[...document.querySelectorAll('.share-friend-row')]
    .map(r=>({email:r.querySelector('.share-friend-cb').dataset.email,checked:r.querySelector('.share-friend-cb').checked,permission:r.querySelector('.share-friend-perm').value}))
    .filter(p=>p.checked&&p.email!==currentUser.email.toLowerCase());
  if(!picks.length){showToast('Selecione ao menos um amigo.','error');return;}
  const btn=document.getElementById('btn-share-cat');btn.disabled=true;btn.textContent='Compartilhando...';
  try{
    for(const p of picks){
      await api.insertCategoryShare({category_id:catId,category_name:cat.name,shared_with_email:p.email,permission:p.permission});
    }
    showToast(picks.length>1?'Convites enviados!':'Convite enviado!','success');_closeModal();
  }catch{showToast('Erro ao compartilhar. Verifique se a tabela category_shares existe no Supabase.','error');btn.disabled=false;btn.textContent='Compartilhar com selecionados';}
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

function friendLabel(f){ return f.username?('@'+f.username):f.email; }
function friendInitial(f){ return String(f.username||f.email||'?').charAt(0).toUpperCase(); }
function friendNote(){
  return `<p class="modal-note" style="margin-top:-4px">Não encontrou quem procura? Adicione a pessoa na aba <b>Amigos</b> (no menu inferior) e ela aparecerá aqui para você selecionar.</p>`;
}
function friendsPickerHtml(inputId){
  if(!friends.length) return '';
  const chips=friends.map(f=>`<button type="button" class="friend-chip" onclick="pickFriend('${inputId}','${escapeHtml(f.email)}',this)">${escapeHtml(friendLabel(f))}</button>`).join('');
  return `<div class="form-group"><label class="form-label">Escolha um amigo</label><div class="friend-chip-row">${chips}</div></div>`;
}
function pickFriend(inputId,email,btn){
  const inp=document.getElementById(inputId);
  if(inp) inp.value=email;
  document.querySelectorAll('.friend-chip.active').forEach(c=>c.classList.remove('active'));
  if(btn) btn.classList.add('active');
  vib(5);
}
function friendsCheckboxHtml(){
  if(!friends.length) return `<p class="modal-note">Você ainda não tem amigos na lista.</p>`;
  return `<div class="form-group"><label class="form-label">Selecione os amigos</label>
    <div class="friend-check-list">${friends.map(f=>{
      const sub=f.username?f.email:'';
      return `<label class="friend-check"><input type="checkbox" class="friend-check-cb" data-email="${escapeHtml(f.email)}"/><span class="friend-check-main">${escapeHtml(friendLabel(f))}${sub?`<span class="friend-check-sub">${escapeHtml(sub)}</span>`:''}</span></label>`;
    }).join('')}</div></div>`;
}
function shareFriendRowsHtml(){
  if(!friends.length) return `<p class="modal-note">Você ainda não tem amigos na lista.</p>`;
  return `<div class="form-group"><label class="form-label">Selecione e defina a permissão</label>
    <div class="friend-check-list">${friends.map(f=>`<div class="share-friend-row">
      <label class="friend-check" style="flex:1"><input type="checkbox" class="share-friend-cb" data-email="${escapeHtml(f.email)}"/><span class="friend-check-main">${escapeHtml(friendLabel(f))}</span></label>
      <select class="share-friend-perm" aria-label="Permissão"><option value="view">Ver</option><option value="edit">Editar</option></select>
    </div>`).join('')}</div></div>`;
}
async function openFriends(){
  openModal(`<div class="modal-title">Amigos</div><div class="loading"><div class="spinner"></div></div>`);
  try{ friends=await api.getFriends()||[]; }catch{}
  renderFriendsModal();
}
function friendsListHtml(){
  if(!friends.length) return `<p class="modal-note">Você ainda não adicionou amigos. Adicione alguém abaixo para compartilhar categorias, dividir gastos ou abrir um chat de gastos.</p>`;
  return `<div class="friend-cards">${friends.map(f=>{
    const un=f.friend_user_id?unreadDm[f.friend_user_id]:0;
    return `
    <div class="friend-swipe" data-id="${f.id}">
      <div class="friend-swipe-del"><i class="fa-solid fa-trash" aria-hidden="true"></i><span>Excluir</span></div>
      <div class="friend-card${un?' has-unread':''}" role="button" tabindex="0">
        <div class="friend-avatar">${escapeHtml(friendInitial(f))}</div>
        <div class="friend-card-main">
          <div class="friend-card-name">${escapeHtml(friendLabel(f))}</div>
          <div class="friend-card-sub">${un?`${un} ${un===1?'nova mensagem':'novas mensagens'}`:(f.username?escapeHtml(f.email):'Toque para abrir o chat de gastos')}</div>
        </div>
        <span class="friend-card-go${un?' unread':''}" aria-hidden="true"><i class="fa-solid fa-comment-dollar"></i></span>
      </div>
    </div>`;}).join('')}</div>`;
}
function setupFriendSwipe(){
  document.querySelectorAll('.friend-swipe').forEach(row=>{
    if(row._swipeInit) return; row._swipeInit=true;
    const card=row.querySelector('.friend-card');
    const del=row.querySelector('.friend-swipe-del');
    const id=row.dataset.id;
    const REVEAL=84, OPEN_AT=42;
    let startX=0,startY=0,base=0,cur=0,dragging=false,decided=false,horiz=false,open=false;
    const setX=x=>{ cur=x; card.style.transform=`translateX(${x}px)`; };
    const close=()=>{ open=false; setX(0); };
    card.addEventListener('touchstart',e=>{ startX=e.touches[0].clientX; startY=e.touches[0].clientY; base=open?-REVEAL:0; dragging=true; decided=false; horiz=false; },{passive:true});
    card.addEventListener('touchmove',e=>{
      if(!dragging) return;
      const mx=e.touches[0].clientX-startX, my=e.touches[0].clientY-startY;
      if(!decided){ if(Math.abs(mx)>6||Math.abs(my)>6){ decided=true; horiz=Math.abs(mx)>Math.abs(my); } else return; }
      if(!horiz) return;
      e.preventDefault();
      setX(Math.max(-REVEAL, Math.min(0, base+mx)));
    },{passive:false});
    card.addEventListener('touchend',()=>{
      if(!dragging) return; dragging=false;
      if(horiz){ open=cur<-OPEN_AT; setX(open?-REVEAL:0); }
    });
    card.addEventListener('click',()=>{
      if(open){ close(); return; }
      if(decided&&horiz) return;
      startChat(id);
    });
    del.addEventListener('click',e=>{ e.stopPropagation(); removeFriend(id); });
  });
}
function friendAddHtml(){
  return `<div class="friend-add">
    <div class="friend-add-title"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Adicionar amigo</div>
    <div class="friend-add-row">
      <input class="friend-add-input" id="f-friend-input" placeholder="@usuário ou e-mail" autocomplete="off" maxlength="80" onkeydown="if(event.key==='Enter')saveFriend()"/>
      <button class="friend-add-btn" id="btn-add-friend" onclick="saveFriend()" aria-label="Adicionar amigo"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
    </div>
    <span class="friend-add-hint">Use o nome de usuário (ex: @rafael) ou o e-mail da pessoa.</span>
  </div>`;
}
function renderFriendsModal(){
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Amigos</div>
    <div style="margin-bottom:16px">${friendsListHtml()}</div>
    ${friendAddHtml()}
    <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
  setupFriendSwipe();
}
function renderFriendsPage(el){
  const list=friends.length
    ? `<div class="friend-list-head">Seus amigos · ${friends.length}</div>${friendsListHtml()}`
    : `<div class="friend-empty">
        <i class="fa-solid fa-user-group" aria-hidden="true"></i>
        <div>Você ainda não adicionou amigos.<br>Adicione abaixo para compartilhar categorias, dividir gastos ou abrir um chat de gastos.</div>
      </div>`;
  el.innerHTML=`<div class="split-wrap">
    <div class="split-intro">
      <div class="split-intro-title"><i class="fa-solid fa-user-group" aria-hidden="true"></i> Seus amigos</div>
      <p>Adicione amigos por <strong>@usuário</strong> ou e-mail para compartilhar categorias, criar grupos de divisão e abrir um <strong>chat de gastos 1 a 1</strong> (com saldo e extrato) com cada pessoa.</p>
    </div>
    ${list}
    <div class="friend-add-wrap">${friendAddHtml()}</div>
  </div>`;
  setupFriendSwipe();
}
function friendsViewRefresh(){
  if(document.getElementById('modal-overlay')?.classList.contains('open')&&document.getElementById('modal-content')?.querySelector('#f-friend-input')) renderFriendsModal();
  else if(currentTab==='amigos') render();
}
async function saveFriend(){
  const raw=(document.getElementById('f-friend-input').value||'').trim();
  if(!raw){ showToast('Informe um @usuário ou e-mail.','error'); return; }
  const btn=document.getElementById('btn-add-friend'); const reset=()=>{ btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-plus" aria-hidden="true"></i>'; };
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
  try{
    const isEmail=/^\S+@\S+\.\S+$/.test(raw);
    const found=await api.lookupFriend(raw).catch(()=>[]);
    let email=null, username=null, fid=null;
    if(found&&found.length){ email=found[0].email; username=found[0].username; fid=found[0].id; }
    else if(isEmail){ email=raw.toLowerCase(); }
    else { showToast('Usuário não encontrado. Tente pelo e-mail.','error'); reset(); return; }
    if(email===currentUser.email.toLowerCase()){ showToast('Esse é o seu próprio cadastro.','error'); reset(); return; }
    await api.addFriend(email,username,fid);
    if(fid) api.ensureReverseFriend(fid,currentUser.email,myProfile?.username).catch(()=>{});
    friends=await api.getFriends()||[];
    friendsViewRefresh();
    showToast('Amigo adicionado!','success');
  }catch(e){ showToast('Erro ao adicionar. Verifique se a tabela friends e a função friend_lookup existem.','error'); reset(); }
}
async function removeFriend(id){
  if(!confirm('Remover este amigo da sua lista?')) return;
  try{ await api.deleteFriend(id); friends=friends.filter(f=>f.id!==id); friendsViewRefresh(); showToast('Amigo removido.','success'); }
  catch{ showToast('Erro ao remover.','error'); }
}

async function startChat(friendRowId){
  const f=friends.find(x=>x.id===friendRowId); if(!f) return;
  let uid=f.friend_user_id;
  if(!uid){
    const found=await api.lookupFriend(f.email).catch(()=>[]);
    if(found&&found.length){ uid=found[0].id; f.friend_user_id=uid; api.updateFriend(f.id,{friend_user_id:uid}).catch(()=>{}); }
  }
  if(!uid){ showToast(`${friendLabel(f)} ainda não tem conta no GastoCerto — não dá para conversar.`,'error'); return; }
  if(uid===currentUser.id){ showToast('Esse é você mesmo.','error'); return; }
  api.ensureReverseFriend(uid,currentUser.email,myProfile?.username).catch(()=>{});
  requestNotifPerm();
  openChat(uid,friendLabel(f));
}
function dmBalance(entries,me){
  let bal=0;
  for(const e of entries){
    if(e.type==='expense'){
      const myShare=(e.sender_id===me)?Number(e.share_sender||0):Number(e.share_recipient||0);
      const myPaid=(e.payer_id===me)?Number(e.amount||0):0;
      bal+=myPaid-myShare;
    }else if(e.type==='payment'){
      bal+=(e.payer_id===me)?Number(e.amount||0):-Number(e.amount||0);
    }
  }
  return Math.round(bal*100)/100;
}
function dmBalanceText(bal,label){
  if(Math.abs(bal)<0.005) return {cls:'zero',txt:'Vocês estão quites'};
  if(bal>0) return {cls:'pos',txt:`${label} te deve ${brl(bal)}`};
  return {cls:'neg',txt:`Você deve ${brl(Math.abs(bal))} a ${label}`};
}
function chatEntryHtml(e,me,label,friendId){
  const mine=e.sender_id===me;
  const time=new Date(e.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const del=mine?`<button class="dm-del" onclick="deleteDmEntry('${e.id}','${friendId}','${escapeHtml(label)}')" aria-label="Excluir lançamento"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>`:'';
  if(e.type==='message'){
    return `<div class="dm-row ${mine?'me':'them'}"><div class="dm-bubble">${escapeHtml(e.text||'')}<span class="dm-time">${time}</span></div></div>`;
  }
  if(e.type==='expense'){
    const myShare=mine?Number(e.share_sender||0):Number(e.share_recipient||0);
    const friendShare=mine?Number(e.share_recipient||0):Number(e.share_sender||0);
    const payerName=e.payer_id===me?'Você':escapeHtml(label);
    return `<div class="dm-row ${mine?'me':'them'}"><div class="dm-card expense">
      ${del}
      <div class="dm-card-top"><i class="fa-solid fa-receipt" aria-hidden="true"></i> ${e.text?escapeHtml(e.text):'Gasto'}</div>
      <div class="dm-card-amount">${brl(e.amount)}</div>
      <div class="dm-card-meta">${payerName} pagou · sua parte ${brl(myShare)} · ${escapeHtml(label)} ${brl(friendShare)}</div>
      <span class="dm-time">${time}</span>
    </div></div>`;
  }
  if(e.type==='payment'){
    const fromName=e.payer_id===me?'Você':escapeHtml(label);
    const toName=e.payer_id===me?escapeHtml(label):'Você';
    return `<div class="dm-row ${mine?'me':'them'}"><div class="dm-card payment">
      ${del}
      <div class="dm-card-top"><i class="fa-solid fa-money-bill-transfer" aria-hidden="true"></i> Pagamento</div>
      <div class="dm-card-amount">${brl(e.amount)}</div>
      <div class="dm-card-meta">${fromName} <i class="fa-solid fa-arrow-right" style="font-size:10px"></i> ${toName}</div>
      <span class="dm-time">${time}</span>
    </div></div>`;
  }
  return '';
}
async function deleteDmEntry(id,friendId,label){
  if(!confirm('Excluir este lançamento? O saldo será recalculado.')) return;
  try{
    const res=await api.deleteDm(id);
    if(!res||!res.length){ showToast('Você só pode excluir lançamentos que registrou.','error'); return; }
  }catch{ showToast('Erro ao excluir.','error'); return; }
  vib(8);
  await loadChat(friendId,label);
}
function openChat(friendId,label){
  document.getElementById('dm-chat')?.remove();
  const safe=escapeHtml(label);
  const ov=document.createElement('div');
  ov.id='dm-chat'; ov.className='dm-overlay';
  ov.innerHTML=`<div class="dm-header">
      <button class="dm-back" onclick="closeChat()" aria-label="Voltar"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
      <div class="dm-head-info"><div class="dm-head-name">${safe}</div><div class="dm-head-bal" id="dm-bal">…</div></div>
    </div>
    <div class="dm-body" id="dm-body"><div class="loading"><div class="spinner"></div></div></div>
    <div class="dm-inputbar">
      <button class="dm-add" onclick="dmMenu('${friendId}','${safe}')" aria-label="Registrar gasto ou pagamento"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
      <input id="dm-input" class="dm-text" placeholder="Mensagem…" autocomplete="off" onkeydown="if(event.key==='Enter')sendChatMessage('${friendId}','${safe}')"/>
      <button class="dm-send" onclick="sendChatMessage('${friendId}','${safe}')" aria-label="Enviar"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button>
    </div>`;
  document.body.appendChild(ov);
  fitViewport();
  loadChat(friendId,label);
}
let _dmPoll=null, _dmSig='';
function dmSignature(entries){ return entries.length+':'+(entries.length?entries[entries.length-1].id:'')+':'+entries.reduce((s,e)=>s+(e.type==='message'?0:Number(e.amount||0)),0); }
function renderChatBody(entries,friendId,label,forceScroll){
  const me=currentUser.id;
  const body=document.getElementById('dm-body'); if(!body) return;
  const nearBottom=body.scrollHeight-body.scrollTop-body.clientHeight<90;
  body.innerHTML=entries.length?entries.map(e=>chatEntryHtml(e,me,label,friendId)).join(''):`<div class="dm-empty">Comece a conversar, registre um gasto para dividir ou um pagamento com <b>${escapeHtml(label)}</b>.</div>`;
  const bt=dmBalanceText(dmBalance(entries,me),label);
  const be=document.getElementById('dm-bal'); if(be){ be.textContent=bt.txt; be.className='dm-head-bal '+bt.cls; }
  if(forceScroll||nearBottom) body.scrollTop=body.scrollHeight;
}
async function loadChat(friendId,label){
  let entries=[];
  try{ entries=await api.getDmEntries(friendId)||[]; }
  catch{ const b=document.getElementById('dm-body'); if(b) b.innerHTML=`<div class="dm-empty">Não foi possível carregar. Verifique se a tabela dm_entries existe no Supabase.</div>`; return; }
  _dmSig=dmSignature(entries);
  renderChatBody(entries,friendId,label,true);
  startDmPolling(friendId,label);
  markDmSeen(friendId); delete unreadDm[friendId]; updateAmigosBadge();
}
async function refreshChat(friendId,label){
  if(document.hidden||document.getElementById('dm-sheet')||!document.getElementById('dm-chat')) return;
  let entries;
  try{ entries=await api.getDmEntries(friendId)||[]; }catch{ return; }
  const sig=dmSignature(entries);
  if(sig===_dmSig) return;
  _dmSig=sig;
  renderChatBody(entries,friendId,label,false);
  markDmSeen(friendId); delete unreadDm[friendId]; updateAmigosBadge();
}
function startDmPolling(friendId,label){ stopDmPolling(); _dmPoll=setInterval(()=>refreshChat(friendId,label),5000); }
function stopDmPolling(){ if(_dmPoll){ clearInterval(_dmPoll); _dmPoll=null; } }
function closeChat(){ stopDmPolling(); closeDmSheet(); document.getElementById('dm-chat')?.remove(); }
async function sendChatMessage(friendId,label){
  const inp=document.getElementById('dm-input'); if(!inp) return;
  const text=(inp.value||'').trim(); if(!text) return;
  inp.value='';
  try{ await api.insertDm({recipient_id:friendId,type:'message',text}); }
  catch{ showToast('Erro ao enviar mensagem.','error'); }
  await loadChat(friendId,label);
}
function dmSheet(html){
  closeDmSheet();
  const ov=document.createElement('div');
  ov.id='dm-sheet'; ov.className='dm-sheet-overlay';
  ov.onclick=e=>{ if(e.target===ov) closeDmSheet(); };
  ov.innerHTML=`<div class="dm-sheet"><div class="modal-handle"></div>${html}</div>`;
  document.body.appendChild(ov);
  fitViewport();
  requestAnimationFrame(()=>ov.classList.add('open'));
}
function closeDmSheet(){ document.getElementById('dm-sheet')?.remove(); }
function dmMenu(friendId,label){
  dmSheet(`<div class="modal-title">O que deseja registrar?</div>
    <button class="btn-secondary" onclick="openDmExpenseForm('${friendId}','${escapeHtml(label)}')">Um gasto para dividir</button>
    <button class="btn-secondary" onclick="openDmPaymentForm('${friendId}','${escapeHtml(label)}')">Um pagamento feito</button>
    <button class="btn-secondary" onclick="closeDmSheet()">Cancelar</button>`);
}
function dmSeg(btn){ [...btn.parentElement.children].forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
function dmSegVal(id){ const el=document.querySelector('#'+id+' .dm-seg-btn.active'); return el?el.dataset.v:null; }
function dmSplitMode(mode){
  const c=document.getElementById('dm-custom'); if(!c) return;
  if(mode==='custom'){
    c.hidden=false;
    const total=parseNum(document.getElementById('dm-exp-amount').value)||0;
    const half=Math.round(total/2*100)/100;
    document.getElementById('dm-share-me').value=total?half:'';
    document.getElementById('dm-share-friend').value=total?Math.round((total-half)*100)/100:'';
    dmSplitHint();
  }else{ c.hidden=true; }
}
function dmCustomFill(other){
  const total=parseNum(document.getElementById('dm-exp-amount').value)||0;
  if(total){
    if(other==='friend'){ const me=parseNum(document.getElementById('dm-share-me').value)||0; document.getElementById('dm-share-friend').value=Math.round((total-me)*100)/100; }
    else{ const fr=parseNum(document.getElementById('dm-share-friend').value)||0; document.getElementById('dm-share-me').value=Math.round((total-fr)*100)/100; }
  }
  dmSplitHint();
}
function dmSplitHint(){
  const h=document.getElementById('dm-split-hint'); if(!h) return;
  const total=parseNum(document.getElementById('dm-exp-amount').value)||0;
  const me=parseNum(document.getElementById('dm-share-me').value)||0;
  const fr=parseNum(document.getElementById('dm-share-friend').value)||0;
  const sum=Math.round((me+fr)*100)/100;
  if(Math.abs(sum-total)<0.01){ h.innerHTML='<i class="fa-solid fa-check" aria-hidden="true"></i> Soma confere'; h.style.color='var(--accent-text)'; }
  else{ h.textContent=`Soma ${brl(sum)} de ${brl(total)}`; h.style.color='var(--red)'; }
}
function dmSplitRecalc(){ const c=document.getElementById('dm-custom'); if(c&&!c.hidden) dmSplitMode('custom'); }
function openDmExpenseForm(friendId,label){
  const safe=escapeHtml(label);
  dmSheet(`<div class="modal-title">Registrar gasto</div>
    <div class="form-group"><label class="form-label">Descrição</label><input class="form-input" id="dm-exp-desc" placeholder="Ex: Jantar, Uber…" maxlength="80" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Valor total (R$)</label><input class="form-input" id="dm-exp-amount" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this);dmSplitRecalc()"/></div>
    <div class="form-group"><label class="form-label">Quem pagou?</label>
      <div class="dm-seg" id="dm-payer"><button type="button" class="dm-seg-btn active" data-v="me" onclick="dmSeg(this)">Você</button><button type="button" class="dm-seg-btn" data-v="friend" onclick="dmSeg(this)">${safe}</button></div></div>
    <div class="form-group"><label class="form-label">Como dividir?</label>
      <div class="dm-seg" id="dm-split"><button type="button" class="dm-seg-btn active" data-v="half" onclick="dmSeg(this);dmSplitMode('half')">50 / 50</button><button type="button" class="dm-seg-btn" data-v="custom" onclick="dmSeg(this);dmSplitMode('custom')">Personalizado</button></div></div>
    <div id="dm-custom" hidden>
      <div class="dm-split-row"><span>Sua parte</span><input class="form-input dm-share" id="dm-share-me" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this);dmCustomFill('friend')"/></div>
      <div class="dm-split-row"><span>${safe}</span><input class="form-input dm-share" id="dm-share-friend" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this);dmCustomFill('me')"/></div>
      <div class="dm-split-hint" id="dm-split-hint"></div>
    </div>
    <button class="btn-primary" id="dm-exp-save" onclick="saveDmExpense('${friendId}','${safe}')">Salvar gasto</button>
    <button class="btn-secondary" onclick="closeDmSheet()">Cancelar</button>`);
}
async function saveDmExpense(friendId,label){
  const amount=Math.round((parseNum(document.getElementById('dm-exp-amount').value)||0)*100)/100;
  const desc=(document.getElementById('dm-exp-desc').value||'').trim();
  if(!(amount>0)){ showToast('Informe um valor válido.','error'); return; }
  const payer=dmSegVal('dm-payer');
  const mode=dmSegVal('dm-split');
  let shareMe,shareFriend;
  if(mode==='custom'){
    shareMe=Math.round((parseNum(document.getElementById('dm-share-me').value)||0)*100)/100;
    shareFriend=Math.round((parseNum(document.getElementById('dm-share-friend').value)||0)*100)/100;
    if(Math.abs((shareMe+shareFriend)-amount)>0.02){ showToast('A soma das partes deve ser igual ao total.','error'); return; }
  }else{ shareMe=Math.round(amount/2*100)/100; shareFriend=Math.round((amount-shareMe)*100)/100; }
  const payer_id=payer==='me'?currentUser.id:friendId;
  const btn=document.getElementById('dm-exp-save'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    await api.insertDm({recipient_id:friendId,type:'expense',amount,payer_id,share_sender:shareMe,share_recipient:shareFriend,text:desc||null});
    closeDmSheet(); vib(12); await loadChat(friendId,label);
  }catch{ showToast('Erro ao salvar gasto. Verifique a tabela dm_entries.','error'); btn.disabled=false; btn.textContent='Salvar gasto'; }
}
function openDmPaymentForm(friendId,label){
  const safe=escapeHtml(label);
  dmSheet(`<div class="modal-title">Registrar pagamento</div>
    <p class="modal-note">Use quando alguém paga o outro para acertar o saldo.</p>
    <div class="form-group"><label class="form-label">Quem pagou?</label>
      <div class="dm-seg dm-seg-col" id="dm-pay-dir"><button type="button" class="dm-seg-btn active" data-v="me" onclick="dmSeg(this)">Você pagou ${safe}</button><button type="button" class="dm-seg-btn" data-v="friend" onclick="dmSeg(this)">${safe} pagou você</button></div></div>
    <div class="form-group"><label class="form-label">Valor (R$)</label><input class="form-input" id="dm-pay-amount" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this)"/></div>
    <button class="btn-primary" id="dm-pay-save" onclick="saveDmPayment('${friendId}','${safe}')">Registrar pagamento</button>
    <button class="btn-secondary" onclick="closeDmSheet()">Cancelar</button>`);
}
async function saveDmPayment(friendId,label){
  const amount=Math.round((parseNum(document.getElementById('dm-pay-amount').value)||0)*100)/100;
  if(!(amount>0)){ showToast('Informe um valor válido.','error'); return; }
  const payer_id=dmSegVal('dm-pay-dir')==='me'?currentUser.id:friendId;
  const btn=document.getElementById('dm-pay-save'); btn.disabled=true; btn.textContent='Registrando...';
  try{
    await api.insertDm({recipient_id:friendId,type:'payment',amount,payer_id});
    closeDmSheet(); vib(12); await loadChat(friendId,label);
  }catch{ showToast('Erro ao registrar pagamento.','error'); btn.disabled=false; btn.textContent='Registrar pagamento'; }
}

async function respondToShare(shareId,accept){
  const share=pendingShares.find(s=>s.id===shareId);
  try{
    await api.updateCategoryShare(shareId,{status:accept?'accepted':'declined',shared_with_user_id:accept?currentUser.id:null});
    pendingShares=pendingShares.filter(s=>s.id!==shareId);
    if(accept){
      const [cats, accShares] = await Promise.all([api.getCategories(), api.getAcceptedShares().catch(()=>acceptedShares)]);
      categories=cats; acceptedShares=accShares||[];
      expenses=await api.getExpenses(viewMonthKey);
      const ownerIds=[...new Set((accShares||[]).map(s=>s.shared_by_user_id).filter(id=>id&&id!==currentUser.id&&!profilesById[id]))];
      if(ownerIds.length) api.getProfilesByIds(ownerIds).then(rows=>{(rows||[]).forEach(p=>{profilesById[p.id]=p;});render();}).catch(()=>{});
      saveCache();
      showToast(`"${share?.category_name||'Categoria'}" já está no seu app!`,'success');
    }else{
      showToast('Convite recusado.','');
    }
    render();
  }catch{showToast('Erro ao responder ao convite.','error');}
}

async function respondToSplitInvite(memberId, accept){
  const inv=pendingSplitInvites.find(i=>i.id===memberId);
  try{
    if(accept){
      await api.updateSplitMember(memberId,{status:'accepted',user_id:currentUser.id});
      acceptedGroupIds.add(inv?.group_id);
      showToast(`Você entrou no grupo "${inv?.split_groups?.name||'Divisão'}"!`,'success');
    }else{
      await api.updateSplitMember(memberId,{status:'declined'});
      showToast('Convite recusado.','');
    }
    pendingSplitInvites=pendingSplitInvites.filter(i=>i.id!==memberId);
    render();
  }catch{showToast('Erro ao responder ao convite.','error');}
}

async function loadPendingShares(){
  try{
    const [shares, splitInvites, splitMemberships]=await Promise.all([
      api.getPendingShares().catch(()=>[]),
      api.getPendingSplitInvites().catch(()=>[]),
      api.getAcceptedSplitMemberships().catch(()=>[]),
    ]);
    pendingShares=shares||[];
    pendingSplitInvites=splitInvites||[];
    acceptedGroupIds=new Set((splitMemberships||[]).map(m=>m.group_id));
    if((pendingShares.length>0||pendingSplitInvites.length>0)&&currentTab==='home') render();
  }catch{}
}

function render(){
  document.getElementById('current-month-label').textContent=monthLabel(viewMonthKey);
  const isNow=viewMonthKey===currentMonthKey;
  document.getElementById('fab').style.display=(currentTab==='home'||currentTab==='categorias')?'flex':'none';
  const el=document.getElementById('content');
  if(currentTab!=='historico') document.body.classList.remove('plan-wide');
  if(currentTab==='home') renderHome(el);
  else if(currentTab==='categorias') renderCategorias(el);
  else if(currentTab==='historico') renderHistorico(el);
  else if(currentTab==='amigos') renderFriendsPage(el);
  else renderSplit(el);
  fitViewport();
}

function renderHome(el){
  const isNow=viewMonthKey===currentMonthKey;
  const mdata=months.find(m=>m.key===viewMonthKey);

  const pendingSharesHtml=pendingShares.length>0?`<div style="padding:8px 20px 0;display:flex;flex-direction:column;gap:8px">${pendingShares.map(s=>`<div class="share-notification"><div style="font-weight:600;font-size:13px;margin-bottom:3px"><i class="fa-solid fa-share-nodes" style="margin-right:6px;color:var(--accent)" aria-hidden="true"></i>Convite de categoria</div><div style="font-size:12px;color:var(--text2);margin-bottom:10px">Você recebeu acesso à categoria <strong>${escapeHtml(s.category_name||'desconhecida')}</strong></div><div style="display:flex;gap:8px"><button onclick="respondToShare('${s.id}',true)" style="flex:1;padding:8px;border-radius:8px;border:none;background:var(--accent);color:var(--on-accent);font:700 12px 'DM Sans',sans-serif;cursor:pointer">Aceitar</button><button onclick="respondToShare('${s.id}',false)" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text2);font:500 12px 'DM Sans',sans-serif;cursor:pointer">Recusar</button></div></div>`).join('')}</div>`:'';

  const pendingSplitHtml=pendingSplitInvites.length>0?`<div style="padding:8px 20px 0;display:flex;flex-direction:column;gap:8px">${pendingSplitInvites.map(inv=>`<div class="share-notification"><div style="font-weight:600;font-size:13px;margin-bottom:3px"><i class="fa-solid fa-user-group" style="margin-right:6px;color:var(--accent)" aria-hidden="true"></i>Convite de divisão</div><div style="font-size:12px;color:var(--text2);margin-bottom:10px">Você foi convidado para o grupo <strong>${escapeHtml(inv.split_groups?.name||'Divisão')}</strong></div><div style="display:flex;gap:8px"><button onclick="respondToSplitInvite('${inv.id}',true)" style="flex:1;padding:8px;border-radius:8px;border:none;background:var(--accent);color:var(--on-accent);font:700 12px 'DM Sans',sans-serif;cursor:pointer">Aceitar</button><button onclick="respondToSplitInvite('${inv.id}',false)" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--text2);font:500 12px 'DM Sans',sans-serif;cursor:pointer">Recusar</button></div></div>`).join('')}</div>`:'';

  const _unread=unreadTotal();
  const unreadHtml=_unread>0?`<div style="padding:8px 20px 0"><div class="share-notification" onclick="switchTab('amigos')" style="cursor:pointer;display:flex;align-items:center;gap:12px"><span style="width:38px;height:38px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fa-solid fa-comment-dollar" aria-hidden="true"></i></span><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:13px">Novas mensagens</div><div style="font-size:12px;color:var(--text2)">Você tem ${_unread} ${_unread===1?'nova mensagem':'novas mensagens'}. Toque para abrir Amigos.</div></div><i class="fa-solid fa-chevron-right" style="color:var(--text3);font-size:12px" aria-hidden="true"></i></div></div>`:'';

  if(categories.length===0){
    el.innerHTML=`<div style="padding:16px 20px">${pendingSharesHtml}${pendingSplitHtml}${unreadHtml}
      <div class="welcome-card">
        <div class="welcome-emoji"><i class="fa-solid fa-seedling" aria-hidden="true"></i></div>
        <div class="welcome-title">Vamos organizar seus gastos</div>
        <div class="welcome-copy">Crie sua primeira categoria — tipo <strong>Mercado</strong>, <strong>Transporte</strong> ou <strong>Lazer</strong> — e defina quanto pretende gastar por mês.</div>
        <button class="btn-primary" onclick="openAddCategory()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Criar categoria</button>
      </div></div>`;
    return;
  }
  if(currentCatIdx>=homeCategories().length) currentCatIdx=0;

  const days=trialDaysRemaining();
  const trialBannerHtml=days>0&&days<=3?`<div style="padding:8px 20px 0"><div class="trial-banner" style="margin:0"><span>Seu acesso completo termina em <strong>${days} ${days===1?'dia':'dias'}</strong>.</span><button onclick="openPaywall('Continue com seus relatórios')">Ver Pro</button></div></div>`:'';

  const isPast=viewMonthKey<currentMonthKey;
  const rolloverBannerHtml=isPast?`<div style="padding:8px 20px 0"><div class="trial-banner" style="margin:0;border-color:var(--accent-line);background:var(--accent-soft)"><span>Mês encerrado. Levar as sobras e estouros para <strong>${monthLabel(nextMonthKey(viewMonthKey))}</strong>?</span><button onclick="openRolloverMonth()">Levar</button></div></div>`:'';

  const homeCats=homeCategories();
  const slidesHtml = homeCats.map((cat,i)=>buildSlide(cat,isNow)).join('');

  el.innerHTML=`<div id="home-content" style="display:flex;flex-direction:column;height:100%">
    ${pendingSharesHtml}
    ${pendingSplitHtml}
    ${unreadHtml}
    ${rolloverBannerHtml}
    ${trialBannerHtml}
    <div class="cat-chips" id="cat-chips">
      ${homeCats.map((c,i)=>`<button class="cat-chip${i===currentCatIdx?' active':''}" data-i="${i}" onclick="goToSlide(${i})">${escapeHtml(c.name)}</button>`).join('')}
    </div>
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
  const isOwned=cat.user_id===currentUser.id;
  const sharedWith=!isOwned;
  const perm=isOwned?'owner':sharePerm(cat.id);
  const canEdit=isOwned||perm==='edit';

  const expHtml=catExps.map(e=>{
    const byOther=e.user_id&&e.user_id!==currentUser.id;
    const tag=byOther?userTag(e.user_id):null;
    const byLabel=byOther?`<span style="font-size:10px;color:var(--accent-text);background:var(--accent-soft);border-radius:100px;padding:1px 7px;margin-left:5px;white-space:nowrap;display:inline-block">por ${escapeHtml(tag||'parceiro')}</span>`:'';
    const actions=canEdit?`<div class="expense-actions">
        <div class="exp-btn" onclick="openEditExpense('${e.id}')"><i class="fa-solid fa-pen" aria-label="Editar"></i></div>
        <div class="exp-btn" style="border-color:var(--red-soft);color:var(--red)" onclick="confirmDeleteExpense('${e.id}')"><i class="fa-solid fa-trash" aria-label="Excluir"></i></div>
      </div>`:'';
    return `<div class="expense-item">
    <div class="expense-left">
      <div class="expense-name">${e.recurring?`<i class="fa-solid fa-arrows-rotate" style="font-size:10px;color:var(--accent-text);margin-right:5px" title="Recorrente" aria-hidden="true"></i>`:''}${e.installment_total?`<i class="fa-solid fa-credit-card" style="font-size:10px;color:var(--accent-text);margin-right:5px" title="Cartão" aria-hidden="true"></i>`:''}${escapeHtml(e.name)}${e.installment_total>1?`<span style="font-size:10px;color:var(--text3);font-weight:600;margin-left:5px">(${e.installment_no}/${e.installment_total})</span>`:''}${e.card_id&&cardLabel(e.card_id)?`<span style="font-size:10px;color:var(--text2);background:var(--surface2);border-radius:100px;padding:1px 7px;margin-left:5px;white-space:nowrap;display:inline-block">${escapeHtml(cardLabel(e.card_id))}</span>`:''}${byLabel}${e.image_url?`<span class="exp-receipt-dot" onclick="event.stopPropagation();viewReceipt('${e.id}')" title="Ver comprovante"><i class="fa-solid fa-image" aria-hidden="true"></i></span>`:''}${e.notes?`<span class="exp-receipt-dot" onclick="event.stopPropagation();openExpenseNote('${e.id}')" title="Ver observações"><i class="fa-solid fa-barcode" aria-hidden="true"></i></span>`:''}</div>
      <div class="expense-date">${new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
    </div>
    <div class="expense-right">
      <div class="expense-value">${brl(e.value)}</div>
      ${actions}
    </div>
  </div>`;
  }).join('');

  const transfersOut=isNow?budgetTransfers.filter(t=>t.from_cat_id===cat.id):[];
  const transfersIn=isNow?budgetTransfers.filter(t=>t.to_cat_id===cat.id):[];
  const catRolls=rollovers.filter(r=>r.cat_id===cat.id&&r.to_month===viewMonthKey);
  const rolloverHtml=catRolls.map(r=>{
    const amt=parseFloat(r.amount||0), pos=amt>=0;
    return `<div class="expense-item">
      <div class="expense-left">
        <div class="expense-name"><i class="fa-solid fa-arrow-right-arrow-left fa-rotate-90" style="font-size:10px;color:${pos?'var(--accent-text)':'var(--red)'};margin-right:5px" aria-hidden="true"></i>${pos?'Sobra do mês anterior':'Estouro do mês anterior'}</div>
        <div class="expense-date">Vindo de <strong>${monthLabel(r.from_month)}</strong>${r.auto?' · automático':''}</div>
      </div>
      <div class="expense-right"><div class="expense-value" style="color:${pos?'var(--accent-text)':'var(--red)'}">${pos?'+':'-'}${brl(Math.abs(amt))}</div></div>
    </div>`;
  }).join('');
  const transferHtml=[
    ...transfersOut.map(t=>{
      const toName=escapeHtml(categories.find(c=>c.id===t.to_cat_id)?.name||'outra categoria');
      return `<div class="expense-item">
        <div class="expense-left">
          <div class="expense-name"><i class="fa-solid fa-right-left" style="font-size:10px;color:var(--red);margin-right:5px" aria-hidden="true"></i>Limite transferido</div>
          <div class="expense-date">Enviado para <strong>${toName}</strong></div>
        </div>
        <div class="expense-right"><div class="expense-value" style="color:var(--red)">-${brl(t.amount)}</div></div>
      </div>`;
    }),
    ...transfersIn.map(t=>{
      const fromName=escapeHtml(categories.find(c=>c.id===t.from_cat_id)?.name||'outra categoria');
      return `<div class="expense-item">
        <div class="expense-left">
          <div class="expense-name"><i class="fa-solid fa-right-left" style="font-size:10px;color:var(--accent-text);margin-right:5px" aria-hidden="true"></i>Limite recebido</div>
          <div class="expense-date">Vindo de <strong>${fromName}</strong></div>
        </div>
        <div class="expense-right"><div class="expense-value" style="color:var(--accent-text)">+${brl(t.amount)}</div></div>
      </div>`;
    })
  ].join('');

  const sharedBadge=sharedWith?`<div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--accent-text);background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:100px;padding:3px 10px;margin-bottom:10px"><i class="fa-solid ${perm==='edit'?'fa-pen-to-square':'fa-eye'}" aria-hidden="true"></i> ${perm==='edit'?'Compartilhada · pode editar':'Compartilhada · somente leitura'}</div>`:'';

  const status=isOver?'over':isWarn?'warn':'ok';
  const pctLabel=budget>0?Math.round((spent/budget)*100):0;
  const heroLabel=available>=0?'Disponível':'Acima do orçamento';
  const heroValue=available>=0?brl(available):brl(Math.abs(available));

  return `<div class="cat-slide">
    <div class="cat-hero ${status}">
      ${sharedBadge}
      <div class="hero-top">
        <div class="hero-label">${heroLabel}</div>
        <div style="display:flex;gap:6px">
          ${isNow&&isOwned&&categories.filter(c=>c.user_id===currentUser.id).length>1?`<button class="hero-edit" onclick="openTransferBudget('${cat.id}')" title="Transferir limite para outra categoria"><i class="fa-solid fa-right-left" aria-hidden="true"></i></button>`:''}
          ${isNow&&isOwned?`<button class="hero-edit" onclick="openMonthOverride('${cat.id}')" title="Ajustar orçamento"><i class="fa-solid fa-sliders" aria-hidden="true"></i></button>`:''}
        </div>
      </div>
      <div class="hero-amount ${available>=0?'pos':'neg'}">${heroValue}</div>
      <div class="hero-bar"><span style="width:${pct}%"></span></div>
      <div class="hero-sub">
        <span>Gasto <strong>${brl(spent)}</strong></span>
        <span>${pctLabel}% de ${brl(budget)}${overridden?' ·&nbsp;ajustado':''}</span>
      </div>
      ${forecast?`<div class="hero-forecast"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${forecast}</div>`:''}
    </div>

    <div class="exp-head">
      <span class="section-label" style="margin:0">Lançamentos${catExps.length?` · ${catExps.length}`:''}</span>
      <button class="act-log-btn" onclick="openActivityLog('${cat.id}')" title="Histórico de atividades" aria-label="Histórico de atividades"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i></button>
    </div>
    ${(catExps.length||transferHtml||rolloverHtml)?`<div class="exp-list">${rolloverHtml}${transferHtml}${expHtml}</div>`:`<div class="exp-empty"><i class="fa-regular fa-receipt" aria-hidden="true"></i><span>Nenhum gasto ${isNow?'este mês':'neste período'}.</span></div>`}

    ${isOwned?`<div class="cat-actions">
      <button class="ghost-btn" onclick="openShareCategory('${cat.id}')"><i class="fa-solid fa-user-plus" aria-hidden="true"></i> Compartilhar</button>
      <button class="ghost-btn" onclick="shareCategory('${cat.id}')"><i class="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i> Exportar</button>
    </div>`:''}
  </div>`;
}

function sharePerm(catId){ const s=acceptedShares.find(x=>x.category_id===catId); return s?.permission||'view'; }

function closeMonthBtnHtml(){
  return `<button class="close-month-btn" onclick="openCloseMonth()">
    <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
    Fechar Mês e Abrir Próximo
  </button>`;
}

function goToSlide(i){
  if(i<0||i>=homeCategories().length) return;
  vib(5);
  currentCatIdx=i;
  const carousel=document.getElementById('cat-carousel');
  if(carousel) carousel.style.transform=`translateX(-${i*100}%)`;
  document.querySelectorAll('.cat-chip').forEach((c,j)=>{
    const on=j===i; c.classList.toggle('active',on);
    if(on) c.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
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

function renderCategorias(el){
  if(categories.length===0){
    el.innerHTML=`<div class="cat-list"><div class="empty"><div class="empty-icon"><i class="fa-regular fa-folder-open"></i></div><div class="empty-text">Nenhuma categoria ainda.</div></div></div>`;
    return;
  }
  const totalBudget=categories.reduce((s,c)=>s+parseFloat(c.budget||0),0);
  const totalHtml=`<div class="cat-total-card">
    <span class="cat-total-label"><i class="fa-solid fa-wallet" aria-hidden="true"></i> Orçamento total · ${categories.length} ${categories.length===1?'categoria':'categorias'}</span>
    <span class="cat-total-value">${brl(totalBudget)}/mês</span>
  </div>`;
  el.innerHTML=`<div class="cat-list" id="cat-list">
    ${totalHtml}
    ${categories.map(cat=>{
      const owned=cat.user_id===currentUser.id;
      const perm=owned?'owner':sharePerm(cat.id);
      return `
    <div class="cat-manage-item" ${owned?'draggable="true"':''} data-id="${cat.id}" id="cmi-${cat.id}">
      ${owned?'<div class="drag-handle" title="Arrastar"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></div>':'<div class="drag-handle" style="opacity:.25;cursor:default" title="Compartilhada"><i class="fa-solid fa-grip-vertical" aria-hidden="true"></i></div>'}
      <div class="cat-manage-info">
        <div class="cat-manage-name">${escapeHtml(cat.name)}${!owned?`<span style="font-size:10px;color:var(--accent-text);background:var(--accent-soft);border-radius:100px;padding:1px 7px;margin-left:6px;font-weight:600">${perm==='edit'?'editar':'leitura'}</span>`:''}</div>
        <div class="cat-manage-budget">${brl(cat.budget)}/mês${cat.group_name?` · ${escapeHtml(cat.group_name)}`:''}${cat.show_home===false?' · <i class="fa-solid fa-eye-slash" title="Não aparece no Início" aria-hidden="true"></i> só no plano':''}${isPlanningOn()&&cat.show_plan===false?' · fora do plano':''}</div>
      </div>
      <div style="display:flex;gap:8px">
        ${owned?`<div class="icon-btn" onclick="openEditCategory('${cat.id}')"><i class="fa-solid fa-pen" aria-label="Editar"></i></div>`:''}
        <div class="icon-btn" style="border-color:var(--red-soft);color:var(--red)" onclick="confirmDeleteCategory('${cat.id}')"><i class="fa-solid ${owned?'fa-trash':'fa-link-slash'}" aria-label="${owned?'Excluir':'Remover acesso'}"></i></div>
      </div>
    </div>`;}).join('')}
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
    const owned=categories.filter(c=>c.user_id===currentUser.id);
    await Promise.all(owned.map((c,i)=>api.updateCategory(c.id,{position:i})));
    saveCache();
    showToast('Ordem salva!','success');
  }catch{ showToast('Erro ao salvar ordem.','error'); }
  renderCategorias(document.getElementById('content'));
}

async function renderPlanning(el){
  el.innerHTML=`<div class="plan-wrap">${histSegHtml()}<div class="loading"><div class="spinner"></div>Montando projeção...</div></div>`;
  let allExps=[];
  try{ allExps=await api.getExpensesFrom(projectionStart())||[]; }catch{}
  const n=planHorizonMonths();
  const rows=projectMonths(n,projectionStart(),allExps);
  const shown=planScale==='year'?aggregateByYear(rows):rows;
  const last=rows[rows.length-1];
  const first=rows[0];
  const hojeRow=rows.find(r=>r.mk===currentMonthKey)||first;
  el.innerHTML=`<div class="plan-wrap">
    ${histSegHtml()}
    ${!planEntries.some(e=>e.kind==='in')?`<div class="plan-warn"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Cadastre seu salario em <strong>Sua conta › Meus compromissos</strong> para o saldo projetado fazer sentido.</div>`:''}
    <div class="plan-head">
      <div>
        <div class="plan-head-label">Saldo hoje · ${monthLabel(hojeRow.mk)}</div>
        <div class="plan-head-value">${brl(hojeRow.saldoRealizado)}</div>
        <div class="plan-head-sub">projetado para o fim do mes ${brl(hojeRow.saldoFim)}</div>
      </div>
      <button class="plan-head-btn" onclick="openBalanceAnchor('${hojeRow.mk}')"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Ajustar</button>
    </div>
    <div class="plan-controls">
      <div class="dm-seg" style="flex:1">
        <button type="button" class="dm-seg-btn${planView==='stmt'?' active':''}" onclick="setPlanView('stmt')">Extrato</button>
        <button type="button" class="dm-seg-btn${planView==='table'?' active':''}" onclick="setPlanView('table')">Tabela</button>
      </div>
      ${planView==='table'?`<div class="dm-seg" style="flex:1">
        <button type="button" class="dm-seg-btn${planScale==='month'?' active':''}" onclick="setPlanScale('month')">Mensal</button>
        <button type="button" class="dm-seg-btn${planScale==='year'?' active':''}" onclick="setPlanScale('year')">Anual</button>
      </div>`:''}
      <select class="form-input plan-horizon" onchange="setPlanUntil(this.value)">
        ${planYearOptions()}
      </select>
    </div>
    <div class="plan-two">
      <div class="plan-two-box"><div class="plan-two-lbl">Projetado em ${planScale==='year'?last.mk.split('-')[0]:monthLabel(last.mk)}</div><div class="plan-two-val ${last.saldoFim>=0?'pos':'neg'}">${brl(last.saldoFim)}</div></div>
      <div class="plan-two-box"><div class="plan-two-lbl">Realizado em ${monthLabel(rows[0].mk)}</div><div class="plan-two-val ${rows[0].saldoRealizado>=0?'pos':'neg'}">${brl(rows[0].saldoRealizado)}</div></div>
    </div>
    ${planView==='stmt'?planStatementHtml(rows):`${planCardsHtml(shown)}${planTableHtml(shown)}`}
  </div>`;
}
function planStatementHtml(rows){
  const win=rows.slice(0,planStmtMonths);
  const body=win.map(r=>{
    const evs=[];
    planEntries.filter(e=>e.kind==='in'&&entryAppliesTo(e,r.mk)).forEach(e=>{
      evs.push({day:e.due_day||1,name:e.name,val:entryValueFor(e,r.mk),kind:'in',id:e.id,mk:r.mk});
    });
    Object.keys(r.porCategoria).forEach(cid=>{
      const pc=r.porCategoria[cid];
      pc.itens.forEach(it=>evs.push({day:it.dueDay||1,name:it.name,val:-it.value,kind:'out',
        itemId:it.itemId,paid:it.paid,expenseId:it.expenseId,barcode:it.barcode,inst:it.inst,mk:r.mk}));
      pc.avulsos.forEach(a=>evs.push({day:1,name:a.name,val:-a.value,kind:'out',paid:a.paid,fixed:true,mk:r.mk}));
      if(!pc.driven&&pc.val>0){
        const rest=Math.round((pc.val-pc.pago)*100)/100;
        if(rest>0.004) evs.push({day:28,name:`${pc.name} (previsto)`,val:-rest,kind:'est',fixed:true,mk:r.mk});
      }
    });
    evs.sort((a,b)=>a.day-b.day||(b.kind==='in')-(a.kind==='in'));
    let run=r.saldoIni;
    const lines=evs.map(ev=>{
      run=Math.round((run+ev.val)*100)/100;
      const act=ev.itemId?`<button class="pay-chk${ev.paid?' on':''}" onclick="togglePlannedPaid('${ev.itemId}','${ev.mk}',${ev.expenseId?`'${ev.expenseId}'`:'null'})" title="${ev.paid?'Desmarcar':'Marcar como pago'}"><i class="fa-solid fa-${ev.paid?'check':'circle-notch'}" aria-hidden="true"></i></button>`:'<span class="stmt-nodot"></span>';
      const bc=ev.barcode?`<button class="stmt-bar" onclick="copyPlanBarcode('${ev.itemId}')" title="Copiar codigo de barras"><i class="fa-solid fa-barcode" aria-hidden="true"></i></button>`:'';
      return `<div class="stmt-line${ev.paid?' paid':''}${ev.kind==='est'?' est':''}">
        <span class="stmt-day">${String(ev.day).padStart(2,'0')}</span>
        <span class="stmt-name">${act}${escapeHtml(ev.name)}${ev.inst?`<span class="stmt-inst">${ev.inst}</span>`:''}${bc}</span>
        <span class="stmt-val ${ev.val>=0?'pos':'neg'}">${ev.val>=0?'+':''}${brl(Math.abs(ev.val))}</span>
        <span class="stmt-run">${brl(run)}</span>
      </div>`;
    }).join('');
    return `<div class="stmt-month">
      <div class="stmt-head"><span>${monthLabel(r.mk)}</span><span class="${r.saldoFim>=0?'pos':'neg'}">${brl(r.saldoFim)}</span></div>
      ${lines||'<div class="stmt-empty">Nada previsto neste mes.</div>'}
    </div>`;
  }).join('');
  const more=rows.length>planStmtMonths?`<button class="btn-secondary" onclick="planStmtMore()">Carregar mais meses</button>`:'';
  return `<div class="stmt-wrap">${body}${more}</div>`;
}
function planStmtMore(){ planStmtMonths+=12; render(); }
async function copyPlanBarcode(id){
  const e=planEntries.find(x=>x.id===id); if(!e||!e.barcode) return;
  let ok=false;
  try{ await navigator.clipboard.writeText(e.barcode); ok=true; }
  catch{
    try{ const ta=document.createElement('textarea'); ta.value=e.barcode;
      ta.style.cssText='position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
      ok=document.execCommand('copy'); ta.remove(); }catch{}
  }
  vib(8); showToast(ok?'Codigo copiado!':'Nao foi possivel copiar.',ok?'success':'error');
}
function setPlanScale(v){ planScale=v; vib(5); render(); }
function planTargetYear(){
  const cy=parseInt(projectionStart().split('-')[0],10);
  return planUntilYear&&planUntilYear>=cy?planUntilYear:cy+1;
}
function planHorizonMonths(){
  const [sy,sm]=projectionStart().split('-').map(Number);
  return Math.max(1,(planTargetYear()-sy)*12+(12-sm+1));
}
function planYearOptions(){
  const cy=parseInt(projectionStart().split('-')[0],10);
  const tgt=planTargetYear();
  let out='';
  for(let y=cy;y<=cy+20;y++) out+=`<option value="${y}"${y===tgt?' selected':''}>ate ${y}</option>`;
  return out;
}
function setPlanUntil(v){
  planUntilYear=parseInt(v,10)||0;
  if(planHorizonMonths()>24) planScale='year';
  render();
}
function setPlanView(v){ planView=v; vib(5); render(); }
function togglePlanGroup(key){ planOpenGroups[key]=!planOpenGroups[key]; render(); }
function planGroupNames(rows){
  const set=[];
  rows.forEach(r=>Object.keys(r.porGrupo).forEach(g=>{ if(!set.includes(g)) set.push(g); }));
  return set.sort((a,b)=>a===NO_GROUP?1:b===NO_GROUP?-1:a.localeCompare(b));
}
function planCardsHtml(rows){
  return `<div class="proj-cards">${rows.map(r=>{
    const open=!!planOpenGroups[r.mk];
    const label=planScale==='year'?r.mk:monthLabel(r.mk);
    return `<div class="proj-card${r.isPast?' past':''}">
      <div class="proj-card-head" onclick="togglePlanGroup('${r.mk}')">
        <span class="proj-card-month">${label}${r.anchored?' <i class="fa-solid fa-thumbtack" style="font-size:9px;opacity:.7" title="Saldo ajustado"></i>':''}</span>
        <i class="fa-solid fa-chevron-${open?'up':'down'}" style="font-size:11px;color:var(--text3)" aria-hidden="true"></i>
      </div>
      <div class="plan-row"><span>Saldo inicial</span><span>${brl(r.saldoIni)}</span></div>
      <div class="plan-row"><span>+ Receitas</span><span class="pos">${brl(r.receitas)}</span></div>
      <div class="plan-row"><span>− Despesas</span><span class="neg">${brl(r.despesas)}</span></div>
      <div class="plan-row"><span>= Sobra do mês</span><span class="${r.sobra>=0?'pos':'neg'}">${brl(r.sobra)}</span></div>
      <div class="plan-row total"><span>Saldo acumulado</span><span class="${r.saldoFim>=0?'pos':'neg'}">${brl(r.saldoFim)}</span></div>
      ${open?`<div class="plan-groups">${Object.values(r.porCategoria).filter(pc=>pc.val>0||pc.itens.length).map(pc=>{
        const cid=Object.keys(r.porCategoria).find(k=>r.porCategoria[k]===pc);
        return `<div class="plan-row sub"><span>${escapeHtml(pc.name)}</span><span>${brl(pc.val)}</span></div>
        ${pc.itens.map(it=>`<div class="plan-row item"><span><button class="pay-chk${it.paid?' on':''}" onclick="togglePlannedPaid('${it.itemId}','${r.mk}',${it.expenseId?`'${it.expenseId}'`:'null'})"><i class="fa-solid fa-${it.paid?'check':'circle-notch'}" aria-hidden="true"></i></button> ${escapeHtml(it.name)}</span><span class="${it.paid?'paid-val':''}" onclick="editItemMonthValue('${it.itemId}','${r.mk}')">${brl(it.value)}</span></div>`).join('')}`;
      }).join('')}</div>`:''}
    </div>`;
  }).join('')}</div>`;
}
function planTableHtml(rows){
  const groups=planGroupNames(rows);
  const cell=(v,cls)=>`<td class="${cls||''}">${brl(v)}</td>`;
  const owned=categories.filter(c=>c.user_id===currentUser.id);
  return `<div class="plan-table-wrap">
    <table class="plan-table">
      <thead><tr><th class="sticky-col">&nbsp;</th>${rows.map(r=>`<th>${planScale==='year'?r.mk:monthLabel(r.mk)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td class="sticky-col">Saldo inicial</td>${rows.map(r=>cell(r.saldoIni)).join('')}</tr>
        <tr><td class="sticky-col">Receitas</td>${rows.map(r=>cell(r.receitas,'pos')).join('')}</tr>
        ${groups.map(g=>{
          const cats=owned.filter(c=>catGroup(c)===g);
          const merged=cats.length===1&&String(cats[0].name).toLowerCase()===String(g).toLowerCase();
          const open=merged?!!planOpenGroups['c:'+cats[0].id]:!!planOpenGroups['g:'+g];
          const gKey=merged?('c:'+cats[0].id):('g:'+escapeHtml(g).replace(/'/g,''));
          return `<tr class="grp" onclick="togglePlanGroup('${gKey}')">
            <td class="sticky-col"><i class="fa-solid fa-caret-${open?'down':'right'}" style="width:10px" aria-hidden="true"></i> ${escapeHtml(g)}${merged?`<button class="plan-item-btn" onclick="event.stopPropagation();openPlanEntries('${cats[0].id}')" title="Gerenciar compromissos"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button>`:''}</td>
            ${rows.map(r=>cell(r.porGrupo[g]||0,'neg')).join('')}
          </tr>
          ${open&&planScale==='month'?cats.map(c=>{
            const copen=merged?true:!!planOpenGroups['c:'+c.id];
            const itemIds=[];
            rows.forEach(r=>{ const pc=r.porCategoria&&r.porCategoria[c.id];
              if(pc) pc.itens.forEach(it=>{ if(!itemIds.some(x=>x.id===it.itemId)) itemIds.push({id:it.itemId,name:it.name}); }); });
            return `${merged?'':`<tr class="sub cat" onclick="togglePlanGroup('c:${c.id}')">
            <td class="sticky-col"><i class="fa-solid fa-caret-${copen?'down':'right'}" style="width:10px;opacity:${itemIds.length?1:.25}" aria-hidden="true"></i> ${escapeHtml(c.name)}
              <button class="plan-item-btn" onclick="event.stopPropagation();openPlanEntries('${c.id}')" title="Gerenciar compromissos"><i class="fa-solid fa-list-ul" aria-hidden="true"></i></button></td>
            ${rows.map(r=>{
              const pc=r.porCategoria?r.porCategoria[c.id]:null;
              if(!pc) return `<td></td>`;
              const editable=!r.isPast&&!pc.driven;
              return `<td class="${editable?'editable':''}" ${editable?`onclick="event.stopPropagation();editPlanCell('${c.id}','${r.mk}')" title="Clique para planejar"`:''}>${brl(pc.val)}${!pc.driven&&pc.real>0&&pc.real<pc.plan?`<span class="cell-real">${brl(pc.real)} usado</span>`:''}</td>`;
            }).join('')}
          </tr>`}
          ${copen?itemIds.map(ii=>`<tr class="sub item">
            <td class="sticky-col">${escapeHtml(ii.name)}</td>
            ${rows.map(r=>{
              const pc=r.porCategoria?r.porCategoria[c.id]:null;
              const it=pc?pc.itens.find(x=>x.itemId===ii.id):null;
              if(!it) return `<td></td>`;
              return `<td class="item-cell${it.paid?' paid':''}">
                <button class="pay-chk${it.paid?' on':''}" onclick="togglePlannedPaid('${it.itemId}','${r.mk}',${it.expenseId?`'${it.expenseId}'`:'null'})" title="${it.paid?'Marcar como não pago':'Marcar como pago'}"><i class="fa-solid fa-${it.paid?'check':'circle-notch'}" aria-hidden="true"></i></button>
                <span class="item-val" onclick="editItemMonthValue('${it.itemId}','${r.mk}')">${brl(it.value)}</span>
              </td>`;
            }).join('')}
          </tr>`).join(''):''}`;}).join(''):''}`;
        }).join('')}
        <tr class="sep"><td class="sticky-col">Total despesas</td>${rows.map(r=>cell(r.despesas,'neg')).join('')}</tr>
        <tr><td class="sticky-col">Sobra do mês</td>${rows.map(r=>cell(r.sobra,r.sobra>=0?'pos':'neg')).join('')}</tr>
        <tr class="accum"><td class="sticky-col">Saldo acumulado</td>${rows.map(r=>cell(r.saldoFim,r.saldoFim>=0?'pos':'neg')).join('')}</tr>
      </tbody>
    </table>
  </div>`;
}
async function togglePlannedPaid(itemId,mk,expenseId){
  const item=planEntries.find(i=>i.id===itemId); if(!item) return;
  try{
    if(expenseId){
      const res=await api.deleteExpense(expenseId);
      if(!res||!res.length){ showToast('Não foi possível desmarcar.','error'); return; }
      showToast('Desmarcado.','success');
    }else{
      await api.insertExpense({id:uid(),cat_id:item.cat_id,month_key:mk,name:item.name,
        value:entryValueFor(item,mk),date:`${mk}-01`,paid:true,plan_entry_id:item.id,notes:item.barcode||null});
      showToast('Marcado como pago.','success');
    }
    vib(10);
    if(mk===viewMonthKey) expenses=await api.getExpenses(viewMonthKey);
    render();
  }catch(err){
    const msg=String(err?.message||'');
    if(/paid|plan_entry_id/i.test(msg)) showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN paid boolean, ADD COLUMN plan_entry_id uuid','error');
    else showToast('Erro ao atualizar.','error');
  }
}
function editItemMonthValue(itemId,mk){
  const item=planEntries.find(i=>i.id===itemId); if(!item) return;
  openModal(`<div class="modal-title">${escapeHtml(item.name)}</div>
    <p class="modal-note">Valor previsto em <strong>${monthLabel(mk)}</strong>. Muda só neste mês — os outros seguem com o valor padrão de ${brl(item.value)}.</p>
    <div class="form-group"><label class="form-label">Valor em ${monthLabel(mk)} (R$)</label>
      <input class="form-input" id="f-item-mv" type="text" inputmode="decimal" value="${entryValueFor(item,mk)}" oninput="moneyKey(this)"/></div>
    <button class="btn-primary" id="btn-item-mv" onclick="saveItemMonthValue('${itemId}','${mk}')">Salvar</button>
    ${item.month_values&&item.month_values[mk]!=null?`<button class="btn-secondary" onclick="clearItemMonthValue('${itemId}','${mk}')">Voltar ao padrão (${brl(item.value)})</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}
async function saveItemMonthValue(itemId,mk){
  const item=planEntries.find(i=>i.id===itemId); if(!item) return;
  const v=parseNum(document.getElementById('f-item-mv').value);
  if(isNaN(v)||v<0){ showToast('Informe um valor válido.','error'); return; }
  const btn=document.getElementById('btn-item-mv'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    const mv={...(item.month_values||{}),[mk]:v};
    await api.updatePlanEntry(itemId,{month_values:mv});
    item.month_values=mv;
    vib(10); _closeModal(); render(); showToast('Valor atualizado.','success');
  }catch{ btn.disabled=false; btn.textContent='Salvar'; showToast('Erro ao salvar.','error'); }
}
async function clearItemMonthValue(itemId,mk){
  const item=planEntries.find(i=>i.id===itemId); if(!item) return;
  try{
    const mv={...(item.month_values||{})}; delete mv[mk];
    await api.updatePlanEntry(itemId,{month_values:mv});
    item.month_values=mv;
    _closeModal(); render(); showToast('Voltou ao valor padrão.','success');
  }catch{ showToast('Erro ao atualizar.','error'); }
}
function editPlanCell(catId,mk){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const cur=plannedFor(cat,mk);
  openModal(`<div class="modal-title">Planejar ${escapeHtml(cat.name)}</div>
    <p class="modal-note">Quanto você espera gastar em <strong>${monthLabel(mk)}</strong>. O que for lançado vai consumindo esse valor.</p>
    <div class="form-group"><label class="form-label">Valor planejado (R$)</label>
      <input class="form-input" id="f-plan-val" type="text" inputmode="decimal" value="${cur}" oninput="moneyKey(this)"/></div>
    <button class="btn-primary" id="btn-plan-val" onclick="savePlanCell('${catId}','${mk}')">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}
async function savePlanCell(catId,mk){
  const v=parseNum(document.getElementById('f-plan-val').value);
  if(isNaN(v)||v<0){ showToast('Informe um valor válido.','error'); return; }
  const btn=document.getElementById('btn-plan-val'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    if(!months.find(m=>m.key===mk)){ await api.insertMonth({key:mk,closed:false}); months=await api.getMonths(); }
    const m=months.find(x=>x.key===mk);
    const budgets={...(m.budgets||{}),[catId]:v};
    await api.setMonthBudgets(mk,budgets);
    m.budgets=budgets;
    saveCache(); vib(12); _closeModal(); render();
    showToast('Planejamento atualizado.','success');
  }catch{ btn.disabled=false; btn.textContent='Salvar'; showToast('Erro ao salvar.','error'); }
}
function openBalanceAnchor(mk){
  const anc=anchorFor(mk);
  openModal(`<div class="modal-title">Ajustar saldo</div>
    <p class="modal-note">Fixa o saldo geral em <strong>${monthLabel(mk)}</strong>. Use quando um valor pago foi diferente do previsto ou houve gasto fora do app. Os meses seguintes recalculam a partir daqui.</p>
    <div class="form-group"><label class="form-label">Saldo em ${monthLabel(mk)} (R$)</label>
      <input class="form-input" id="f-anchor-val" type="text" inputmode="decimal" value="${anc?anc.balance:''}" placeholder="0,00" oninput="moneyKey(this)"/></div>
    <div class="form-group"><label class="form-label">Observação <span style="color:var(--text3);text-transform:none;letter-spacing:0">(opcional)</span></label>
      <input class="form-input" id="f-anchor-note" maxlength="120" placeholder="Ex: conferido no extrato" value="${anc&&anc.note?escapeHtml(anc.note):''}"/></div>
    <button class="btn-primary" id="btn-anchor" onclick="saveBalanceAnchor('${mk}')">Salvar saldo</button>
    ${anc?`<button class="btn-secondary" onclick="removeBalanceAnchor('${anc.id}')">Remover ajuste</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}
async function saveBalanceAnchor(mk){
  const v=parseNum(document.getElementById('f-anchor-val').value);
  const note=(document.getElementById('f-anchor-note').value||'').trim()||null;
  if(isNaN(v)){ showToast('Informe um valor válido.','error'); return; }
  const btn=document.getElementById('btn-anchor'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    await api.upsertAnchor({month_key:mk,balance:v,note});
    anchors=await api.getAnchors()||[];
    vib(12); _closeModal(); render(); showToast('Saldo ajustado.','success');
  }catch{ btn.disabled=false; btn.textContent='Salvar saldo'; showToast('Erro — confira se a tabela balance_anchors existe no Supabase.','error'); }
}
async function removeBalanceAnchor(id){
  try{ await api.deleteAnchor(id); anchors=anchors.filter(a=>a.id!==id); _closeModal(); render(); showToast('Ajuste removido.','success'); }
  catch{ showToast('Erro ao remover.','error'); }
}
function histSegHtml(){
  if(!isPlanningOn()) return '';
  return `<div class="dm-seg" id="hist-seg" style="margin-bottom:16px">
    <button type="button" class="dm-seg-btn${histView==='hist'?' active':''}" onclick="setHistView('hist')">Histórico</button>
    <button type="button" class="dm-seg-btn${histView==='plan'?' active':''}" onclick="setHistView('plan')">Planejamento</button>
  </div>`;
}
function setHistView(v){
  histView=v; vib(5);
  render();
}
function syncPlanWide(){
  document.body.classList.toggle('plan-wide',isPlanningOn()&&currentTab==='historico'&&histView==='plan'&&planView==='table');
}
function renderHistorico(el){
  if(!isPlanningOn()) histView='hist';
  syncPlanWide();
  if(histView==='plan'){ renderPlanning(el); return; }
  if(!isPro()){
    const current=expenses.reduce((s,e)=>s+parseFloat(e.value),0);
    const totalBudget=categories.reduce((s,c)=>s+effBudget(c,currentMonthKey),0);
    const totalAvail=totalBudget-current;
    const totalPct=totalBudget>0?Math.min((current/totalBudget)*100,100):0;
    el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))">
      ${histSegHtml()}
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
  el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))">${histSegHtml()}<div class="loading"><div class="spinner"></div>Carregando...</div></div>`;
  renderHistoricoAsync(el);
}
async function renderHistoricoAsync(el){
  let allExps=[];
  try{ allExps=await api.getAllExpenses(); }
  catch{ el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))">${histSegHtml()}<div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Erro ao carregar histórico.</div></div></div>`; return; }

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
    <button class="summary-btn" onclick="openConsolidado()">Ver consolidado do mês <i class="fa-solid fa-chevron-right" style="font-size:10px" aria-hidden="true"></i></button>
  </div>`;

  const vKey=viewMonthKey;
  const vExps=byMonth[vKey]||[];
  const vSpent=vExps.reduce((s,e)=>s+parseFloat(e.value),0);
  const isCurMonth=vKey===currentMonthKey;
  const [vy,vm]=vKey.split('-').map(Number);
  const daysInMonth=new Date(vy,vm,0).getDate();
  const daysElapsed=isCurMonth?Math.max(1,new Date().getDate()):daysInMonth;
  const avgPerDay=vSpent/daysElapsed;
  const projection=isCurMonth?avgPerDay*daysInMonth:vSpent;
  const prevK=prevMonthKey(vKey);
  const prevSpent=(byMonth[prevK]||[]).reduce((s,e)=>s+parseFloat(e.value),0);
  const deltaPct=prevSpent>0?((vSpent-prevSpent)/prevSpent*100):null;
  const catTotals=categories.map(c=>({name:c.name,val:vExps.filter(e=>e.cat_id===c.id).reduce((s,e)=>s+parseFloat(e.value),0)})).filter(x=>x.val>0).sort((a,b)=>b.val-a.val);
  const biggest=catTotals[0];
  const statsHtml=`<div class="stat-grid">
    <div class="stat-card"><div class="stat-label">Média por dia</div><div class="stat-value">${brl(avgPerDay)}</div><div class="stat-sub">${daysElapsed} ${daysElapsed===1?'dia':'dias'}</div></div>
    <div class="stat-card"><div class="stat-label">${isCurMonth?'Projeção do mês':'Total do mês'}</div><div class="stat-value">${brl(projection)}</div><div class="stat-sub">${isCurMonth?'no ritmo atual':monthLabel(vKey)}</div></div>
    <div class="stat-card"><div class="stat-label">vs. mês anterior</div><div class="stat-value ${deltaPct==null?'':deltaPct>0.5?'up':deltaPct<-0.5?'down':''}">${deltaPct==null?'—':(deltaPct>0?'+':'')+Math.round(deltaPct)+'%'}</div><div class="stat-sub">${prevSpent>0?brl(prevSpent):'sem dados'}</div></div>
    <div class="stat-card"><div class="stat-label">Maior categoria</div><div class="stat-value sm">${biggest?escapeHtml(biggest.name):'—'}</div><div class="stat-sub">${biggest?brl(biggest.val):'sem gastos'}</div></div>
  </div>`;
  let distHtml='';
  if(catTotals.length){
    const distMax=catTotals[0].val;
    distHtml=`<div class="chart-card">
      <div class="chart-title">Para onde foi · ${monthLabel(vKey)}</div>
      ${catTotals.map(c=>{
        const pct=vSpent>0?Math.round(c.val/vSpent*100):0;
        const w=distMax>0?Math.max(c.val/distMax*100,3):0;
        return `<div class="dist-row"><div class="dist-head"><span class="dist-name">${escapeHtml(c.name)}</span><span class="dist-val">${brl(c.val)} · ${pct}%</span></div><div class="dist-bar"><span style="width:${w}%"></span></div></div>`;
      }).join('')}
    </div>`;
  }

  let html=summaryHtml+statsHtml+chartHtml+distHtml;
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
  el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))">${histSegHtml()}${html||'<div class="empty"><div class="empty-icon"><i class="fa-regular fa-calendar-xmark"></i></div><div class="empty-text">Nenhum gasto registrado ainda.</div></div>'}</div>`;
}

async function renderSplit(el){
  el.innerHTML=`<div class="split-wrap"><div class="loading"><div class="spinner"></div>Carregando divisões...</div></div>`;
  try{splitGroups=await api.getSplitGroups();}
  catch(err){
    const msg=String(err?.message||'Erro desconhecido').slice(0,120);
    el.innerHTML=`<div class="split-wrap"><div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Não foi possível carregar as divisões.</div><div style="font-size:11px;color:var(--text3);margin-top:8px;padding:0 12px">${escapeHtml(msg)}</div></div></div>`;
    return;
  }
  const visibleGroups=splitGroups.filter(g=>g.created_by===currentUser.id||acceptedGroupIds.has(g.id));
  const create=isPro()?`<button class="btn-primary" onclick="openCreateSplitGroup()" style="margin-bottom:14px">Novo grupo</button>`:`${lockedCard('Criar divisões de gastos','Usuários do plano gratuito podem consultar convites, mas a criação é Pro.')}`;
  const pendingCount=pendingSplitInvites.length;
  const pendingBadge=pendingCount>0?`<div style="background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:12px;padding:12px 14px;margin-bottom:12px;font-size:13px;color:var(--accent-text)"><i class="fa-solid fa-bell" style="margin-right:8px" aria-hidden="true"></i>Você tem <strong>${pendingCount}</strong> convite${pendingCount>1?'s':''} pendente${pendingCount>1?'s':''} — veja na aba <strong>Início</strong></div>`:'';
  const intro=`<div class="split-intro">
    <div class="split-intro-title"><i class="fa-solid fa-user-group" aria-hidden="true"></i> Divida gastos em grupo</div>
    <p>Crie um grupo para dividir despesas entre <strong>três ou mais pessoas</strong> — perfeito para viagens, repúblicas ou aquele rolê em turma. Todo mundo vê os lançamentos e o app calcula automaticamente quem deve para quem.</p>
    <p class="split-intro-tip">Para acertar contas com <strong>uma pessoa só</strong>, use o chat em <strong>Amigos</strong> (toque no seu perfil, no topo).</p>
  </div>`;
  el.innerHTML=`<div class="split-wrap">${intro}${create}${pendingBadge}${visibleGroups.map(g=>`<div class="split-group" onclick="openSplitGroup('${g.id}')"><div class="split-group-main"><div class="split-group-title">${escapeHtml(g.name)}</div><div class="split-group-meta">${g.created_by===currentUser.id?'Criado por você':'Você foi convidado'}</div></div><i class="fa-solid fa-chevron-right split-group-chev" aria-hidden="true"></i></div>`).join('')||'<div class="empty"><div class="empty-icon"><i class="fa-solid fa-user-group"></i></div><div class="empty-text">Nenhuma divisão ainda.</div></div>'}</div>`;
}
function openCreateSplitGroup(){
  if(!isPro()){openPaywall('Criar divisões de gastos');return;}
  openModal(`<div class="modal-title">Novo grupo</div>
    <div class="form-group"><label class="form-label">Nome</label><input class="form-input" id="f-split-name" placeholder="Ex: Viagem para Paraty" maxlength="100"></div>
    ${friendsCheckboxHtml()}
    ${friendNote()}
    <button class="btn-primary" id="btn-split-group" onclick="saveSplitGroup()">Criar grupo</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}
async function saveSplitGroup(){
  const name=document.getElementById('f-split-name').value.trim();
  const emails=[...new Set([...document.querySelectorAll('.friend-check-cb')].filter(cb=>cb.checked).map(cb=>cb.dataset.email))];
  if(!name){showToast('Informe o nome do grupo.','error');return;}
  const btn=document.getElementById('btn-split-group');btn.disabled=true;btn.textContent='Criando...';
  try{
    const rows=await api.insertSplitGroup(name);
    const group=Array.isArray(rows)?rows[0]:rows;
    if(!group?.id) throw new Error('Grupo não retornado');
    const meEmail=currentUser.email.toLowerCase();
    const memberRows=[{group_id:group.id,email:meEmail,user_id:currentUser.id,display_name:null,status:'accepted'},...emails.filter(e=>e!==meEmail).map(email=>({group_id:group.id,email,user_id:null,display_name:null,status:'pending'}))];
    await api.insertSplitMembers(memberRows);
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
    const [members,exps,payments]=await Promise.all([
      api.getSplitMembers(groupId),
      api.getSplitExpenses(groupId),
      api.getSplitPayments(groupId).catch(()=>[]),
    ]);
    const shares=exps.length?await api.getSplitShares(exps.map(e=>e.id)):[];
    window._splitExpCache=exps;
    const memberById=Object.fromEntries(members.map(m=>[m.id,m]));
    const isCreator=group.created_by===currentUser.id;
    const myMember=members.find(m=>m.user_id===currentUser.id||(m.email&&m.email.toLowerCase()===currentUser.email.toLowerCase()));
    const isParticipant=isCreator||myMember?.status==='accepted';
    const canAdd=isPro()&&isParticipant;
    const acceptedMembers=members.filter(m=>m.status==='accepted');
    const pendingMembers=members.filter(m=>m.status==='pending');

    const gross={};
    acceptedMembers.forEach(m=>{gross[m.id]=0;});
    for(const shr of shares.filter(s=>!s.is_settled)){
      const exp=exps.find(e=>e.id===shr.expense_id); if(!exp) continue;
      const payer=members.find(m=>m.user_id===exp.paid_by_user_id); if(!payer||payer.id===shr.member_id) continue;
      if(gross[payer.id]!==undefined) gross[payer.id]+=shr.amount;
      if(gross[shr.member_id]!==undefined) gross[shr.member_id]-=shr.amount;
    }
    for(const pmt of (payments||[])){
      if(gross[pmt.from_member_id]!==undefined) gross[pmt.from_member_id]+=pmt.amount;
      if(gross[pmt.to_member_id]!==undefined) gross[pmt.to_member_id]-=pmt.amount;
    }
    acceptedMembers.forEach(m=>{gross[m.id]=Math.round((gross[m.id]||0)*100)/100;});

    window._splitState={groupId,members:acceptedMembers,gross};

    const mName=m=>{
      if(!m) return '?';
      if(m.user_id===currentUser.id||m.id===myMember?.id) return 'Você';
      return (m.display_name&&m.display_name!=='Você'?m.display_name:null)||m.email?.split('@')[0]||'?';
    };

    const allQuite=acceptedMembers.every(m=>Math.abs(gross[m.id]||0)<0.005);

    let html=`<div class="modal-head-row">
      <div class="modal-title">${escapeHtml(group.name)}</div>
      ${isCreator?`<div class="modal-head-actions">
        <div class="modal-icon-btn" onclick="openEditSplitGroup('${groupId}')" title="Renomear"><i class="fa-solid fa-pen" aria-hidden="true"></i></div>
        <div class="modal-icon-btn danger" onclick="confirmDeleteSplitGroup('${groupId}')" title="Excluir grupo"><i class="fa-solid fa-trash" aria-hidden="true"></i></div>
      </div>`:''}
    </div>`;

    html+=`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      ${acceptedMembers.map(m=>`<span style="font-size:11px;background:var(--surface2);border-radius:100px;padding:3px 10px;color:var(--text2)">${escapeHtml(mName(m))}</span>`).join('')}
      ${pendingMembers.map(m=>`<span style="font-size:11px;background:var(--surface2);border-radius:100px;padding:3px 10px;color:var(--text3)"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${escapeHtml(m.email.split('@')[0])}</span>`).join('')}
    </div>`;

    html+=`<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px">Saldo atual</div>`;
    if(exps.length===0){
      html+=`<div style="text-align:center;padding:18px;background:var(--surface2);border-radius:14px;color:var(--text3);font-size:13px;margin-bottom:16px">Nenhuma despesa ainda. Adicione a primeira.</div>`;
    } else if(allQuite){
      html+=`<div style="text-align:center;padding:18px;background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:14px;color:var(--accent-text);font-weight:700;font-size:15px;margin-bottom:16px"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Todos quite!</div>`;
    } else {
      html+=`<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
        ${acceptedMembers.map(m=>{
          const n=gross[m.id]||0;
          const label=escapeHtml(mName(m));
          const isDebt=n<-0.005, isCredit=n>0.005;
          const color=isDebt?'var(--red)':isCredit?'var(--accent-text,var(--accent))':'var(--text3)';
          const statusLine=isCredit?`<i class="fa-solid fa-arrow-up" aria-hidden="true"></i> a receber ${brl(n)}`:isDebt?`<i class="fa-solid fa-arrow-down" aria-hidden="true"></i> a pagar ${brl(Math.abs(n))}`:'<i class="fa-solid fa-check" aria-hidden="true"></i> Quite';
          const border=isDebt?'var(--red-soft)':isCredit?'var(--accent-line)':'var(--border)';
          return `<div style="padding:14px;background:var(--surface2);border-radius:14px;border:1px solid ${border}">
            <div style="font-size:15px;font-weight:700">${label}</div>
            <div style="font-size:13px;margin-top:3px;color:${color}">${statusLine}</div>
          </div>`;
        }).join('')}
      </div>`;
    }

    if(canAdd) html+=`<button class="btn-primary" onclick="openAddSplitExpense('${groupId}')" style="margin-bottom:8px">Adicionar despesa</button>`;
    if(isParticipant){
      const biggestDebtor=acceptedMembers.filter(m=>(gross[m.id]||0)<-0.005).sort((a,b)=>(gross[a.id]||0)-(gross[b.id]||0))[0];
      const defaultFrom=(biggestDebtor||myMember||acceptedMembers[0])?.id||'';
      html+=`<button class="btn-secondary" onclick="openRegisterPayment('${defaultFrom}')" style="margin-bottom:8px">Adicionar pagamento</button>`;
    }
    if(isCreator) html+=`<button class="btn-secondary" onclick="openAddSplitMember('${groupId}')" style="margin-bottom:14px">Convidar membro</button>`;

    if(exps.length>0){
      html+=`<details style="margin-bottom:10px"><summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface2);border-radius:12px">
        <span style="font-size:13px;font-weight:600">Lançamentos</span>
        <span style="font-size:12px;background:var(--surface);border-radius:100px;padding:2px 9px;color:var(--text3)">${exps.length}</span>
      </summary>
      <div style="margin-top:6px;border:1px solid var(--border);border-radius:12px;overflow:hidden">
        ${exps.map((e,i)=>{
          const expShares=shares.filter(s=>s.expense_id===e.id);
          const isLast=i===exps.length-1;
          return `<div style="padding:12px 14px${isLast?'':';border-bottom:1px solid var(--border)'}">
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:2px"><span>${escapeHtml(e.description)}${e.image_url?`<span class="exp-receipt-dot" onclick="event.stopPropagation();viewReceipt('${e.id}',true)" title="Ver comprovante"><i class="fa-solid fa-image" aria-hidden="true"></i></span>`:''}</span><span>${brl(e.total_amount)}</span></div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:6px">Pago por ${escapeHtml(mName(members.find(m=>m.user_id===e.paid_by_user_id)||{email:e.paid_by_email}))}</div>
            ${expShares.map(s=>{const m=memberById[s.member_id]||{};return `<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);padding:1px 0"><span>${escapeHtml(mName(m))}</span><span>${brl(s.amount)}</span></div>`;}).join('')}
          </div>`;
        }).join('')}
      </div></details>`;
    }

    const pmts=payments||[];
    html+=`<details style="margin-bottom:14px"${pmts.length?'':' style="margin-bottom:14px"'}><summary style="cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--surface2);border-radius:12px">
      <span style="font-size:13px;font-weight:600">Pagamentos registrados</span>
      <span style="font-size:12px;background:var(--surface);border-radius:100px;padding:2px 9px;color:var(--text3)">${pmts.length}</span>
    </summary>
    <div style="margin-top:6px">
      ${pmts.length===0?`<div style="padding:14px;text-align:center;color:var(--text3);font-size:13px">Nenhum pagamento registrado.</div>`:
        `<div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
          ${pmts.map((pmt,i)=>{
            const from=memberById[pmt.from_member_id]||{};
            const to=memberById[pmt.to_member_id]||{};
            const fromName=escapeHtml(mName(from));
            const toName=escapeHtml(mName(to));
            const canDel=isCreator||pmt.from_member_id===myMember?.id;
            const isLast=i===pmts.length-1;
            return `<div style="display:flex;align-items:center;gap:10px;padding:12px 14px${isLast?'':';border-bottom:1px solid var(--border)'}">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600">${fromName} <span style="color:var(--text3);font-weight:400">pagou</span> ${toName}</div>
                <div style="font-size:14px;color:var(--accent);font-weight:700;margin-top:2px">${brl(pmt.amount)}${pmt.note?`<span style="font-size:12px;color:var(--text3);font-weight:400"> · ${escapeHtml(pmt.note)}</span>`:''}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:1px">${new Date(pmt.created_at).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div>
              </div>
              ${canDel?`<div class="icon-btn" style="border-color:#ff4f4f44;color:var(--red);flex-shrink:0" onclick="deleteSplitPayment('${pmt.id}','${groupId}')"><i class="fa-solid fa-trash" aria-hidden="true"></i></div>`:''}
            </div>`;
          }).join('')}
        </div>`
      }
    </div></details>`;

    html+=`<button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
    document.getElementById('modal-content').innerHTML=html;
  }catch(err){
    document.getElementById('modal-content').innerHTML=`<div class="modal-title">${escapeHtml(group.name)}</div><p class="modal-note">Erro ao carregar o grupo.<br><small>${escapeHtml(String(err?.message||'').slice(0,100))}</small></p><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
  }
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
      <input class="form-input" id="f-split-value" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this)"></div>
    <div class="form-group"><label class="form-label">Dividir com</label>${memberCheckboxes}</div>
    ${receiptPickerHtml()}
    <button class="btn-primary" id="btn-split-exp" onclick="saveSplitExpense('${groupId}')">Dividir igualmente</button>
    <button class="btn-secondary" onclick="openSplitGroup('${groupId}')">Cancelar</button>`);
}
async function saveSplitExpense(groupId){
  const description=document.getElementById('f-split-desc').value.trim(),total=parseNum(document.getElementById('f-split-value').value);
  if(!description||!total||total<=0){showToast('Preencha descrição e valor.','error');return;}
  const allMembers=await api.getSplitMembers(groupId);
  const selected=allMembers.filter(m=>document.getElementById('split-m-'+m.id)?.checked);
  if(!selected.length){showToast('Selecione pelo menos um participante.','error');return;}
  const btn=document.getElementById('btn-split-exp');btn.disabled=true;btn.textContent='Salvando...';
  try{
    let image_url=null;
    const newFile=document.getElementById('f-receipt')?.files?.[0];
    if(newFile){ btn.textContent='Enviando foto...'; image_url=await getReceiptUrl().catch(()=>null); btn.textContent='Salvando...'; }
    const exp=(await api.insertSplitExpense({group_id:groupId,description,total_amount:total,paid_by_user_id:currentUser.id,paid_by_email:currentUser.email,image_url}))[0];
    const cents=Math.round(total*100),base=Math.floor(cents/selected.length),remainder=cents%selected.length;
    await api.insertSplitShares(selected.map((m,i)=>({expense_id:exp.id,member_id:m.id,amount:(base+(i<remainder?1:0))/100,is_settled:m.user_id===currentUser.id,settled_at:m.user_id===currentUser.id?new Date().toISOString():null})));
    showToast('Despesa dividida!','success');openSplitGroup(groupId);
  }catch(err){const msg=String(err?.message||'');showToast(/image_url/i.test(msg)?'Falta a coluna: ALTER TABLE split_expenses ADD COLUMN image_url text':`Erro ao dividir: ${msg.slice(0,100)}`,'error');btn.disabled=false;btn.textContent='Dividir igualmente';}
}
function openRegisterPayment(fromMemberId){
  const state=window._splitState;
  if(!state){showToast('Reabra o grupo e tente novamente.','error');return;}
  const {groupId,members,gross}=state;
  const creditors=members.filter(m=>m.id!==fromMemberId&&(gross[m.id]||0)>0.005).sort((a,b)=>(gross[b.id]||0)-(gross[a.id]||0));
  const defaultTo=creditors.length?creditors[0].id:'';
  const debtAmount=Math.abs(gross[fromMemberId]||0);
  const defaultAmount=debtAmount>0.005?debtAmount.toFixed(2):'';
  const memberOpts=id=>members.filter(m=>m.id!==id).map(m=>`<option value="${m.id}"${m.id===defaultTo&&id===fromMemberId?' selected':''}>${escapeHtml(m.display_name||m.email.split('@')[0])}</option>`).join('');
  openModal(`<div class="modal-title">Registrar pagamento</div>
    <p class="modal-note" style="margin-bottom:16px">Registre quanto foi pago. Pode ser parcial, total ou maior que a dívida — o saldo é ajustado automaticamente.</p>
    <div class="form-group"><label class="form-label">Quem pagou</label>
      <select class="form-input" id="f-pmt-from" onchange="updatePaymentToOpts()">${members.map(m=>`<option value="${m.id}"${m.id===fromMemberId?' selected':''}>${escapeHtml(m.display_name||m.email.split('@')[0])}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label class="form-label">Para quem</label>
      <select class="form-input" id="f-pmt-to"><option value="">Selecione...</option>${memberOpts(fromMemberId)}</select>
    </div>
    <div class="form-group"><label class="form-label">Valor (R$)</label>
      <input class="form-input" id="f-pmt-amount" type="text" inputmode="decimal" placeholder="0,00" value="${defaultAmount}" oninput="moneyKey(this)"/>
    </div>
    <div class="form-group"><label class="form-label">Nota <span style="color:var(--text3)">(opcional)</span></label>
      <input class="form-input" id="f-pmt-note" maxlength="100" placeholder="Pix, dinheiro, transferência…"/>
    </div>
    <button class="btn-primary" id="btn-pmt-save" onclick="savePayment()">Registrar pagamento</button>
    <button class="btn-secondary" onclick="openSplitGroup('${groupId}')">Cancelar</button>`);
}

function updatePaymentToOpts(){
  const state=window._splitState;
  if(!state) return;
  const fromId=document.getElementById('f-pmt-from')?.value;
  const toSel=document.getElementById('f-pmt-to');
  if(!toSel) return;
  toSel.innerHTML=`<option value="">Selecione...</option>`+
    state.members.filter(m=>m.id!==fromId).map(m=>`<option value="${m.id}">${escapeHtml(m.display_name||m.email.split('@')[0])}</option>`).join('');
  const amtInput=document.getElementById('f-pmt-amount');
  if(amtInput&&!amtInput.value){
    const debtAmount=Math.abs(state.gross[fromId]||0);
    if(debtAmount>0.005) amtInput.value=debtAmount.toFixed(2);
  }
}

async function savePayment(){
  const state=window._splitState;
  if(!state){showToast('Erro de estado. Reabra o grupo.','error');return;}
  const {groupId}=state;
  const fromId=document.getElementById('f-pmt-from')?.value;
  const toId=document.getElementById('f-pmt-to')?.value;
  const amount=parseNum(document.getElementById('f-pmt-amount')?.value);
  const note=(document.getElementById('f-pmt-note')?.value||'').trim();
  if(!fromId||!toId){showToast('Selecione quem pagou e para quem.','error');return;}
  if(fromId===toId){showToast('Quem pagou e quem recebeu devem ser pessoas diferentes.','error');return;}
  if(!amount||amount<=0){showToast('Informe um valor válido.','error');return;}
  const btn=document.getElementById('btn-pmt-save');btn.disabled=true;btn.textContent='Salvando...';
  try{
    await api.insertSplitPayment({group_id:groupId,from_member_id:fromId,to_member_id:toId,amount,note:note||null});
    showToast('Pagamento registrado!','success');
    openSplitGroup(groupId);
  }catch(e){
    showToast('Erro: '+String(e?.message||'').slice(0,60),'error');
    btn.disabled=false;btn.textContent='Registrar pagamento';
  }
}

async function deleteSplitPayment(paymentId,groupId){
  if(!confirm('Remover este pagamento? O saldo voltará ao estado anterior.'))return;
  try{
    await api.deleteSplitPayment(paymentId);
    showToast('Pagamento removido.','success');
    openSplitGroup(groupId);
  }catch{showToast('Erro ao remover pagamento.','error');}
}

function openAddSplitMember(groupId){
  openModal(`<div class="modal-title">Convidar membro</div>
    ${friendsPickerHtml('f-split-invite')}
    <div class="form-group"><label class="form-label">E-mail do convidado</label>
      <input class="form-input" id="f-split-invite" type="email" placeholder="amigo@email.com" autocomplete="off"/></div>
    ${friendNote()}
    <button class="btn-primary" id="btn-split-invite" onclick="saveAddSplitMember('${groupId}')">Enviar convite</button>
    <button class="btn-secondary" onclick="openSplitGroup('${groupId}')">Cancelar</button>`);
}

async function saveAddSplitMember(groupId){
  const email=(document.getElementById('f-split-invite').value||'').trim().toLowerCase();
  if(!email||!/^\S+@\S+\.\S+$/.test(email)){showToast('Informe um e-mail válido.','error');return;}
  if(email===currentUser.email.toLowerCase()){showToast('Você já está no grupo.','error');return;}
  const btn=document.getElementById('btn-split-invite');btn.disabled=true;btn.textContent='Enviando...';
  try{
    await api.insertSplitMembers([{group_id:groupId,email,user_id:null,display_name:null,status:'pending'}]);
    showToast('Convite enviado!','success');
    openSplitGroup(groupId);
  }catch(e){
    showToast('Erro: '+String(e?.message||'').slice(0,60),'error');
    btn.disabled=false;btn.textContent='Enviar convite';
  }
}

function openEditSplitGroup(groupId){
  const group=splitGroups.find(g=>g.id===groupId);if(!group)return;
  openModal(`<div class="modal-title">Renomear grupo</div>
    <div class="form-group"><label class="form-label">Nome do grupo</label>
      <input class="form-input" id="f-edit-split-name" maxlength="100" value="${escapeHtml(group.name)}"/></div>
    <button class="btn-primary" id="btn-edit-split" onclick="saveEditSplitGroup('${groupId}')">Salvar</button>
    <button class="btn-secondary" onclick="openSplitGroup('${groupId}')">Cancelar</button>`);
}
async function saveEditSplitGroup(groupId){
  const name=(document.getElementById('f-edit-split-name').value||'').trim();
  if(!name){showToast('Informe um nome.','error');return;}
  const btn=document.getElementById('btn-edit-split');btn.disabled=true;btn.textContent='Salvando...';
  try{
    await api.updateSplitGroup(groupId,name);
    const g=splitGroups.find(x=>x.id===groupId); if(g) g.name=name;
    showToast('Grupo renomeado!','success');
    openSplitGroup(groupId);
  }catch(e){showToast('Erro: '+String(e?.message||'').slice(0,60),'error');btn.disabled=false;btn.textContent='Salvar';}
}
async function confirmDeleteSplitGroup(groupId){
  const group=splitGroups.find(g=>g.id===groupId);
  if(!confirm(`Excluir o grupo "${group?.name||''}"? Todas as despesas, membros e pagamentos serão removidos. Esta ação não pode ser desfeita.`)) return;
  try{
    await api.deleteSplitGroup(groupId);
    splitGroups=splitGroups.filter(g=>g.id!==groupId);
    _closeModal();
    showToast('Grupo excluído.','success');
    renderSplit(document.getElementById('content'));
  }catch(e){showToast('Erro ao excluir grupo: '+String(e?.message||'').slice(0,50),'error');}
}

function openModal(html){ document.getElementById('modal-content').innerHTML=html; document.getElementById('modal-overlay').classList.add('open'); fitViewport(); }
function _closeModal(){ document.getElementById('modal-overlay').classList.remove('open'); }
function closeModalOverlay(e){ if(e.target===document.getElementById('modal-overlay')) _closeModal(); }
(function(){
  const modal=document.getElementById('modal');
  const handle=modal?modal.querySelector('.modal-handle'):null;
  if(!modal||!handle) return;
  let startY=0,lastY=0,dragging=false;
  const clearInline=()=>{ modal.style.transition=''; modal.style.transform=''; };
  const move=e=>{
    if(!dragging) return;
    lastY=(e.touches?e.touches[0].clientY:e.clientY);
    const dy=Math.max(0,lastY-startY);
    if(dy>0&&e.cancelable) e.preventDefault();
    modal.style.transform='translateY('+dy+'px)';
  };
  const end=()=>{
    if(!dragging) return;
    dragging=false;
    window.removeEventListener('touchmove',move);
    window.removeEventListener('touchend',end);
    window.removeEventListener('mousemove',move);
    window.removeEventListener('mouseup',end);
    const dy=Math.max(0,lastY-startY);
    if(dy>100){
      let closed=false;
      const done=()=>{ if(closed) return; closed=true; modal.removeEventListener('transitionend',done); clearInline(); _closeModal(); };
      modal.style.transition='transform .28s cubic-bezier(.4,0,.2,1)';
      modal.style.transform='translateY(100%)';
      modal.addEventListener('transitionend',done);
      setTimeout(done,340);
    }else{
      modal.style.transition='transform .25s cubic-bezier(.4,0,.2,1)';
      modal.style.transform='translateY(0)';
      setTimeout(clearInline,260);
    }
  };
  const start=e=>{
    dragging=true;
    startY=lastY=(e.touches?e.touches[0].clientY:e.clientY);
    modal.style.transition='none';
    window.addEventListener('touchmove',move,{passive:false});
    window.addEventListener('touchend',end);
    window.addEventListener('mousemove',move);
    window.addEventListener('mouseup',end);
  };
  handle.addEventListener('touchstart',start,{passive:true});
  handle.addEventListener('mousedown',e=>{ e.preventDefault(); start(e); });
})();

function openAddExpense(catId){
  if(!isPro()){
    const today=todayLocal();
    const used=expenses.filter(e=>e.date===today).length;
    if(used>=CONFIG.FREE_DAILY_LAUNCHES){ openPaywall(`Você já registrou ${used} gastos hoje. No Pro, os lançamentos são ilimitados.`); return; }
  }
  const today=todayLocal();
  openModal(`<div class="modal-title">Novo Gasto</div>
    <div class="form-group"><label class="form-label">Categoria</label>
      <select class="form-input" id="f-catId">${categories.filter(c=>c.user_id===currentUser.id||sharePerm(c.id)==='edit').map(c=>`<option value="${c.id}"${c.id===catId?' selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Descrição</label>
      <div class="ac-wrap">
        <input class="form-input" id="f-name" placeholder="Ex: Gasolina Shell" autocomplete="off" oninput="acFilter(this.value)" onfocus="acFilter(this.value)" onblur="acBlur()"/>
        <div class="ac-list" id="ac-list"></div>
      </div></div>
    <div class="form-group"><label class="form-label" id="f-value-label">Valor (R$)</label>
      <input class="form-input" id="f-value" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this)"/></div>
    <div class="form-group"><label class="form-label">Data</label>
      <input class="form-input" id="f-date" type="date" value="${today}" onchange="onExpenseDateChange()"/></div>
    ${repeatFieldHtml()}
    ${receiptPickerHtml()}
    <button class="btn-primary" id="btn-save-exp" onclick="saveExpense(null)">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}
function notesFieldHtml(val){
  return `<div class="form-group"><label class="form-label">Observações <span style="color:var(--text3);text-transform:none;letter-spacing:0">(opcional)</span></label>
    <textarea class="form-input" id="f-notes" rows="2" maxlength="600" placeholder="Código de barras do boleto, número do pedido, anotações…" style="resize:vertical;font-family:var(--font-body)">${escapeHtml(val||'')}</textarea>
    <span class="field-hint">Fica salvo no lançamento e você copia com um toque depois.</span></div>`;
}
function openExpenseNote(expId){
  const e=expenses.find(x=>x.id===expId); if(!e||!e.notes) return;
  openModal(`<div class="modal-title">${escapeHtml(e.name)}</div>
    <p class="modal-note">Observações deste lançamento.</p>
    <div id="note-box" style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:14px;font-size:14px;line-height:1.5;word-break:break-all;white-space:pre-wrap;margin-bottom:16px">${escapeHtml(e.notes)}</div>
    <button class="btn-primary" id="btn-copy-note" onclick="copyExpenseNote('${expId}')"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copiar</button>
    <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`);
}
async function copyExpenseNote(expId){
  const e=expenses.find(x=>x.id===expId); if(!e||!e.notes) return;
  let ok=false;
  try{ await navigator.clipboard.writeText(e.notes); ok=true; }
  catch{
    try{
      const ta=document.createElement('textarea');
      ta.value=e.notes; ta.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      ok=document.execCommand('copy'); ta.remove();
    }catch{}
  }
  vib(8);
  showToast(ok?'Copiado!':'Não foi possível copiar.',ok?'success':'error');
}
function repeatFieldHtml(mode='none',installmentTotal='',installmentNo=1,valueMode='compra',isEdit=false,cardId=''){
  const thisMonthRow=isEdit?'':`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:6px">
      <input type="checkbox" id="f-installment-thismonth" checked onchange="onThisMonthToggle()" style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-installment-thismonth" style="font-size:13px;cursor:pointer;flex:1">Cai já neste mês <span style="color:var(--text2);font-size:12px">(desmarque se a fatura já fechou e a cobrança só chega no mês que vem)</span></label>
    </div>
    <span class="auth-hint" id="f-invoice-hint" style="display:none;margin-bottom:10px"></span>`;
  const cardRow=`<div class="form-group"><label class="form-label">Cartão</label>
      <select class="form-input" id="f-card" onchange="onCardChange()">
        <option value="">Sem cartão específico</option>
        ${cards.map(c=>`<option value="${c.id}"${c.id===cardId?' selected':''}>${escapeHtml(c.name)} · fecha dia ${c.closing_day}</option>`).join('')}
      </select>
      <span class="field-hint">Com um cartão escolhido, o app calcula sozinho em qual fatura a compra entra.</span></div>`;
  return `<div class="form-group"><label class="form-label">Repetição</label>
    <div class="dm-seg" id="f-repeat-seg">
      <button type="button" class="dm-seg-btn${mode==='none'?' active':''}" data-v="none" onclick="repeatSeg(this)">Única</button>
      <button type="button" class="dm-seg-btn${mode==='recurring'?' active':''}" data-v="recurring" onclick="repeatSeg(this)">Recorrente</button>
      <button type="button" class="dm-seg-btn${mode==='installment'?' active':''}" data-v="installment" onclick="repeatSeg(this)">Cartão</button>
    </div>
    <div id="f-installment-wrap" ${mode==='installment'?'':'hidden'} style="margin-top:10px">
      ${cards.length?cardRow:''}
      <div class="dm-seg" id="f-installment-vmode" style="margin-bottom:10px">
        <button type="button" class="dm-seg-btn${valueMode==='parcela'?'':' active'}" data-v="compra" onclick="instVModeSeg(this)">Valor da compra</button>
        <button type="button" class="dm-seg-btn${valueMode==='parcela'?' active':''}" data-v="parcela" onclick="instVModeSeg(this)">Valor da parcela</button>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:10px">
        <div style="flex:1"><span class="auth-hint" style="margin-bottom:6px;display:block">Parcela atual</span>
          <input class="form-input" id="f-installment-no" type="number" inputmode="numeric" min="1" max="60" step="1" value="${installmentNo}"/></div>
        <div style="flex:1"><span class="auth-hint" style="margin-bottom:6px;display:block">Total de parcelas</span>
          <input class="form-input" id="f-installment-total" type="number" inputmode="numeric" min="1" max="60" step="1" placeholder="Ex: 12" value="${installmentTotal}"/></div>
      </div>
      ${thisMonthRow}
    </div>
    <span class="auth-hint" id="f-installment-hint" style="${mode==='installment'?'':'display:none'}">Use 1 parcela para uma compra à vista no cartão. Se a compra já começou, informe em qual parcela ela está — ex: 4 de 12. Em "Valor da compra", o total é dividido pelas parcelas.</span>
  </div>`;
}
function repeatSeg(btn){
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const isInst=btn.dataset.v==='installment';
  const wrap=document.getElementById('f-installment-wrap');
  if(wrap) wrap.hidden=!isInst;
  const hint=document.getElementById('f-installment-hint');
  if(hint) hint.style.display=isInst?'':'none';
  updateValueFieldLabel();
  if(isInst) syncInvoiceHint(true);
}
function repeatSegVal(){ const el=document.querySelector('#f-repeat-seg .dm-seg-btn.active'); return el?el.dataset.v:'none'; }
function onCardChange(){ syncInvoiceHint(true); }
function onThisMonthToggle(){ syncInvoiceHint(false); }
function onExpenseDateChange(){ if(repeatSegVal()==='installment') syncInvoiceHint(true); }
function syncInvoiceHint(applyCard){
  const cb=document.getElementById('f-installment-thismonth'); if(!cb) return;
  const hint=document.getElementById('f-invoice-hint'); if(!hint) return;
  const sel=document.getElementById('f-card');
  const card=sel&&sel.value?cards.find(c=>c.id===sel.value):null;
  const date=document.getElementById('f-date')?.value;
  if(card&&date&&applyCard) cb.checked=(cardInvoiceMonth(card,date)===viewMonthKey);
  const target=cb.checked?viewMonthKey:nextMonthKey(viewMonthKey);
  hint.style.display='';
  hint.innerHTML=card
    ? `<i class="fa-solid fa-receipt" aria-hidden="true"></i> Entra na fatura de <strong>${monthLabel(target)}</strong> — ${escapeHtml(card.name)} fecha dia ${card.closing_day}.`
    : `<i class="fa-regular fa-calendar-check" aria-hidden="true"></i> Vai contar no orçamento de <strong>${monthLabel(target)}</strong>.`;
}
function instVModeSeg(btn){
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateValueFieldLabel();
}
function instValueMode(){ const el=document.querySelector('#f-installment-vmode .dm-seg-btn.active'); return el?el.dataset.v:'compra'; }
function updateValueFieldLabel(){
  const label=document.getElementById('f-value-label'); if(!label) return;
  if(repeatSegVal()!=='installment'){ label.textContent='Valor (R$)'; return; }
  label.textContent=instValueMode()==='parcela'?'Valor de cada parcela (R$)':'Valor total da compra (R$)';
}

function openEditExpense(expId){
  const e=expenses.find(x=>x.id===expId); if(!e) return;
  openModal(`<div class="modal-title">Editar Gasto</div>
    <div class="form-group"><label class="form-label">Categoria</label>
      <select class="form-input" id="f-catId">${categories.filter(c=>c.user_id===currentUser.id||sharePerm(c.id)==='edit').map(c=>`<option value="${c.id}"${c.id===e.cat_id?' selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">Descrição</label>
      <div class="ac-wrap">
        <input class="form-input" id="f-name" value="${escapeHtml(e.name)}" autocomplete="off" oninput="acFilter(this.value)" onfocus="acFilter(this.value)" onblur="acBlur()"/>
        <div class="ac-list" id="ac-list"></div>
      </div></div>
    <div class="form-group"><label class="form-label" id="f-value-label">Valor (R$)</label>
      <input class="form-input" id="f-value" type="text" inputmode="decimal" value="${e.value}" oninput="moneyKey(this)"/></div>
    <div class="form-group"><label class="form-label">Data</label>
      <input class="form-input" id="f-date" type="date" value="${e.date}"/></div>
    ${repeatFieldHtml(e.installment_total?'installment':(e.recurring?'recurring':'none'),e.installment_total||'',e.installment_no||1,'parcela',true)}
    ${receiptPickerHtml(e.image_url||'')}
    <button class="btn-primary" id="btn-save-exp" onclick="saveExpense('${expId}')">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveExpense(expId){
  const catId=document.getElementById('f-catId').value;
  const name=document.getElementById('f-name').value.trim();
  let value=parseNum(document.getElementById('f-value').value);
  const date=document.getElementById('f-date').value;
  const repeatMode=repeatSegVal();
  const recurring=repeatMode==='recurring';
  if(!name||isNaN(value)||value<=0||!date){ showToast('Preencha todos os campos.','error'); return; }
  if(!expId&&!isPro()&&expenses.filter(e=>e.date===date).length>=CONFIG.FREE_DAILY_LAUNCHES){ openPaywall('Limite diário de lançamentos atingido'); return; }
  const editing=expId?expenses.find(x=>x.id===expId):null;
  let installment_total=null, installment_no=null, installment_group=null;
  if(repeatMode==='installment'){
    installment_total=parseInt(document.getElementById('f-installment-total').value,10);
    installment_no=parseInt(document.getElementById('f-installment-no').value,10)||1;
    if(!installment_total||installment_total<1){ showToast('Informe o número de parcelas (mínimo 1).','error'); return; }
    if(installment_no<1||installment_no>installment_total){ showToast(`A parcela atual deve estar entre 1 e ${installment_total}.`,'error'); return; }
    installment_group=editing?.installment_group||uid();
    if(instValueMode()==='compra') value=Math.round((value/installment_total)*100)/100;
  }
  let targetMonthKey=viewMonthKey, targetDate=date, skippedToNextMonth=false;
  if(repeatMode==='installment'&&!expId){
    const cb=document.getElementById('f-installment-thismonth');
    if(cb&&!cb.checked){
      targetMonthKey=nextMonthKey(viewMonthKey);
      targetDate=`${targetMonthKey}-01`;
      skippedToNextMonth=true;
    }
  }
  const btn=document.getElementById('btn-save-exp'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    let image_url=expId?(expenses.find(x=>x.id===expId)?.image_url||null):null;
    const newFile=document.getElementById('f-receipt')?.files?.[0];
    if(newFile){ btn.textContent='Enviando foto...'; try{ image_url=await getReceiptUrl(); }catch(upErr){ showToast(`Foto não enviada: ${upErr.message}`,'error'); } btn.textContent='Salvando...'; }
    const card_id=repeatMode==='installment'?(document.getElementById('f-card')?.value||null):null;
    const payload={cat_id:catId,name,value,date:targetDate,recurring,image_url,installment_total,installment_no,installment_group,card_id,notes:expId?(expenses.find(x=>x.id===expId)?.notes||null):null};
    if(expId) await api.updateExpense(expId,payload);
    else{
      await api.insertExpense({id:uid(),month_key:targetMonthKey,...payload});
      if(repeatMode==='installment'&&installment_total>installment_no){
        btn.textContent='Criando parcelas...';
        let mk=targetMonthKey;
        for(let n=installment_no+1;n<=installment_total;n++){
          mk=nextMonthKey(mk);
          await api.insertExpense({id:uid(),month_key:mk,...payload,date:`${mk}-01`,installment_no:n});
        }
        await ensureMonthsExist(targetMonthKey,mk);
      }
    }
    logActivity(catId,expId?'edit':'create',name,value);
    if(name && !expenseNames.includes(name)) expenseNames.unshift(name);
    expenses=await api.getExpenses(viewMonthKey);
    await refreshFutureMonths();
    saveCache();
    vib(15);
    _closeModal(); render(); showToast(skippedToNextMonth?`Salvo! ${installment_total>1?'A 1ª parcela cai':'A cobrança cai'} em ${monthLabel(targetMonthKey)}.`:'Salvo!','success');
  }catch(err){
    const msg=String(err?.message||'');
    if(/image_url/i.test(msg)){
      showToast('Falta a coluna no banco: ALTER TABLE expenses ADD COLUMN image_url text','error');
    }else if(/recurring/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN recurring boolean DEFAULT false','error');
    }else if(/notes/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN notes text','error');
    }else if(/installment/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN installment_no integer, ADD COLUMN installment_total integer, ADD COLUMN installment_group text','error');
    }else{
      showToast(`Erro ao salvar: ${msg.slice(0,120)}`,'error');
    }
    btn.disabled=false; btn.textContent='Salvar';
  }
}

function previewReceipt(input){
  const file=input.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const img=document.getElementById('receipt-preview-img');
    const lbl=document.getElementById('receipt-pick-lbl');
    if(img){img.src=ev.target.result;img.style.display='block';}
    if(lbl) lbl.innerHTML=`<i class="fa-solid fa-check" style="color:var(--accent)"></i> ${escapeHtml(file.name)}`;
  };
  reader.readAsDataURL(file);
}
function receiptPickerHtml(existingUrl=''){
  const thumb=existingUrl?`<img class="receipt-preview-img" id="receipt-preview-img" src="${existingUrl}" alt="Comprovante"/>`:`<img class="receipt-preview-img" id="receipt-preview-img" style="display:none" alt=""/>`;
  return `<div class="form-group"><label class="form-label">Comprovante <span style="color:var(--text3)">(opcional)</span></label>
  <div class="receipt-pick" onclick="document.getElementById('f-receipt').click()">
    <input type="file" id="f-receipt" accept="image/*" style="position:absolute;opacity:0;width:0;height:0;pointer-events:none" onchange="previewReceipt(this)"/>
    <span class="receipt-pick-label" id="receipt-pick-lbl"><i class="fa-regular fa-image"></i> ${existingUrl?'Trocar imagem':'Anexar da galeria'}</span>
    ${thumb}
  </div></div>`;
}
function compressImage(file,maxDim=1100,quality=0.55){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Falha ao ler arquivo'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Imagem inválida'));
      img.onload=()=>{
        let{width:w,height:h}=img;
        if(w>maxDim||h>maxDim){ const r=Math.min(maxDim/w,maxDim/h); w=Math.round(w*r); h=Math.round(h*r); }
        const canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        canvas.getContext('2d').drawImage(img,0,0,w,h);
        resolve(canvas.toDataURL('image/jpeg',quality));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function getReceiptUrl(){
  const input=document.getElementById('f-receipt');
  if(!input?.files?.length) return null;
  return compressImage(input.files[0]);
}
function canEditReceipt(item,isSplit){
  if(isSplit) return item.paid_by_user_id===currentUser.id;
  const cat=categories.find(c=>c.id===item.cat_id);
  return !!cat&&(cat.user_id===currentUser.id||sharePerm(cat.id)==='edit');
}
function viewReceipt(id,isSplit){
  const list=isSplit?(window._splitExpCache||[]):expenses;
  const item=list.find(x=>String(x.id)===String(id));
  if(!item?.image_url) return;
  document.getElementById('receipt-viewer')?.remove();
  const canEdit=canEditReceipt(item,isSplit);
  const actions=canEdit?`
    <div style="display:flex;gap:10px;width:100%;max-width:360px">
      <button onclick="changeReceipt('${id}',${!!isSplit})" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff;font:600 13px var(--font-body);cursor:pointer"><i class="fa-regular fa-image" aria-hidden="true"></i> Trocar imagem</button>
      <button onclick="deleteReceipt('${id}',${!!isSplit})" style="flex:1;padding:12px;border-radius:12px;border:1px solid rgba(251,110,110,.5);background:rgba(251,110,110,.16);color:#FB6E6E;font:600 13px var(--font-body);cursor:pointer"><i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir imagem</button>
    </div>`:'';
  const ov=document.createElement('div');
  ov.id='receipt-viewer';
  ov.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.93);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:18px';
  ov.onclick=e=>{ if(e.target===ov) ov.remove(); };
  ov.innerHTML=`
    <img src="${item.image_url}" alt="Comprovante" style="max-width:100%;max-height:${canEdit?'66vh':'80vh'};border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.5)"/>
    ${actions}
    <button onclick="document.getElementById('receipt-viewer')?.remove()" style="padding:10px 26px;border-radius:100px;border:1px solid rgba(255,255,255,.2);background:transparent;color:#fff;font:600 13px var(--font-body);cursor:pointer">Fechar</button>
    <input type="file" id="receipt-change-input" accept="image/*" style="display:none"/>`;
  document.body.appendChild(ov);
  vib(6);
}
function changeReceipt(id,isSplit){
  const input=document.getElementById('receipt-change-input');
  if(!input) return;
  input.value='';
  input.onchange=async()=>{
    if(!input.files?.length) return;
    try{
      const dataUrl=await compressImage(input.files[0]);
      if(isSplit){
        await api.updateSplitExpense(id,{image_url:dataUrl});
        const it=(window._splitExpCache||[]).find(x=>String(x.id)===String(id)); if(it) it.image_url=dataUrl;
      }else{
        await api.updateExpense(id,{image_url:dataUrl});
        const it=expenses.find(x=>String(x.id)===String(id)); if(it) it.image_url=dataUrl;
        saveCache(); render();
      }
      showToast('Imagem trocada!','success');
      viewReceipt(id,isSplit);
    }catch(err){ showToast(`Erro ao trocar: ${String(err?.message||'').slice(0,90)}`,'error'); }
  };
  input.click();
}
async function deleteReceipt(id,isSplit){
  if(!confirm('Excluir a imagem deste comprovante?')) return;
  try{
    if(isSplit){
      await api.updateSplitExpense(id,{image_url:null});
      const it=(window._splitExpCache||[]).find(x=>String(x.id)===String(id)); if(it) it.image_url=null;
    }else{
      await api.updateExpense(id,{image_url:null});
      const it=expenses.find(x=>String(x.id)===String(id)); if(it) it.image_url=null;
      saveCache(); render();
    }
    document.getElementById('receipt-viewer')?.remove();
    showToast('Imagem excluída.','success');
    if(isSplit&&window._splitState?.groupId) openSplitGroup(window._splitState.groupId);
  }catch(err){ showToast(`Erro ao excluir: ${String(err?.message||'').slice(0,90)}`,'error'); }
}
async function confirmDeleteExpense(expId){
  const target=expenses.find(e=>e.id===expId);
  let alsoFuture=false;
  if(target?.installment_group&&target.installment_total>1){
    if(!confirm('Deletar esta parcela?')) return;
    alsoFuture=confirm(`Deletar também as parcelas seguintes de "${target.name}"?\n\nOK = apaga esta e as futuras.\nCancelar = apaga só esta.`);
  }else if(!confirm('Deletar este gasto?')) return;
  try{
    const res=await api.deleteExpense(expId);
    if(!res||!res.length){ showToast('Você não tem permissão para excluir este gasto.','error'); return; }
    if(target) logActivity(target.cat_id,'delete',target.name,target.value);
    let removed=1;
    if(alsoFuture){
      try{ const r=await api.deleteInstallmentsAfter(target.installment_group,target.installment_no); removed+=(r?.length||0); }catch{}
      await refreshFutureMonths();
    }
    expenses=expenses.filter(e=>e.id!==expId); saveCache(); render();
    showToast(removed>1?`${removed} parcelas removidas.`:'Removido.','success');
  }
  catch{ showToast('Erro ao deletar.','error'); }
}
function logActivity(catId,action,name,value){
  if(!catId) return Promise.resolve();
  return api.insertActivity({category_id:catId,action,expense_name:name,value}).catch(()=>{});
}
function actorLabel(log){
  const tag=userTag(log.actor_user_id);
  if(tag) return tag;
  if(log.actor_user_id===currentUser.id) return 'você';
  return log.actor_email?log.actor_email.split('@')[0]:'alguém';
}
async function openActivityLog(catId){
  const global=!catId;
  const cat=global?null:categories.find(c=>c.id===catId);
  const titleSuffix=cat?` · ${escapeHtml(cat.name)}`:(global?' recentes':'');
  openModal(`<div class="modal-title">Atividades${titleSuffix}</div>
    <div style="display:flex;align-items:center;justify-content:center;padding:28px 0;gap:12px;color:var(--text2)"><div class="spinner"></div>Carregando…</div>`);
  let logs=[];
  try{ logs=(global?await api.getAllActivity():await api.getActivity(catId))||[]; }
  catch{ document.getElementById('modal-content').innerHTML=`<div class="modal-title">Atividades</div><p class="modal-note">Não foi possível carregar. Verifique se a tabela activity_log existe.</p><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`; return; }
  const verb={create:'adicionou',edit:'editou',delete:'excluiu',cat_create:'criou a categoria',cat_edit:'ajustou a categoria',cat_delete:'excluiu a categoria'};
  const ico={create:'fa-plus',edit:'fa-pen',delete:'fa-trash',cat_create:'fa-layer-group',cat_edit:'fa-sliders',cat_delete:'fa-trash'};
  const col={create:'var(--accent-text)',edit:'var(--text2)',delete:'var(--red)',cat_create:'var(--accent-text)',cat_edit:'var(--text2)',cat_delete:'var(--red)'};
  const catName=id=>categories.find(c=>c.id===id)?.name||null;
  const rows=logs.length?logs.map(l=>{
    const cn=global&&!String(l.action).startsWith('cat_')?catName(l.category_id):null;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--accent-soft);color:${col[l.action]||'var(--text2)'}"><i class="fa-solid ${ico[l.action]||'fa-clock'}" aria-hidden="true"></i></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px"><strong>${escapeHtml(actorLabel(l))}</strong> ${verb[l.action]||l.action} <span style="color:var(--text2)">${escapeHtml(l.expense_name||'—')}</span></div>
        <div style="font-size:11px;color:var(--text3)">${cn?escapeHtml(cn)+' · ':''}${l.value!=null?brl(l.value)+' · ':''}${new Date(l.created_at).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
      </div>
    </div>`;}).join(''):`<p class="modal-note" style="text-align:center;padding:24px 0">Nenhuma atividade registrada ainda.</p>`;
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Atividades${titleSuffix}</div>
    <div style="margin-bottom:14px">${rows}</div>
    <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
}

const NO_GROUP='Sem grupo';
function showsOnHome(c){ return c.show_home!==false; }
function showsOnPlan(c){ return c.show_plan!==false; }
function homeCategories(){ return categories.filter(showsOnHome); }
function catGroup(cat){ return (cat&&cat.group_name&&String(cat.group_name).trim())||NO_GROUP; }
function allGroups(){
  const seen=[];
  categories.forEach(c=>{ const g=catGroup(c); if(g!==NO_GROUP&&!seen.includes(g)) seen.push(g); });
  return seen.sort((a,b)=>a.localeCompare(b));
}
function groupFieldHtml(cat){
  const cur=cat&&cat.group_name?String(cat.group_name):'';
  const sugg=[...new Set([...allGroups(),'Contábeis','Cartões','Negociações','Gastos gerais'])];
  return `<div class="form-group"><label class="form-label">Grupo <span style="color:var(--text3);text-transform:none;letter-spacing:0">(opcional)</span></label>
    <input class="form-input" id="f-cgroup" list="cgroup-list" maxlength="40" autocomplete="off" placeholder="Ex: Gastos gerais" value="${escapeHtml(cur)}"/>
    <datalist id="cgroup-list">${sugg.map(g=>`<option value="${escapeHtml(g)}"></option>`).join('')}</datalist>
    <span class="field-hint">Usado para somar as categorias por bloco no Planejamento.</span></div>`;
}
function visibilityFieldHtml(cat){
  const home=!cat||cat.show_home!==false;
  const plan=!cat||cat.show_plan!==false;
  return `<div class="form-group"><label class="form-label">Onde esta categoria aparece</label>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:6px">
      <input type="checkbox" id="f-cshome" ${home?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-cshome" style="font-size:13px;cursor:pointer;flex:1">Na tela Inicio <span style="color:var(--text2);font-size:12px">(no carrossel do dia a dia)</span></label>
    </div>
    ${isPlanningOn()?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px">
      <input type="checkbox" id="f-csplan" ${plan?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-csplan" style="font-size:13px;cursor:pointer;flex:1">No Planejamento <span style="color:var(--text2);font-size:12px">(entra na projecao de saldo)</span></label>
    </div>`:''}
    <span class="field-hint">Desmarque a Inicio para uma categoria que so existe no planejamento. Ela continua aqui em Categorias.</span></div>`;
}
function deferFieldHtml(cat){
  if(!isPlanningOn()) return '';
  return `<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:16px">
      <input type="checkbox" id="f-cdefer" ${cat&&cat.plan_defer?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-cdefer" style="font-size:13px;cursor:pointer;flex:1">Pago no cartao <span style="color:var(--text2);font-size:12px">(o que voce gasta neste mes so sai do saldo no mes seguinte)</span></label>
    </div>`;
}
function rolloverFieldsHtml(cat){
  const pos=cat?.rollover_positive, neg=cat?.rollover_negative;
  return `<div class="form-group"><label class="form-label">Saldo do mês anterior</label>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:6px">
      <input type="checkbox" id="f-roll-pos" ${pos?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-roll-pos" style="font-size:13px;cursor:pointer;flex:1">Levar a sobra <span style="color:var(--text2);font-size:12px">(o que não gastou vira limite extra no mês seguinte)</span></label>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px">
      <input type="checkbox" id="f-roll-neg" ${neg?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-roll-neg" style="font-size:13px;cursor:pointer;flex:1">Levar o estouro <span style="color:var(--text2);font-size:12px">(o que passou do limite é descontado do mês seguinte)</span></label>
    </div>
    <span class="field-hint">Deixe os dois desmarcados para decidir mês a mês, na mão, quando o mês fechar.</span></div>`;
}
function openAddCategory(){
  if(!isPro()&&categories.length>=CONFIG.FREE_MAX_CATEGORIES){ openPaywall('Crie categorias ilimitadas'); return; }
  openModal(`<div class="modal-title">Nova Categoria</div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-cname" placeholder="Ex: Academia" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Orçamento mensal (R$)</label>
      <input class="form-input" id="f-cbudget" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this)"/></div>
    ${groupFieldHtml(null)}
    ${visibilityFieldHtml(null)}
    ${deferFieldHtml(null)}
    ${rolloverFieldsHtml(null)}
    <button class="btn-primary" id="btn-save-cat" onclick="saveCategory(null)">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

function openEditCategory(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  openModal(`<div class="modal-title">Editar Categoria</div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-cname" value="${cat.name}" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Orçamento mensal (R$)</label>
      <input class="form-input" id="f-cbudget" type="text" inputmode="decimal" value="${cat.budget}" oninput="moneyKey(this)"/></div>
    ${groupFieldHtml(cat)}
    ${visibilityFieldHtml(cat)}
    ${deferFieldHtml(cat)}
    ${rolloverFieldsHtml(cat)}
    <button class="btn-primary" id="btn-save-cat" onclick="saveCategory('${catId}')">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveCategory(catId){
  const name=document.getElementById('f-cname').value.trim();
  const budget=parseNum(document.getElementById('f-cbudget').value);
  const group_name=(document.getElementById('f-cgroup')?.value||'').trim()||null;
  const plan_defer=!!document.getElementById('f-cdefer')?.checked;
  const sh=document.getElementById('f-cshome'); const show_home=sh?!!sh.checked:true;
  const sp=document.getElementById('f-csplan'); const show_plan=sp?!!sp.checked:(document.getElementById('f-cshome')?true:true);
  const rollover_positive=!!document.getElementById('f-roll-pos')?.checked;
  const rollover_negative=!!document.getElementById('f-roll-neg')?.checked;
  if(!name||isNaN(budget)||budget<=0){ showToast('Preencha todos os campos.','error'); return; }
  if(!catId&&!isPro()&&categories.length>=CONFIG.FREE_MAX_CATEGORIES){ openPaywall('Limite de categorias atingido'); return; }
  const btn=document.getElementById('btn-save-cat'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    if(catId){ await api.updateCategory(catId,{name,budget,group_name,plan_defer,show_home,show_plan,rollover_positive,rollover_negative}); logActivity(catId,'cat_edit',name,budget); }
    else{ const nid=uid(); await api.insertCategory({id:nid,name,budget,position:categories.length,group_name,plan_defer,show_home,show_plan,rollover_positive,rollover_negative}); logActivity(nid,'cat_create',name,budget); }
    categories=await api.getCategories();
    saveCache();
    vib(15);
    _closeModal(); render(); showToast('Categoria salva!','success');
  }catch{ showToast('Erro ao salvar.','error'); btn.disabled=false; btn.textContent='Salvar'; }
}

async function confirmDeleteCategory(catId){
  const cat=categories.find(c=>c.id===catId);
  if(!cat) return;
  if(cat.user_id!==currentUser.id){
    if(!confirm('Remover seu acesso a esta categoria compartilhada?')) return;
    try{
      const share=acceptedShares.find(s=>s.category_id===catId);
      if(share) await api.deleteCategoryShare(share.id);
      acceptedShares=acceptedShares.filter(s=>s.category_id!==catId);
      categories=await api.getCategories();
      saveCache(); render(); showToast('Acesso removido.','success');
    }catch{ showToast('Erro ao remover acesso.','error'); }
    return;
  }
  if(!confirm('Deletar esta categoria?')) return;
  try{ await logActivity(catId,'cat_delete',cat.name,cat.budget); await api.deleteCategory(catId); categories=categories.filter(c=>c.id!==catId); saveCache(); render(); showToast('Removida.','success'); }
  catch{ showToast('Erro ao deletar.','error'); }
}

function openCloseMonth(){
  const next=nextMonthKey(currentMonthKey);
  openModal(`<div class="modal-title">Fechar Mês</div>
    <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Ajuste os orçamentos para <strong style="color:var(--text)">${monthLabel(next)}</strong>:</p>
    ${categories.map(cat=>`<div class="month-adj-item">
      <div class="month-adj-name">${cat.name}</div>
      <div class="month-adj-row"><span style="font-size:12px;color:var(--text3);white-space:nowrap">Orçamento (R$)</span>
        <input class="form-input" id="adj-${cat.id}" type="text" inputmode="decimal" value="${cat.budget}" oninput="moneyKey(this)"/></div>
    </div>`).join('')}
    <button class="btn-primary" id="btn-close-month" onclick="confirmCloseMonth('${next}')" style="margin-top:8px">Fechar e Abrir ${monthLabel(next)}</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function confirmCloseMonth(nextKey){
  const btn=document.getElementById('btn-close-month'); btn.disabled=true; btn.textContent='Processando...';
  try{
    for(const cat of categories){ const inp=document.getElementById(`adj-${cat.id}`); if(inp){const v=parseNum(inp.value);if(!isNaN(v)&&v>0) await api.updateCategory(cat.id,{budget:v});} }
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

async function ensureMonthsExist(fromKey,toKey){
  let k=fromKey;
  const wanted=[];
  while(k<=toKey){ wanted.push(k); k=nextMonthKey(k); if(wanted.length>70) break; }
  const missing=wanted.filter(mk=>!months.find(m=>m.key===mk));
  for(const mk of missing){ try{ await api.insertMonth({key:mk,closed:false}); }catch{} }
  if(missing.length){ try{ months=await api.getMonths(); }catch{} }
}
async function refreshFutureMonths(){
  try{
    const rows=await api.getExpensesFrom(nextMonthKey(currentMonthKey))||[];
    const by={};
    rows.forEach(e=>{ const k=e.month_key; (by[k]=by[k]||{key:k,total:0,count:0}); by[k].total+=parseFloat(e.value||0); by[k].count++; });
    futureMonthKeys=Object.values(by).sort((a,b)=>a.key.localeCompare(b.key));
  }catch{ futureMonthKeys=[]; }
}
function openMonthPicker(){
  if(!isPro()){ openPaywall('Histórico de meses anteriores'); return; }
  const past=months.filter(m=>m.key<=currentMonthKey).sort((a,b)=>b.key.localeCompare(a.key));
  const row=(key,extra,closed)=>`<div onclick="selectMonth('${key}')" style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-radius:10px;margin-bottom:8px;background:${key===viewMonthKey?'var(--accent)':'var(--surface2)'};color:${key===viewMonthKey?'var(--on-accent)':'var(--text)'};font-weight:${key===viewMonthKey?600:400};cursor:pointer">
      <span>${monthLabel(key)} ${closed?'<span style="font-size:11px;opacity:.6">Fechado</span>':''}</span>
      ${extra?`<span style="font-size:11.5px;opacity:.75;white-space:nowrap">${extra}</span>`:''}
    </div>`;
  const futureHtml=futureMonthKeys.length?`
    <div class="cons-section" style="margin:18px 0 8px">Próximos meses · já comprometido</div>
    <p class="modal-note" style="margin-bottom:12px">Parcelas e recorrências que já estão lançadas para frente.</p>
    ${futureMonthKeys.map(f=>row(f.key,`${brl(f.total)} · ${f.count} ${f.count===1?'lançamento':'lançamentos'}`,false)).join('')}`:'';
  openModal(`<div class="modal-title">Selecionar Mês</div>
    ${past.map(m=>row(m.key,'',m.closed)).join('')}
    ${futureHtml}`);
}

async function selectMonth(key){
  viewMonthKey=key; currentCatIdx=0;
  _closeModal();
  expenses=await api.getExpenses(viewMonthKey);
  rollovers=await api.getRollovers(viewMonthKey).catch(()=>[]);
  render();
}

function onFab(){
  vib();
  if(currentTab==='categorias'){ openAddCategory(); return; }
  if(!categories.length){ showToast('Crie uma categoria primeiro.','error'); return; }
  const hc=homeCategories();
  const cat=hc[currentCatIdx]||hc[0];
  if(!cat){ showToast('Nenhuma categoria aparece no Início.','error'); return; }
  if(cat.user_id!==currentUser.id&&sharePerm(cat.id)!=='edit'){ showToast('Esta categoria é somente leitura.','error'); return; }
  openAddExpense(cat.id);
}

async function switchTab(tab){
  vib(5);
  currentTab=tab; currentCatIdx=0;
  document.querySelectorAll('.nav-item').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  viewMonthKey=currentMonthKey;
  expenses=await api.getExpenses(viewMonthKey);
  render();
}

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
    if(Math.abs(pct)<0.5) return `<span class="badge ok"><i class="fa-solid fa-equals" aria-hidden="true"></i> igual</span>`;
    return pct>0?`<span class="badge over"><i class="fa-solid fa-arrow-up" aria-hidden="true"></i> ${Math.abs(pct).toFixed(0)}%</span>`:`<span class="badge saved"><i class="fa-solid fa-arrow-down" aria-hidden="true"></i> ${Math.abs(pct).toFixed(0)}%</span>`;
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

function openMonthOverride(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const eff=baseBudget(cat,currentMonthKey);
  const ov=hasOverride(cat,currentMonthKey);
  openModal(`<div class="modal-title">Ajustar orçamento · ${escapeHtml(cat.name)}</div>
    <p class="modal-note">Teve um mês fora da rotina (festas, viagem, uma compra grande)? Defina um orçamento só para <strong>${monthLabel(currentMonthKey)}</strong>. O valor padrão dos outros meses <strong>não muda</strong>.</p>
    <div class="info-rows">
      <div class="info-row"><span><i class="fa-regular fa-bookmark" aria-hidden="true"></i> Orçamento padrão</span><strong>${brl(cat.budget)}/mês</strong></div>
      <div class="info-row"><span><i class="fa-regular fa-calendar" aria-hidden="true"></i> Ajuste vale só para</span><strong>${monthLabel(currentMonthKey)}</strong></div>
    </div>
    <div class="form-group"><label class="form-label">Orçamento de ${monthLabel(currentMonthKey)} (R$)</label>
      <input class="form-input" id="f-ovbudget" type="text" inputmode="decimal" value="${eff}" oninput="moneyKey(this)"/>
      <span class="field-hint">Só este mês passa a usar este valor. ${ov?'Você pode voltar ao padrão a qualquer momento.':''}</span></div>
    <button class="btn-primary" id="btn-ov" onclick="saveMonthOverride('${catId}')">Salvar só para ${monthLabel(currentMonthKey)}</button>
    ${ov?`<button class="btn-secondary" onclick="revertMonthOverride('${catId}')">Voltar ao padrão (${brl(cat.budget)}/mês)</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveMonthOverride(catId){
  const v=parseNum(document.getElementById('f-ovbudget').value);
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

function transferAvailable(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return 0;
  const spent=expenses.filter(e=>e.cat_id===catId).reduce((s,e)=>s+parseFloat(e.value),0);
  return Math.round((effBudget(cat,currentMonthKey)-spent)*100)/100;
}
function openTransferBudget(catId){
  const owned=categories.filter(c=>c.user_id===currentUser.id);
  if(owned.length<2){ showToast('Você precisa de ao menos 2 categorias para transferir.','error'); return; }
  const fromId=catId&&owned.some(c=>c.id===catId)?catId:owned[0].id;
  openModal(transferBudgetHtml(fromId));
}
function transferBudgetHtml(fromId){
  const owned=categories.filter(c=>c.user_id===currentUser.id);
  const toOptions=owned.filter(c=>c.id!==fromId);
  const avail=transferAvailable(fromId);
  return `<div class="modal-title">Transferir limite entre categorias</div>
    <p class="modal-note">Mova uma parte do orçamento disponível deste mês de uma categoria para outra. Vale só para <strong>${monthLabel(currentMonthKey)}</strong> — o orçamento padrão de cada categoria não muda.</p>
    <div class="form-group"><label class="form-label">De (categoria com sobra)</label>
      <select class="form-input" id="f-transfer-from" onchange="onTransferFromChange()">
        ${owned.map(c=>`<option value="${c.id}"${c.id===fromId?' selected':''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
      <span class="field-hint" id="f-transfer-avail">Disponível: ${brl(avail)}</span></div>
    <div class="form-group"><label class="form-label">Para</label>
      <select class="form-input" id="f-transfer-to">
        ${toOptions.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Quanto transferir (R$)</label>
      <input class="form-input" id="f-transfer-amount" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this)"/></div>
    <button class="btn-primary" id="btn-transfer" onclick="saveTransferBudget()">Transferir</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`;
}
function onTransferFromChange(){
  const fromId=document.getElementById('f-transfer-from').value;
  const avail=transferAvailable(fromId);
  const hint=document.getElementById('f-transfer-avail'); if(hint) hint.textContent=`Disponível: ${brl(avail)}`;
  const toSel=document.getElementById('f-transfer-to');
  const owned=categories.filter(c=>c.user_id===currentUser.id&&c.id!==fromId);
  const prevVal=toSel.value;
  toSel.innerHTML=owned.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if(owned.some(c=>c.id===prevVal)) toSel.value=prevVal;
}
async function saveTransferBudget(){
  const fromId=document.getElementById('f-transfer-from').value;
  const toId=document.getElementById('f-transfer-to').value;
  const amount=parseNum(document.getElementById('f-transfer-amount').value);
  if(!toId||fromId===toId){ showToast('Escolha duas categorias diferentes.','error'); return; }
  if(isNaN(amount)||amount<=0){ showToast('Informe um valor válido.','error'); return; }
  const avail=transferAvailable(fromId);
  if(amount>avail+0.005){ showToast(`Só há ${brl(avail)} disponível nessa categoria.`,'error'); return; }
  const fromCat=categories.find(c=>c.id===fromId), toCat=categories.find(c=>c.id===toId);
  const newFromBudget=Math.round((baseBudget(fromCat,currentMonthKey)-amount)*100)/100;
  const newToBudget=Math.round((baseBudget(toCat,currentMonthKey)+amount)*100)/100;
  const m=months.find(x=>x.key===currentMonthKey); if(!m) return;
  const budgets={...(m.budgets||{}),[fromId]:newFromBudget,[toId]:newToBudget};
  const btn=document.getElementById('btn-transfer'); btn.disabled=true; btn.textContent='Transferindo...';
  try{
    await api.setMonthBudgets(currentMonthKey,budgets);
    m.budgets=budgets;
    try{
      const row=await api.insertBudgetTransfer({month_key:currentMonthKey,from_cat_id:fromId,to_cat_id:toId,amount});
      budgetTransfers.unshift(row?.[0]||{month_key:currentMonthKey,from_cat_id:fromId,to_cat_id:toId,amount,created_at:new Date().toISOString()});
    }catch{}
    saveCache(); vib(15);
    _closeModal(); render();
    showToast(`${brl(amount)} transferido de ${fromCat.name} para ${toCat.name}.`,'success');
  }catch{
    btn.disabled=false; btn.textContent='Transferir';
    showToast('Erro — confira se a coluna "budgets" existe no Supabase.','error');
  }
}

function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),2500);
}

function monthBalance(cat,monthKey,exps,rolls){
  const spent=exps.filter(e=>e.cat_id===cat.id).reduce((s,e)=>s+parseFloat(e.value||0),0);
  const roll=(rolls||[]).filter(r=>r.cat_id===cat.id&&r.to_month===monthKey).reduce((s,r)=>s+parseFloat(r.amount||0),0);
  return Math.round((baseBudget(cat,monthKey)+roll-spent)*100)/100;
}
async function applyAutoRollover(){
  const flagged=categories.filter(c=>c.user_id===currentUser.id&&(c.rollover_positive||c.rollover_negative));
  if(!flagged.length) return;
  const prevKey=prevMonthKey(currentMonthKey);
  const pending=flagged.filter(c=>!rollovers.some(r=>r.cat_id===c.id&&r.from_month===prevKey&&r.to_month===currentMonthKey));
  if(!pending.length) return;
  let prevExps=[],prevRolls=[];
  try{ [prevExps,prevRolls]=await Promise.all([api.getExpenses(prevKey),api.getRollovers(prevKey).catch(()=>[])]); }catch{ return; }
  let created=false;
  for(const c of pending){
    const bal=monthBalance(c,prevKey,prevExps||[],prevRolls||[]);
    if(Math.abs(bal)<0.005) continue;
    if(bal>0&&!c.rollover_positive) continue;
    if(bal<0&&!c.rollover_negative) continue;
    try{
      const row=await api.insertRollover({cat_id:c.id,from_month:prevKey,to_month:currentMonthKey,amount:bal,auto:true});
      if(row&&row[0]) rollovers.push(row[0]);
      created=true;
    }catch{}
  }
  if(created&&viewMonthKey===currentMonthKey){ saveCache(); render(); }
}
async function openRolloverMonth(){
  const fromKey=viewMonthKey, toKey=nextMonthKey(fromKey);
  openModal(`<div class="modal-title">Levar saldos para ${monthLabel(toKey)}</div><div class="loading"><div class="spinner"></div></div>`);
  let exps=[],rolls=[],existing=[];
  try{ [exps,rolls,existing]=await Promise.all([api.getExpenses(fromKey),api.getRollovers(fromKey).catch(()=>[]),api.getRollovers(toKey).catch(()=>[])]); }
  catch{ document.getElementById('modal-content').innerHTML=`<div class="modal-title">Saldos</div><p class="modal-note">Erro ao carregar.</p><button class="btn-secondary" onclick="_closeModal()">Fechar</button>`; return; }
  const owned=categories.filter(c=>c.user_id===currentUser.id);
  const rows=owned.map(c=>({cat:c,bal:monthBalance(c,fromKey,exps||[],rolls||[]),done:(existing||[]).some(r=>r.cat_id===c.id&&r.from_month===fromKey)})).filter(r=>Math.abs(r.bal)>=0.005);
  if(!rows.length){
    document.getElementById('modal-content').innerHTML=`<div class="modal-title">Levar saldos para ${monthLabel(toKey)}</div>
      <p class="modal-note">Nenhuma categoria de ${monthLabel(fromKey)} tem sobra ou estouro para levar.</p>
      <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
    return;
  }
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Levar saldos para ${monthLabel(toKey)}</div>
    <p class="modal-note">Escolha o que levar de <strong>${monthLabel(fromKey)}</strong>. A sobra vira limite extra; o estouro é descontado.</p>
    <div class="friend-check-list" style="max-height:320px">
      ${rows.map(r=>`<label class="friend-check">
        <input type="checkbox" class="roll-cb" data-cat="${r.cat.id}" data-amount="${r.bal}" ${r.done?'disabled':'checked'}/>
        <span class="friend-check-main">${escapeHtml(r.cat.name)}
          <span class="friend-check-sub" style="color:${r.bal>=0?'var(--accent-text)':'var(--red)'}">${r.bal>=0?'sobra':'estouro'} ${brl(Math.abs(r.bal))}${r.done?' · já levado':''}</span>
        </span>
      </label>`).join('')}
    </div>
    <button class="btn-primary" id="btn-roll" onclick="saveRolloverMonth('${fromKey}','${toKey}')">Levar selecionados</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`;
}
async function saveRolloverMonth(fromKey,toKey){
  const picks=[...document.querySelectorAll('.roll-cb')].filter(cb=>cb.checked&&!cb.disabled)
    .map(cb=>({cat_id:cb.dataset.cat,amount:parseFloat(cb.dataset.amount)}));
  if(!picks.length){ showToast('Selecione ao menos uma categoria.','error'); return; }
  const btn=document.getElementById('btn-roll'); btn.disabled=true; btn.textContent='Levando...';
  try{
    for(const p of picks) await api.insertRollover({cat_id:p.cat_id,from_month:fromKey,to_month:toKey,amount:p.amount,auto:false});
    if(toKey===viewMonthKey) rollovers=await api.getRollovers(viewMonthKey).catch(()=>rollovers);
    vib(15); saveCache(); _closeModal(); render();
    showToast(`Saldos levados para ${monthLabel(toKey)}.`,'success');
  }catch{
    btn.disabled=false; btn.textContent='Levar selecionados';
    showToast('Erro — confira se a tabela budget_rollovers existe no Supabase.','error');
  }
}
function cardInvoiceMonth(card,dateStr){
  if(!card||!dateStr) return null;
  const [y,m,d]=dateStr.split('-').map(Number);
  const closing=parseInt(card.closing_day,10)||1;
  return d<=closing?monthKeyOf(new Date(y,m-1,1)):monthKeyOf(new Date(y,m,1));
}
function cardLabel(id){ const c=cards.find(x=>x.id===id); return c?c.name:null; }

function monthInputHtml(id,val){ return `<input class="form-input" id="${id}" type="month" value="${val||''}"/>`; }

async function togglePlanning(){
  const on=!isPlanningOn();
  localStorage.setItem('gc-planning',on?'1':'0');
  api.updateUserMeta({planning_enabled:on}).catch(()=>{});
  vib(8);
  if(on){ try{ planEntries=await api.getPlanEntries()||[]; }catch{} }
  else { planEntries=[]; histView='hist'; document.body.classList.remove('plan-wide'); }
  openAccountModal(); render();
  showToast(on?'Planejamento ativado.':'Planejamento desativado.','success');
}

function entryEndMonth(e){
  if(e.schedule==='once') return e.start_month;
  if(e.schedule==='installments'&&e.count){
    let mk=e.start_month;
    for(let i=1;i<e.count;i++) mk=nextMonthKey(mk);
    return mk;
  }
  return e.end_month||null;
}
function entryAppliesTo(e,mk){
  if(!e||mk<e.start_month) return false;
  const end=entryEndMonth(e);
  return end?mk<=end:true;
}
function entryValueFor(e,mk){
  const mv=e.month_values&&e.month_values[mk];
  const v=(mv!=null&&!isNaN(parseFloat(mv)))?parseFloat(mv):parseFloat(e.value||0);
  return Math.round(v*100)/100;
}
function entryInstallmentNo(e,mk){
  if(e.schedule!=='installments') return null;
  let mk2=e.start_month,n=1;
  while(mk2<mk){ mk2=nextMonthKey(mk2); n++; }
  return n;
}
function entriesOut(catId,mk){ return planEntries.filter(e=>e.kind==='out'&&e.cat_id===catId&&entryAppliesTo(e,mk)); }
function incomesForMonth(mk){
  return planEntries.filter(e=>e.kind==='in'&&entryAppliesTo(e,mk))
    .reduce((s,e)=>s+entryValueFor(e,mk),0);
}
function isRowPaid(e){
  if(e.paid===true) return true;
  if(e.paid===false) return false;
  if(e.card_id) return false;
  return (e.month_key||'')<=currentMonthKey;
}

async function openPlanEntries(catId){
  openModal(`<div class="modal-title">Meus compromissos</div><div class="loading"><div class="spinner"></div></div>`);
  try{ planEntries=await api.getPlanEntries()||[]; }catch{}
  renderPlanEntriesModal(catId||'');
}
function scheduleLabel(e){
  if(e.schedule==='once') return `So em ${monthLabel(e.start_month)}`;
  if(e.schedule==='installments') return `${e.count}x de ${monthLabel(e.start_month)} a ${monthLabel(entryEndMonth(e))}`;
  return `Todo mes desde ${monthLabel(e.start_month)}${e.end_month?` ate ${monthLabel(e.end_month)}`:''}`;
}
function renderPlanEntriesModal(preCat){
  const list=planEntries.length?planEntries.map(e=>{
    const cat=e.cat_id?categories.find(c=>c.id===e.cat_id):null;
    const nOv=Object.keys(e.month_values||{}).length;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
          <i class="fa-solid fa-arrow-trend-${e.kind==='in'?'up':'down'}" style="color:${e.kind==='in'?'var(--accent-text)':'var(--red)'};margin-right:7px" aria-hidden="true"></i>${escapeHtml(e.name)}${e.barcode?' <i class="fa-solid fa-barcode" style="font-size:10px;color:var(--text3)" aria-hidden="true"></i>':''}
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${brl(e.value)} &middot; ${scheduleLabel(e)}${cat?` &middot; ${escapeHtml(cat.name)}`:''}${nOv?` &middot; ${nOv} ajustado(s)`:''}</div>
      </div>
      <div class="icon-btn" style="border-color:#ff4f4f44;color:var(--red)" onclick="removePlanEntry('${e.id}')" aria-label="Remover"><i class="fa-solid fa-trash" aria-hidden="true"></i></div>
    </div>`;}).join(''):`<p class="modal-note">Nenhum compromisso ainda. Cadastre salario, contas fixas, parcelas de cartao e boletos &mdash; e com eles que o app projeta seu saldo para frente.</p>`;
  const owned=categories.filter(c=>c.user_id===currentUser.id);
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Meus compromissos</div>
    <div style="margin-bottom:16px">${list}</div>
    <div class="form-group"><label class="form-label">Tipo</label>
      <div class="dm-seg" id="f-pe-kind">
        <button type="button" class="dm-seg-btn active" data-v="out" onclick="peSeg(this,'kind')">Sai</button>
        <button type="button" class="dm-seg-btn" data-v="in" onclick="peSeg(this,'kind')">Entra</button>
      </div></div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-pe-name" placeholder="Ex: Nubank, Salario, IPTU" maxlength="60" autocomplete="off"/></div>
    <div class="form-group"><label class="form-label">Valor (R$)</label>
      <input class="form-input" id="f-pe-value" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this)"/></div>
    <div class="form-group" id="f-pe-cat-wrap"><label class="form-label">Categoria</label>
      <select class="form-input" id="f-pe-cat">
        <option value="">Sem categoria</option>
        ${owned.map(c=>`<option value="${c.id}"${c.id===preCat?' selected':''}>${escapeHtml(c.name)}</option>`).join('')}
      </select></div>
    <div class="form-group"><label class="form-label">Quando</label>
      <div class="dm-seg" id="f-pe-sched">
        <button type="button" class="dm-seg-btn active" data-v="monthly" onclick="peSeg(this,'sched')">Todo mes</button>
        <button type="button" class="dm-seg-btn" data-v="installments" onclick="peSeg(this,'sched')">Parcelas</button>
        <button type="button" class="dm-seg-btn" data-v="once" onclick="peSeg(this,'sched')">Uma vez</button>
      </div></div>
    <div style="display:flex;gap:10px">
      <div class="form-group" style="flex:1"><label class="form-label" id="f-pe-start-lbl">A partir de</label>
        ${monthInputHtml('f-pe-start',currentMonthKey)}</div>
      <div class="form-group" style="flex:1" id="f-pe-count-wrap" hidden><label class="form-label">N de parcelas</label>
        <input class="form-input" id="f-pe-count" type="number" inputmode="numeric" min="2" max="360" placeholder="12"/></div>
    </div>
    <div class="form-group"><label class="form-label">Vence dia <span style="color:var(--text3);text-transform:none;letter-spacing:0">(opcional)</span></label>
      <input class="form-input" id="f-pe-due" type="number" inputmode="numeric" min="1" max="31" placeholder="10"/></div>
    <div class="form-group" id="f-pe-barcode-wrap"><label class="form-label">Codigo de barras <span style="color:var(--text3);text-transform:none;letter-spacing:0">(opcional)</span></label>
      <textarea class="form-input" id="f-pe-barcode" rows="2" maxlength="200" placeholder="Cole aqui o codigo do boleto" style="resize:vertical;font-family:var(--font-body)"></textarea>
      <span class="field-hint">Fica guardado no compromisso e voce copia com um toque na projecao.</span></div>
    <button class="btn-primary" id="btn-save-pe" onclick="savePlanEntry()">Adicionar compromisso</button>
    <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`;
}
function peSeg(btn,which){
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(which==='sched'){
    const v=btn.dataset.v;
    const cw=document.getElementById('f-pe-count-wrap'); if(cw) cw.hidden=v!=='installments';
    const lbl=document.getElementById('f-pe-start-lbl'); if(lbl) lbl.textContent=v==='once'?'Mes':'A partir de';
  }
  if(which==='kind'){
    const isIn=btn.dataset.v==='in';
    const cw=document.getElementById('f-pe-cat-wrap'); if(cw) cw.hidden=isIn;
    const bw=document.getElementById('f-pe-barcode-wrap'); if(bw) bw.hidden=isIn;
  }
}
function peVal(id,def){ const el=document.querySelector('#'+id+' .dm-seg-btn.active'); return el?el.dataset.v:def; }
async function savePlanEntry(){
  const kind=peVal('f-pe-kind','out');
  const schedule=peVal('f-pe-sched','monthly');
  const name=(document.getElementById('f-pe-name').value||'').trim();
  const value=parseNum(document.getElementById('f-pe-value').value);
  const start_month=document.getElementById('f-pe-start').value;
  const cat_id=kind==='out'?(document.getElementById('f-pe-cat').value||null):null;
  const countRaw=parseInt(document.getElementById('f-pe-count').value,10);
  const dueRaw=parseInt(document.getElementById('f-pe-due').value,10);
  const barcode=kind==='out'?((document.getElementById('f-pe-barcode').value||'').trim()||null):null;
  if(!name){ showToast('Informe o nome.','error'); return; }
  if(isNaN(value)||value<=0){ showToast('Informe um valor valido.','error'); return; }
  if(!start_month){ showToast('Informe o mes.','error'); return; }
  if(schedule==='installments'&&(!countRaw||countRaw<2)){ showToast('Informe o numero de parcelas.','error'); return; }
  const btn=document.getElementById('btn-save-pe'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    await api.insertPlanEntry({kind,name,value,cat_id,schedule,start_month,end_month:null,
      count:schedule==='installments'?countRaw:null,month_values:{},barcode,
      due_day:isNaN(dueRaw)?null:dueRaw,position:planEntries.length});
    planEntries=await api.getPlanEntries()||[];
    vib(12); renderPlanEntriesModal(cat_id||''); showToast('Compromisso adicionado!','success');
  }catch{ showToast('Erro ao salvar. Confira se a tabela plan_entries existe no Supabase.','error'); btn.disabled=false; btn.textContent='Adicionar compromisso'; }
}
async function removePlanEntry(id){
  if(!confirm('Remover este compromisso? Os lancamentos ja marcados como pagos continuam.')) return;
  try{ await api.deletePlanEntry(id); planEntries=planEntries.filter(e=>e.id!==id); renderPlanEntriesModal(''); render(); showToast('Compromisso removido.','success'); }
  catch{ showToast('Erro ao remover.','error'); }
}

function anchorFor(mk){ return anchors.find(a=>a.month_key===mk)||null; }
function plannedFor(cat,mk){
  const m=months.find(x=>x.key===mk);
  const ov=m&&m.budgets?m.budgets[cat.id]:null;
  const base=(ov!=null&&!isNaN(parseFloat(ov)))?parseFloat(ov):parseFloat(cat.budget||0);
  return Math.round(base*100)/100;
}
function projectMonths(n,startKey,allExps){
  const start=startKey||projectionStart();
  const rows=[];
  const byMonth={};
  (allExps||[]).forEach(e=>{ const k=e.month_key; if(!k) return; (byMonth[k]=byMonth[k]||[]).push(e); });
  const owned=categories.filter(c=>c.user_id===currentUser.id&&showsOnPlan(c));
  let carry=0, mk=start;
  for(let i=0;i<n;i++){
    const anc=anchorFor(mk);
    const saldoIni=anc?parseFloat(anc.balance):(i===0?0:carry);
    const receitas=Math.round(incomesForMonth(mk)*100)/100;
    const isPast=mk<currentMonthKey;
    const monthRows=byMonth[mk]||[];
    const porCategoria={}, porGrupo={};
    let despesas=0, realizado=0;
    owned.forEach(c=>{
      const catRows=monthRows.filter(e=>e.cat_id===c.id);
      const items=entriesOut(c.id,mk);
      const itens=items.map(it=>{
        const lanc=catRows.find(e=>e.plan_entry_id===it.id);
        return {itemId:it.id,name:it.name,
          value:lanc?Math.round(parseFloat(lanc.value||0)*100)/100:entryValueFor(it,mk),
          paid:!!lanc,expenseId:lanc?lanc.id:null,barcode:it.barcode||null,dueDay:it.due_day||null,
          inst:it.schedule==='installments'?`${entryInstallmentNo(it,mk)}/${it.count}`:null};
      });
      const avulsos=catRows.filter(e=>!e.plan_entry_id).map(e=>({
        expenseId:e.id,name:e.name,value:Math.round(parseFloat(e.value||0)*100)/100,
        paid:isRowPaid(e),fromItem:false}));
      const somaItens=itens.reduce((s,x)=>s+x.value,0);
      const somaAvulsos=avulsos.reduce((s,x)=>s+x.value,0);
      const total=Math.round((somaItens+somaAvulsos)*100)/100;
      const pagoNoMes=Math.round((itens.filter(x=>x.paid).reduce((s,x)=>s+x.value,0)
        +avulsos.filter(x=>x.paid).reduce((s,x)=>s+x.value,0))*100)/100;
      const srcMk=c.plan_defer?prevMonthKey(mk):mk;
      const plan=(c.plan_defer&&srcMk<start)?0:plannedFor(c,srcMk);
      const val=items.length?total:(isPast?pagoNoMes:Math.max(plan,total));
      realizado+=pagoNoMes;
      despesas+=val;
      porCategoria[c.id]={real:total,plan,val,name:c.name,group:catGroup(c),
        itens,avulsos,pago:pagoNoMes,driven:items.length>0};
      const g=catGroup(c);
      porGrupo[g]=Math.round(((porGrupo[g]||0)+val)*100)/100;
    });
    despesas=Math.round(despesas*100)/100;
    realizado=Math.round(realizado*100)/100;
    const saldoFim=Math.round((saldoIni+receitas-despesas)*100)/100;
    rows.push({mk,saldoIni,receitas,despesas,realizado,porCategoria,porGrupo,
      sobra:Math.round((receitas-despesas)*100)/100,
      saldoRealizado:Math.round((saldoIni+receitas-realizado)*100)/100,
      saldoFim,anchored:!!anc,isPast});
    carry=saldoFim; mk=nextMonthKey(mk);
  }
  return rows;
}
function projectionStart(){
  if(!anchors.length) return currentMonthKey;
  const keys=anchors.map(a=>a.month_key).sort();
  const past=keys.filter(k=>k<=currentMonthKey);
  return past.length?past[past.length-1]:keys[0];
}
function aggregateByYear(rows){
  const years={};
  rows.forEach(r=>{
    const y=r.mk.split('-')[0];
    if(!years[y]){ years[y]={mk:y,saldoIni:r.saldoIni,receitas:0,despesas:0,porGrupo:{},saldoFim:r.saldoFim,isPast:r.isPast}; }
    const a=years[y];
    a.receitas=Math.round((a.receitas+r.receitas)*100)/100;
    a.despesas=Math.round((a.despesas+r.despesas)*100)/100;
    Object.entries(r.porGrupo).forEach(([g,v])=>{ a.porGrupo[g]=Math.round(((a.porGrupo[g]||0)+v)*100)/100; });
    a.saldoFim=r.saldoFim;
  });
  return Object.values(years).map(a=>({...a,sobra:Math.round((a.receitas-a.despesas)*100)/100}));
}
async function openCards(){
  openModal(`<div class="modal-title">Meus cartões</div><div class="loading"><div class="spinner"></div></div>`);
  try{ cards=await api.getCards()||[]; }catch{}
  renderCardsModal();
}
function renderCardsModal(){
  const list=cards.length?cards.map(c=>`
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="min-width:0">
        <div style="font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="fa-solid fa-credit-card" style="color:var(--accent-text);margin-right:7px" aria-hidden="true"></i>${escapeHtml(c.name)}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">Fecha dia ${c.closing_day}${c.due_day?` · vence dia ${c.due_day}`:''}</div>
      </div>
      <div class="icon-btn" style="border-color:#ff4f4f44;color:var(--red)" onclick="removeCard('${c.id}')" aria-label="Remover cartão"><i class="fa-solid fa-trash" aria-hidden="true"></i></div>
    </div>`).join(''):`<p class="modal-note">Nenhum cartão cadastrado. Ao cadastrar, o app calcula sozinho em qual fatura cada compra entra.</p>`;
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Meus cartões</div>
    <div style="margin-bottom:16px">${list}</div>
    <div class="form-group"><label class="form-label">Nome do cartão</label>
      <input class="form-input" id="f-card-name" placeholder="Ex: Nubank" maxlength="40" autocomplete="off"/></div>
    <div style="display:flex;gap:10px">
      <div class="form-group" style="flex:1"><label class="form-label">Fecha dia</label>
        <input class="form-input" id="f-card-closing" type="number" inputmode="numeric" min="1" max="31" placeholder="3"/></div>
      <div class="form-group" style="flex:1"><label class="form-label">Vence dia</label>
        <input class="form-input" id="f-card-due" type="number" inputmode="numeric" min="1" max="31" placeholder="10"/></div>
    </div>
    <button class="btn-primary" id="btn-save-card" onclick="saveCard()">Adicionar cartão</button>
    <button class="btn-secondary" onclick="openAccountModal()">Voltar</button>`;
}
async function saveCard(){
  const name=(document.getElementById('f-card-name').value||'').trim();
  const closing_day=parseInt(document.getElementById('f-card-closing').value,10);
  const dueRaw=parseInt(document.getElementById('f-card-due').value,10);
  const due_day=isNaN(dueRaw)?null:dueRaw;
  if(!name){ showToast('Informe o nome do cartão.','error'); return; }
  if(!closing_day||closing_day<1||closing_day>31){ showToast('Informe o dia de fechamento (1 a 31).','error'); return; }
  if(due_day!=null&&(due_day<1||due_day>31)){ showToast('Dia de vencimento inválido.','error'); return; }
  const btn=document.getElementById('btn-save-card'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    await api.insertCard({name,closing_day,due_day});
    cards=await api.getCards()||[];
    vib(12); renderCardsModal(); showToast('Cartão adicionado!','success');
  }catch{ showToast('Erro ao salvar. Confira se a tabela cards existe no Supabase.','error'); btn.disabled=false; btn.textContent='Adicionar cartão'; }
}
async function removeCard(id){
  if(!confirm('Remover este cartão? Os lançamentos existentes continuam, apenas sem o cartão vinculado.')) return;
  try{ await api.deleteCard(id); cards=cards.filter(c=>c.id!==id); renderCardsModal(); showToast('Cartão removido.','success'); }
  catch{ showToast('Erro ao remover.','error'); }
}

const TUTORIAL_KEY = 'gc-tutorial-v2';
const tutNav=(tab)=>document.querySelector(`.nav-item[data-tab="${tab}"]`);
const tutGo=(tab)=>{ const t=tutNav(tab); if(t) t.click(); };
const TUTORIAL_STEPS = [
  {
    title: 'Bem-vindo ao GastoCerto!',
    body: 'Em poucos passos você vai conhecer tudo o que dá para fazer. Vamos lá?',
    target: null,
  },
  {
    title: 'Início — seus gastos do mês',
    body: 'Suas categorias aparecem em carrossel: deslize para o lado para navegar. Em cada uma você vê o disponível, o quanto já gastou e uma previsão de quando o saldo acaba. No ícone de relógio você confere o histórico de atividades, e o ícone de imagem abre o comprovante de um lançamento.',
    target: ()=>tutNav('home'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Categorias',
    body: 'Crie categorias como "Mercado", "Academia" ou "Aluguel", cada uma com seu orçamento mensal — o total orçado de todas aparece no topo da lista. Arraste pela alça para reordenar e toque no lápis para editar. Ao lançar um gasto, escolha "Recorrente" para repetir todo mês ou "Cartão" para compras na fatura. Cadastre seus cartões em <strong>Sua conta › Meus cartões</strong> com o dia de fechamento e o app calcula sozinho em qual fatura cada compra cai — você também pode não escolher cartão nenhum e decidir na mão. Ao editar a categoria dá para mandar a sobra e/ou o estouro do mês seguirem automaticamente para o mês seguinte. E no ícone <i class="fa-solid fa-right-left"></i> do topo do card você transfere um pedaço do limite de uma categoria para outra, só neste mês.',
    target: ()=>tutNav('categorias'),
    action: ()=>tutGo('categorias'),
  },
  {
    title: 'Compartilhe uma categoria',
    body: 'Em uma categoria sua, toque em "Compartilhar" para dar acesso a um amigo — só leitura ou também edição. Ele recebe um convite dentro do app (sem e-mail) e os lançamentos de vocês aparecem juntos, identificados por @usuário. Em "Exportar" você gera uma imagem do resumo para enviar a quem quiser.',
    target: ()=>tutNav('home'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Histórico',
    body: 'Acompanhe sua média de gasto por dia, a projeção do mês, a variação em relação ao mês anterior e a distribuição dos gastos por categoria. Tem ainda o gráfico de evolução por mês e o consolidado. Pelo seletor de mês, no topo, você também navega para os <strong>próximos meses</strong> e vê quanto já está comprometido com parcelas antes mesmo de o mês começar.',
    target: ()=>tutNav('historico'),
    action: ()=>tutGo('historico'),
  },
  {
    title: 'Amigos',
    body: 'Adicione pessoas por @usuário ou e-mail no campo do final da aba. Toque no card de um amigo para abrir o chat de gastos 1 a 1: registre despesas com divisão (50/50 ou personalizada), lance pagamentos e veja o saldo (quem deve a quem) e o extrato completo. Para remover alguém, arraste o card para a esquerda.',
    target: ()=>tutNav('amigos'),
    action: ()=>tutGo('amigos'),
  },
  {
    title: 'Divisão em grupo',
    body: 'Para rachar despesas entre três ou mais pessoas (viagens, repúblicas, rolês), crie um grupo, selecione os amigos e lance os gastos. O app calcula automaticamente quem deve quanto para quem e você marca o que já foi pago.',
    target: ()=>tutNav('divisao'),
    action: ()=>tutGo('divisao'),
  },
  {
    title: 'Botão de ação rápida',
    body: 'O botão verde no canto adiciona um gasto (no Início) ou uma categoria (em Categorias), conforme a aba em que você está.',
    target: ()=>document.getElementById('fab'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Sua conta',
    body: 'Toque no ícone de perfil, no topo, para definir seu @usuário, alternar entre tema claro e escuro, ver os planos e rever este tutorial quando quiser.',
    target: ()=>document.getElementById('account-btn'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Tudo pronto!',
    body: 'Comece criando uma categoria e registrando seus gastos. Para rever este tutorial, é só abrir sua conta pelo ícone no topo.',
    target: null,
  },
];

let tutStep=0, tutEl=null;

function showTutorial(force=false){
  if(!force&&(localStorage.getItem(TUTORIAL_KEY)||currentUser?.user_metadata?.tutorial_done)) return;
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

  const target=step.target?.();
  const backdrop=document.createElement('div');
  backdrop.className='tut-backdrop';
  if(target) backdrop.style.background='transparent';
  backdrop.onclick=()=>{};
  overlay.appendChild(backdrop);

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
  const vh=measuredAppHeight();
  if(target){
    const r=target.getBoundingClientRect();
    if(r.top>vh*0.5){ card.style.bottom=`${vh-r.top+16}px`; card.style.top='auto'; }
    else{ card.style.top=`${Math.min(r.bottom+18, vh-240)}px`; }
  }else{
    card.style.top=`${vh/2-110}px`;
  }

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
  api.updateUserMeta({tutorial_done:true}).catch(()=>{});
  document.getElementById('tut-overlay')?.remove();
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
  const hadController=!!navigator.serviceWorker.controller;
  let refreshing=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{
    if(refreshing||!hadController) return;
    refreshing=true;
    window.location.reload();
  });
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
      reg.update().catch(()=>{});
      document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') reg.update().catch(()=>{}); });
      reg.addEventListener('updatefound',()=>{
        const sw=reg.installing;
        if(!sw) return;
        sw.addEventListener('statechange',()=>{ if(sw.state==='installed'&&navigator.serviceWorker.controller) sw.postMessage('skip-waiting'); });
      });
    }).catch(()=>{});
  });
}
bootstrapAuth();
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')ensureValidSession();});
window.addEventListener('pageshow',()=>ensureValidSession());
window.addEventListener('online',()=>ensureValidSession());
