(function(){const t=localStorage.getItem('gc-theme')||'light';document.documentElement.setAttribute('data-theme',t);try{if(localStorage.getItem('gp-discreto')==='1')document.documentElement.classList.add('gp-discreto');}catch{}document.documentElement.classList.add('gp-carregando');})();
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
  const ovs=document.querySelectorAll('.modal-overlay,.dm-overlay,.dm-sheet-overlay,.ask-overlay,#auth-screen,#pin-screen,.tut-overlay');
  for(let i=0;i<ovs.length;i++){ ovs[i].style.height=h+'px'; ovs[i].style.top='0'; ovs[i].style.bottom='auto'; }
}
(function(){
  if(IS_STANDALONE) document.documentElement.classList.add('pwa-standalone');
  fitViewport();
  window.addEventListener('resize',fitViewport);
  window.addEventListener('resize',()=>{ if(typeof syncCatArrows==='function') syncCatArrows(); });
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
  if(currentTab==='mapa') trocarTilesMapa();
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

const APP_VERSION = '6.3';
const SUPABASE_URL = 'https://asnuusgwtsjpwuaakfuc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Z46thUwaqpXRR8i2PxZWzQ_oG2eJ3yK';
const VAPID_PUBLIC_KEY = 'BOGPXr8rzIa2v0x9icJfeWnSp7OEfo5wDjcRV39GFqVuctrVr5k_dfjkpHpi06obd9S5k80T9O5kadH71ITniyY';
const CORRECT_PIN = () => String(new Date().getFullYear());
const SESSION_KEY = 'gc-auth-session-v2';
const CACHE_PREFIX = 'gc-cache-v2';
const CONFIG={
  APP_NAME:'GastoPensado',TRIAL_DAYS:14,FREE_DAILY_LAUNCHES:3,FREE_MAX_CATEGORIES:2,
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
  quickAdd=parseQuickLink();
  if(quickAdd){ try{ history.replaceState(null,'',location.pathname+location.search); }catch{} }
  try{
    const saved=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    if(saved?.refresh_token){ persistSession(saved); await refreshSession(); }
  }catch{ persistSession(null); }
  if(session?.access_token) enterApp();
  else{
    endQuickSplash();
    if(quickAdd){
      quickAdd=null;
      const nota=document.getElementById('quick-auth-note');
      if(nota) nota.hidden=false;
    }
  }
}
function enterApp(){
  document.getElementById('auth-screen').style.display='none';
  document.getElementById('app').style.display='';
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
  persistSession(null); categories=[]; months=[]; expenses=[]; expenseNames=[]; acceptedShares=[]; sharedOutMap={}; pendingSplitInvites=[]; acceptedGroupIds=new Set(); friends=[]; budgetTransfers=[]; cards=[]; allCards=[]; rollovers=[]; futureMonthKeys=[]; loans=[]; reliefs=[];
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
    document.getElementById('app').style.display='';
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
  getExpensesOfCat:(catId)=>sbFetch(`expenses?cat_id=eq.${catId}&select=id,user_id,value`),
  deleteExpensesOfCat:(catId)=>sbFetch(`expenses?cat_id=eq.${catId}&select=id`,{method:'DELETE'}),
  deleteTransfersOfCat:(catId)=>sbFetch(`budget_transfers?or=(from_cat_id.eq.${catId},to_cat_id.eq.${catId})&user_id=eq.${currentUser.id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getReliefs:()=>sbFetch('budget_reliefs?order=created_at.desc'),
  insertReliefs:(rows)=>sbFetch('budget_reliefs',{method:'POST',body:JSON.stringify(rows.map(r=>({...r,user_id:currentUser.id})))}),
  deleteRelief:(id)=>sbFetch(`budget_reliefs?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteReliefGroup:(g)=>sbFetch(`budget_reliefs?relief_group=eq.${g}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteReliefsOfCat:(catId)=>sbFetch(`budget_reliefs?cat_id=eq.${catId}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteLoansOfCat:(catId)=>sbFetch(`budget_loans?cat_id=eq.${catId}&user_id=eq.${currentUser.id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteActivityOfCat:(catId)=>sbFetch(`activity_log?category_id=eq.${catId}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteSharesOfCat:(catId)=>sbFetch(`category_shares?category_id=eq.${catId}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getMonths:()=>sbFetch('months?order=key.desc'),
  insertMonth:(d)=>sbFetch('months',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  closeMonth:(key)=>sbFetch(`months?key=eq.${key}`,{method:'PATCH',body:JSON.stringify({closed:true})}),
  getExpenses:(mk)=>sbFetch(`expenses?month_key=eq.${mk}&order=date.desc`),
  getAllExpenses:()=>sbFetch('expenses?select=id,user_id,cat_id,month_key,name,value,date,recurring,installment_no,installment_total,card_id,subcat,place,lat,lng&order=date.desc'),
  getExpenseImage:(id)=>sbFetch(`expenses?id=eq.${id}&select=image_url`).then(r=>r?.[0]?.image_url||null),
  getExpensesFrom:(mk)=>sbFetch(`expenses?month_key=gte.${mk}&select=id,user_id,cat_id,month_key,name,value,date,recurring,installment_no,installment_total,installment_group,card_id,subcat&order=month_key.asc`),
  getMonthTotals:()=>sbFetch('expenses?select=month_key,value&order=month_key.asc'),
  getExpenseNames:()=>sbFetch('expenses?select=name&order=date.desc'),
  getExpenseHist:()=>sbFetch('expenses?select=name,cat_id,value&order=date.desc&limit=800'),
  insertExpense:(d)=>sbFetch('expenses',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateExpense:(id,d)=>sbFetch(`expenses?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteExpense:(id)=>sbFetch(`expenses?id=eq.${id}&select=id`,{method:'DELETE'}),
  getActivity:(catId)=>sbFetch(`activity_log?category_id=eq.${catId}&order=created_at.desc&limit=50`),
  getAllActivity:()=>sbFetch('activity_log?order=created_at.desc&limit=80'),
  insertActivity:(d)=>sbFetch('activity_log',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({...d,actor_user_id:currentUser.id,actor_email:currentUser.email})}),
  getBudgetTransfers:(monthKey)=>sbFetch(`budget_transfers?month_key=eq.${monthKey}&order=created_at.desc`),
  insertBudgetTransfer:(d)=>sbFetch('budget_transfers',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  getCards:()=>sbFetch(`cards?user_id=eq.${currentUser.id}&order=name.asc`),
  getVisibleCards:()=>sbFetch('cards?order=name.asc'),
  savePushSub:(d)=>sbFetch('push_subscriptions',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({...d,user_id:currentUser.id})}),
  deletePushSub:(endpoint)=>sbFetch(`push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  countPushSubs:()=>sbFetch(`push_subscriptions?user_id=eq.${currentUser.id}&select=id`),
  insertCard:(d)=>sbFetch('cards',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateCard:(id,d)=>sbFetch(`cards?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteCard:(id)=>sbFetch(`cards?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getRollovers:(monthKey)=>sbFetch(`budget_rollovers?to_month=eq.${monthKey}&order=created_at.desc`),
  zeroRollover:(id)=>sbFetch(`budget_rollovers?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({amount:0})}),
  deleteBudgetTransfer:(id)=>sbFetch(`budget_transfers?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  insertRollover:(d)=>sbFetch('budget_rollovers',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({...d,user_id:currentUser.id})}),
  deleteRollover:(id)=>sbFetch(`budget_rollovers?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  deleteRolloversOfCat:(catId)=>sbFetch(`budget_rollovers?cat_id=eq.${catId}&user_id=eq.${currentUser.id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getRolloversOfCat:(catId)=>sbFetch(`budget_rollovers?cat_id=eq.${catId}&user_id=eq.${currentUser.id}&select=id`),
  getLoans:()=>sbFetch('budget_loans?order=month_key.asc'),
  insertLoans:(rows)=>sbFetch('budget_loans',{method:'POST',body:JSON.stringify(rows.map(r=>({...r,user_id:currentUser.id})))}),
  deleteLoanGroup:(g)=>sbFetch(`budget_loans?loan_group=eq.${g}&user_id=eq.${currentUser.id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  getIncomes:()=>sbFetch(`incomes?user_id=eq.${currentUser.id}&order=start_month.asc`),
  insertIncome:(d)=>sbFetch('incomes',{method:'POST',body:JSON.stringify({...d,user_id:currentUser.id})}),
  updateIncome:(id,d)=>sbFetch(`incomes?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(d)}),
  deleteIncome:(id)=>sbFetch(`incomes?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
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
  getProfilesByIds:(ids)=>ids.length?sbFetch(`profiles?id=in.(${ids.join(',')})&select=id,username,avatar_url`).catch(()=>sbFetch(`profiles?id=in.(${ids.join(',')})&select=id,username`)):Promise.resolve([]),
  updateMyProfile:(d)=>sbFetch(`profiles?id=eq.${currentUser.id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(d)}),
  getAdminGrant:()=>sbFetch(`admin_grants?email=ilike.${encodeURIComponent(currentUser.email)}&limit=1`),
  insertAdminGrant:(email,plan)=>sbFetch('admin_grants',{method:'POST',body:JSON.stringify({email:email.toLowerCase(),plan,granted_by:currentUser.id})}),
  deleteAdminGrant:(id)=>sbFetch(`admin_grants?id=eq.${id}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}),
  listAdminGrants:()=>sbFetch('admin_grants?order=id.desc'),
  updateUserMeta:(data)=>fetch(`${SUPABASE_URL}/auth/v1/user`,{method:'PUT',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({data})}).then(r=>r.json()),
};

let categories=[], months=[], currentMonthKey='', viewMonthKey='', expenses=[], currentTab='home', currentCatIdx=0, budgetTransfers=[], cards=[], rollovers=[], futureMonthKeys=[];
let futureExpenses=[], recurringBase=[], projectedExpenses=[], futureOpen={}, monthIndex={}, allCards=[], loans=[], reliefs=[], movOpen={};
let subscription=null, userPlan='free';
let splitGroups=[], pendingShares=[], acceptedShares=[], sharedOutMap={}, pendingSplitInvites=[], acceptedGroupIds=new Set(), friends=[];
let myProfile=null, profilesById={};
let unreadDm={}, _unreadPoll=null;
function dmSeenLocal(){ try{ return JSON.parse(localStorage.getItem('gc-dm-seen')||'{}'); }catch{ return {}; } }
function dmSeenMap(){
  const local=dmSeenLocal();
  const remoto=currentUser?.user_metadata?.dm_seen||{};
  const out={...remoto};
  for(const k in local) if(!out[k]||local[k]>out[k]) out[k]=local[k];
  return out;
}
let _dmSeenTimer=null;
function markDmSeen(friendId){
  if(!friendId) return;
  const m=dmSeenLocal();
  m[friendId]=new Date().toISOString();
  try{ localStorage.setItem('gc-dm-seen',JSON.stringify(m)); }catch{}
  if(currentUser) currentUser.user_metadata={...(currentUser.user_metadata||{}),dm_seen:dmSeenMap()};
  clearTimeout(_dmSeenTimer);
  _dmSeenTimer=setTimeout(()=>{ if(session) api.updateUserMeta({dm_seen:dmSeenMap()}).catch(()=>{}); },2500);
}
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
  showLocalNotification('GastoPensado',`${who} ${kind}`,'gc-dm');
}
function showLocalNotification(title,body,tag){
  const opts={body,icon:'./icon-192.png',badge:'./icon-192.png',tag};
  if('serviceWorker'in navigator){
    navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,opts)).catch(()=>{});
    return;
  }
  try{ new Notification(title,opts); }catch{}
}
function pushSupported(){ return 'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window; }
function precisaInstalar(){ return !pushSupported()&&/iphone|ipad|ipod/i.test(navigator.userAgent)&&!IS_STANDALONE; }
function b64ToBytes(base64){
  const pad='='.repeat((4-base64.length%4)%4);
  const raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  const out=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) out[i]=raw.charCodeAt(i);
  return out;
}
async function pushSub(){
  if(!pushSupported()) return null;
  try{ const reg=await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }catch{ return null; }
}
async function pushStatus(){
  if(precisaInstalar()) return 'instalar';
  if(!pushSupported()) return 'indisponivel';
  if(Notification.permission==='denied') return 'bloqueado';
  return (await pushSub())?'ligado':'desligado';
}
async function enablePush(){
  if(!pushSupported()){ showToast('Este navegador não recebe notificações.','error'); return false; }
  let perm=Notification.permission;
  if(perm!=='granted'){ try{ perm=await Notification.requestPermission(); }catch{ perm='denied'; } }
  if(perm!=='granted'){ showToast('Permissão negada. Libere nas configurações do aparelho.','error'); return false; }
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription()
      ||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(VAPID_PUBLIC_KEY)});
    const j=sub.toJSON();
    await api.savePushSub({endpoint:sub.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,user_agent:navigator.userAgent.slice(0,180)});
    vib(15);
    showToast('Notificações ligadas neste aparelho.','success');
    return true;
  }catch(err){
    const msg=String(err?.message||err);
    showToast(/push_subscriptions/i.test(msg)?'Falta rodar o push-setup.sql no Supabase.':`Não consegui ativar: ${msg.slice(0,90)}`,'error');
    return false;
  }
}
async function disablePush(){
  try{
    const sub=await pushSub();
    if(sub){ await api.deletePushSub(sub.endpoint).catch(()=>{}); await sub.unsubscribe().catch(()=>{}); }
    showToast('Notificações desligadas neste aparelho.','success');
  }catch{ showToast('Não consegui desligar.','error'); }
}
async function togglePush(el){
  const ligar=el.checked;
  el.disabled=true;
  const ok=ligar?await enablePush():(await disablePush(),true);
  el.disabled=false;
  if(ligar&&!ok) el.checked=false;
  syncPushRow();
}
const PUSH_TXT={
  ligado:['fa-bell','Notificações ligadas','Você é avisado quando alguém lança numa categoria compartilhada, mesmo com o app fechado.'],
  desligado:['fa-bell-slash','Notificações desligadas','Ligue para ser avisado de lançamentos nas categorias compartilhadas.'],
  bloqueado:['fa-ban','Notificações bloqueadas','Você negou a permissão. Libere nas configurações do aparelho e volte aqui.'],
  instalar:['fa-arrow-up-from-bracket','Instale na tela de início','No iPhone, notificação só funciona com o app instalado: toque em Compartilhar › Adicionar à Tela de Início e abra por lá.'],
  indisponivel:['fa-circle-info','Sem notificações aqui','Este navegador não recebe notificações. Tente pelo app instalado na tela de início.']
};
async function syncPushRow(){
  const row=document.getElementById('push-row'); if(!row) return;
  const st=await pushStatus();
  const [ico,titulo,texto]=PUSH_TXT[st];
  const podeMexer=st==='ligado'||st==='desligado';
  row.innerHTML=`<span class="push-ico"><i class="fa-solid ${ico}" aria-hidden="true"></i></span>
    <span class="push-body"><span class="push-title">${titulo}</span><span class="push-sub">${texto}</span></span>
    ${podeMexer?`<label class="switch"><input type="checkbox" id="push-switch" ${st==='ligado'?'checked':''} onchange="togglePush(this)"><span class="switch-track"><span class="switch-thumb"></span></span></label>`:''}`;
  row.classList.toggle('on',st==='ligado');
}
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
  openModal(`<div class="modal-title">Desbloqueie o GastoPensado Pro</div>
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
const BRL_FMT=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const brl=v=>`R$ ${BRL_FMT.format(parseFloat(v)||0)}`;
const brlCurto=v=>{ const n=parseFloat(v)||0; return Math.abs(n)>=1000?`R$ ${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`:brl(n); };
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function parseNum(s){
  if(s==null||s==='') return NaN;
  s=String(s).trim();
  if(s.indexOf(',')>-1&&s.indexOf('.')>-1) s=s.replace(/\./g,'').replace(',','.');
  else s=s.replace(',','.');
  return parseFloat(s);
}
function moneyKey(el){ el.value=el.value.replace(/[^0-9.,]/g,''); }

function monthOverride(cat, monthKey){
  const mb=cat&&cat.month_budgets?cat.month_budgets[monthKey]:null;
  if(mb!=null&&!isNaN(parseFloat(mb))) return parseFloat(mb);
  if(!cat||!currentUser||cat.user_id!==currentUser.id) return null;
  const m=months.find(x=>x.key===monthKey&&(!x.user_id||x.user_id===currentUser.id));
  const legado=m&&m.budgets?m.budgets[cat.id]:null;
  return (legado!=null&&!isNaN(parseFloat(legado)))?parseFloat(legado):null;
}
function semTeto(cat){ return !!(cat&&cat.no_limit); }
const CAT_ICONES=['fa-cart-shopping','fa-utensils','fa-bowl-food','fa-burger','fa-mug-hot','fa-champagne-glasses','fa-house','fa-bolt','fa-car','fa-gas-pump','fa-bus','fa-plane','fa-paw','fa-heart-pulse','fa-pills','fa-dumbbell','fa-graduation-cap','fa-shirt','fa-scissors','fa-gift','fa-film','fa-gamepad','fa-music','fa-wifi','fa-baby','fa-credit-card','fa-piggy-bank','fa-briefcase','fa-screwdriver-wrench','fa-umbrella-beach','fa-layer-group','fa-wallet'];
const CAT_PALPITES=[
  [/barbe|cabel|salao|estetica|beleza|manicure|unha/,'fa-scissors'],
  [/mercad|supermerc|feira|atacad|hortifruti|acougue|sacolao/,'fa-cart-shopping'],
  [/marmit/,'fa-bowl-food'],
  [/ifood|delivery|lanche|hamburg|pizza/,'fa-burger'],
  [/comida|aliment|refeic|almoc|jantar|restaur/,'fa-utensils'],
  [/cafe|padaria|confeit/,'fa-mug-hot'],
  [/role|\bbar\b|balada|festa|saida|happy|bebida|cerveja/,'fa-champagne-glasses'],
  [/casa|aluguel|condom|moradia|\blar\b|apartamento/,'fa-house'],
  [/\bluz\b|energia|\bagua\b|contas/,'fa-bolt'],
  [/combust|gasolin|posto|etanol|diesel/,'fa-gas-pump'],
  [/onibus|metro|\btrem\b|bilhete/,'fa-bus'],
  [/carro|uber|\b99\b|transporte|estacion|pedagio|mobilidade|moto/,'fa-car'],
  [/viagem|passagem|hotel|ferias|turismo/,'fa-plane'],
  [/\bpet\b|cachorr|\bgato|racao|veterin|petz|cobasi/,'fa-paw'],
  [/farmac|remedio|drogaria/,'fa-pills'],
  [/saude|medic|plano de|hospital|exame|dentist|terapia|psico/,'fa-heart-pulse'],
  [/academ|ginast|treino|esporte|crossfit|pilates|suplement|whey/,'fa-dumbbell'],
  [/educa|escola|curso|faculdade|livro|estudo/,'fa-graduation-cap'],
  [/roupa|vestu|moda|calcad|sapato/,'fa-shirt'],
  [/presente|aniversar/,'fa-gift'],
  [/lazer|cinema|filme|streaming|netflix|spotify|assinatura|show/,'fa-film'],
  [/jogo|game|steam/,'fa-gamepad'],
  [/musica|instrumento/,'fa-music'],
  [/celular|telefone|internet|wifi/,'fa-wifi'],
  [/bebe|filho|crianc|infantil/,'fa-baby'],
  [/cartao|fatura/,'fa-credit-card'],
  [/invest|poupan|reserva|guardar|emergencia/,'fa-piggy-bank'],
  [/trabalho|empresa|escritorio/,'fa-briefcase'],
  [/manutenc|reforma|conserto|obra/,'fa-screwdriver-wrench'],
  [/praia|lazer ao ar/,'fa-umbrella-beach'],
  [/geral|outros|diversos|extra/,'fa-layer-group'],
];
function iconePalpite(nome){
  const n=String(nome||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for(const [re,ic] of CAT_PALPITES) if(re.test(n)) return ic;
  return 'fa-wallet';
}
function catIcon(cat){ return (cat&&cat.icon&&CAT_ICONES.includes(cat.icon))?cat.icon:iconePalpite(cat&&cat.name); }
function catTone(cat){
  const txt=String((cat&&(cat.id||cat.name))||'');
  let h=0; for(let i=0;i<txt.length;i++) h=(h*31+txt.charCodeAt(i))>>>0;
  return (h%8)+1;
}
function catBadge(cat,extra=''){
  return `<span class="cat-ico tone-${catTone(cat)}${extra?' '+extra:''}"><i class="fa-solid ${catIcon(cat)}" aria-hidden="true"></i></span>`;
}
function subcatFieldHtml(atual){
  return `<div class="form-group" id="f-subcat-group" hidden>
    <label class="form-label">Tipo <span class="lbl-opt">opcional</span></label>
    <input type="hidden" id="f-subcat" value="${escapeHtml(atual||'')}"/>
    <div class="sub-chips" id="f-subcat-chips"></div>
  </div>`;
}
function syncSubcatField(){
  const grp=document.getElementById('f-subcat-group'); if(!grp) return;
  const hidden=document.getElementById('f-subcat');
  const lista=subcatsOf(document.getElementById('f-catId')?.value);
  if(!lista.length){ grp.hidden=true; if(hidden) hidden.value=''; return; }
  if(hidden&&hidden.value&&!lista.includes(hidden.value)) hidden.value='';
  grp.hidden=false;
  const val=hidden?hidden.value:'';
  document.getElementById('f-subcat-chips').innerHTML=lista.map(sc=>
    `<button type="button" class="sub-chip${sc===val?' on':''}" data-sub="${escapeHtml(sc)}" onclick="pickSubcat(this.dataset.sub)">${escapeHtml(sc)}</button>`
  ).join('');
}
function pickSubcat(nome){
  const h=document.getElementById('f-subcat'); if(!h) return;
  h.value=h.value===nome?'':nome;
  vib(5); syncSubcatField();
}
function onExpenseCatChange(){ syncSubcatField(); syncAtalhos(); }
let atalhosAtuais=[];
function catsLancaveis(){ return categories.filter(c=>c.user_id===currentUser.id||sharePerm(c.id)==='edit'); }
function catChipsHtml(sel,fn){
  return catsLancaveis().map(c=>`<button type="button" class="pc tone-${catTone(c)}${c.id===sel?' on':''}" data-id="${c.id}" onclick="${fn}(this.dataset.id)"><i class="fa-solid ${catIcon(c)}" aria-hidden="true"></i><span>${escapeHtml(c.name)}</span></button>`).join('');
}
function marcarChip(boxId,id){
  document.querySelectorAll(`#${boxId} .pc`).forEach(b=>b.classList.toggle('on',b.dataset.id===id));
  const on=document.querySelector(`#${boxId} .pc.on`);
  if(on) on.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
}
function pickCatForm(id){
  const h=document.getElementById('f-catId'); if(!h) return;
  h.value=id; vib(5); marcarChip('f-cat-chips',id); onExpenseCatChange();
}
function syncAtalhos(){
  const box=document.getElementById('f-atalhos'), grp=document.getElementById('f-atalhos-group');
  if(!box||!grp) return;
  atalhosAtuais=atalhosDe(document.getElementById('f-catId')?.value);
  grp.hidden=!atalhosAtuais.length;
  box.innerHTML=atalhosAtuais.map((a,i)=>`<button type="button" class="pc at" onclick="usarAtalho(${i})"><span>${escapeHtml(a.nome)}</span>${a.valor!=null?`<em class="money">${brl(a.valor)}</em>`:''}</button>`).join('');
}
function usarAtalho(i){
  const a=atalhosAtuais[i]; if(!a) return;
  vib(8);
  const n=document.getElementById('f-name'); if(n) n.value=a.nome;
  const v=document.getElementById('f-value');
  if(v&&!v.value&&a.valor!=null){ v.value=a.valor.toFixed(2).replace('.',','); onExpenseValueInput(); }
  document.querySelectorAll('#f-atalhos .pc').forEach((b,j)=>b.classList.toggle('on',j===i));
}
function pickData(k){
  const inp=document.getElementById('f-date'); if(!inp) return;
  vib(5);
  if(k==='hoje') inp.value=todayLocal();
  else if(k==='ontem'){ const d=new Date(); d.setDate(d.getDate()-1); inp.value=isoDe(d); }
  if(k==='outra'){ inp.hidden=false; try{ inp.showPicker&&inp.showPicker(); }catch{} inp.focus(); }
  else inp.hidden=true;
  onExpenseDateChange(); syncDataChips(k);
}
function syncDataChips(forcar){
  const inp=document.getElementById('f-date'); if(!inp) return;
  const o=new Date(); o.setDate(o.getDate()-1);
  const k=forcar||(inp.value===todayLocal()?'hoje':inp.value===isoDe(o)?'ontem':'outra');
  document.querySelectorAll('#f-date-chips .dc').forEach(b=>b.classList.toggle('on',b.dataset.d===k));
  const lbl=document.getElementById('f-date-outra-lbl');
  if(lbl) lbl.textContent=(k==='outra'&&inp.value)?new Date(inp.value+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.',''):'Outra data';
  if(k==='outra') inp.hidden=false;
}
function toggleMais(abrir){
  const b=document.getElementById('f-mais-body'), h=document.getElementById('f-mais-head'); if(!b) return;
  const v=abrir==null?b.hidden:!!abrir;
  b.hidden=!v; if(h) h.classList.toggle('open',v);
  if(abrir==null) vib(5);
}
function syncMaisResumo(){
  const box=document.getElementById('f-mais-resumo'); if(!box) return;
  const itens=[];
  const modo=repeatSegVal();
  if(modo==='recurring') itens.push('<i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Todo mês');
  if(modo==='installment'){ const c=selectedCard(); const t=instGet('total'); itens.push(`<i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${c?escapeHtml(c.name):'Cartão'}${t>1?` · ${t}x`:''}`); }
  const place=document.getElementById('f-place')?.value;
  if(place) itens.push(`<i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHtml(place.split(',')[0])}`);
  else if(document.getElementById('f-lat')?.value) itens.push('<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Local salvo');
  if(document.getElementById('f-receipt')?.files?.[0]||document.getElementById('receipt-preview-img')?.getAttribute('src')) itens.push('<i class="fa-solid fa-paperclip" aria-hidden="true"></i> Comprovante');
  box.innerHTML=itens.length?itens.map(x=>`<span>${x}</span>`).join(''):'<span class="mr-vazio">Repetição, cartão, local e comprovante</span>';
}
function expenseFormHtml(e,catPadrao){
  const hoje=todayLocal();
  const catSel=e?e.cat_id:(catPadrao||catsLancaveis()[0]?.id||'');
  const data=e?e.date:hoje;
  let travado=false;
  if(e){
    const alheio=!!e.user_id&&e.user_id!==currentUser.id;
    const conhecido=e.card_id?cardById(e.card_id):null;
    travado=alheio||(!!conhecido&&!cardIsMine(conhecido));
  }
  const modo=e?((e.installment_total||e.card_id)?'installment':(e.recurring?'recurring':'none')):'none';
  return `${e?'':lancTipoHtml('gasto')}<div class="xf-title">${e?'Editar gasto':'Novo gasto'}</div>
    <label class="amt-box" for="f-value">
      <span class="amt-cur">R$</span>
      <input class="amt-input" id="f-value" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off" value="${e?(Math.round(parseFloat(e.value)*100)/100).toFixed(2).replace('.',','):''}" oninput="moneyKey(this);onExpenseValueInput()"/>
    </label>
    <div class="amt-lbl" id="f-value-label">Valor (R$)</div>
    <input type="hidden" id="f-catId" value="${catSel}"/>
    <div class="form-group">
      <label class="form-label">Categoria</label>
      <div class="pick-chips" id="f-cat-chips">${catChipsHtml(catSel,'pickCatForm')}</div>
    </div>
    ${subcatFieldHtml(e?e.subcat||'':'')}
    ${e?'':`<div class="form-group" id="f-atalhos-group" hidden>
      <label class="form-label">Seus de sempre <span class="lbl-opt">um toque preenche</span></label>
      <div class="pick-chips wrap" id="f-atalhos"></div>
    </div>`}
    <div class="form-group"><label class="form-label">Descrição</label>
      <div class="ac-wrap">
        <input class="form-input" id="f-name" placeholder="Ex: Padaria da esquina" autocomplete="off" value="${e?escapeHtml(e.name):''}" oninput="acFilter(this.value)" onfocus="acFilter(this.value)" onblur="acBlur()"/>
        <div class="ac-list" id="ac-list"></div>
      </div></div>
    <div class="form-group"><label class="form-label">Quando</label>
      <div class="date-chips" id="f-date-chips">
        <button type="button" class="dc" data-d="hoje" onclick="pickData('hoje')">Hoje</button>
        <button type="button" class="dc" data-d="ontem" onclick="pickData('ontem')">Ontem</button>
        <button type="button" class="dc" data-d="outra" onclick="pickData('outra')"><i class="fa-regular fa-calendar" aria-hidden="true"></i> <span id="f-date-outra-lbl">Outra data</span></button>
      </div>
      <input class="form-input" id="f-date" type="date" value="${data}" onchange="onExpenseDateChange();syncDataChips()" hidden style="margin-top:8px"/>
    </div>
    <div class="mais">
      <button type="button" class="mais-head" id="f-mais-head" onclick="toggleMais()">
        <span class="mais-t"><i class="fa-solid fa-sliders" aria-hidden="true"></i> Mais opções</span>
        <span class="mais-resumo" id="f-mais-resumo"></span>
        <i class="fa-solid fa-chevron-down mais-chev" aria-hidden="true"></i>
      </button>
      <div class="mais-body" id="f-mais-body" hidden>
        ${repeatFieldHtml(modo,e?e.installment_total||'':'',e?e.installment_no||1:1,e?'parcela':'compra',!!e,e?e.card_id||'':'',travado)}
        ${localFieldHtml(e)}
        ${receiptPickerHtml(e?e.image_url||'':'')}
      </div>
    </div>
    <button class="btn-primary" id="btn-save-exp" onclick="saveExpense(${e?`'${e.id}'`:'null'})">${e?'Salvar alterações':'Lançar gasto'}</button>
    ${e?`<button class="btn-danger-ghost" onclick="confirmDeleteExpense('${e.id}')"><i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir gasto</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`;
}
function posAbrirForm(e){
  if(e&&(e.installment_total||e.card_id)){ syncCardRow(); syncInstSummary(); updateValueFieldLabel(); }
  syncSubcatField(); syncLocRow(); syncAtalhos(); syncDataChips(); syncMaisResumo();
  marcarChip('f-cat-chips',document.getElementById('f-catId')?.value);
}

function localFieldHtml(e){
  const tem=e&&e.lat!=null&&e.lng!=null;
  return `<div class="form-group">
    <label class="form-label">Onde foi <span class="lbl-opt">opcional</span></label>
    <input type="hidden" id="f-lat" value="${tem?e.lat:''}"/>
    <input type="hidden" id="f-lng" value="${tem?e.lng:''}"/>
    <input type="hidden" id="f-place" value="${tem&&e.place?escapeHtml(e.place):''}"/>
    <div class="pick-row" id="f-loc-row" role="button" tabindex="0" onclick="capturarLocal()">
      <span class="pick-ico"><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>
      <span class="pick-body"><span class="pick-name" id="f-loc-val">Buscar minha localização</span><span class="pick-sub" id="f-loc-sub">O app pergunta e guarda o endereço aproximado</span></span>
      <button type="button" class="loc-clear" id="f-loc-clear" onclick="event.stopPropagation();limparLocal()" aria-label="Remover localização" hidden><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>
  </div>`;
}
function syncLocRow(estado){
  const row=document.getElementById('f-loc-row'); if(!row) return;
  setTimeout(syncMaisResumo,0);
  const lat=document.getElementById('f-lat').value;
  const place=document.getElementById('f-place').value;
  const tem=lat!=='';
  const val=document.getElementById('f-loc-val'), sub=document.getElementById('f-loc-sub');
  row.classList.toggle('on',tem);
  row.classList.toggle('buscando',estado==='buscando');
  if(estado==='buscando'){ val.textContent='Procurando…'; sub.textContent='Aguardando o GPS responder'; document.getElementById('f-loc-clear').hidden=true; return; }
  if(estado==='endereco'){ val.textContent='Localização salva'; sub.textContent='Descobrindo o endereço…'; document.getElementById('f-loc-clear').hidden=false; return; }
  if(estado==='negado'){ val.textContent='Buscar minha localização'; sub.textContent='Permissão negada ou sem sinal. Toque para tentar de novo.'; document.getElementById('f-loc-clear').hidden=true; return; }
  val.textContent=tem?(place||'Localização salva'):'Buscar minha localização';
  sub.textContent=tem?(place?'Toque para atualizar':'Endereço não encontrado · toque para tentar de novo'):'O app pergunta e guarda o endereço aproximado';
  document.getElementById('f-loc-clear').hidden=!tem;
}
async function capturarLocal(){
  if(!document.getElementById('f-loc-row')) return;
  syncLocRow('buscando');
  const c=await coordsAgora();
  if(!c){ syncLocRow('negado'); return; }
  document.getElementById('f-lat').value=c.lat;
  document.getElementById('f-lng').value=c.lng;
  document.getElementById('f-place').value='';
  vib(12); syncLocRow('endereco');
  const end=await enderecoDe(c.lat,c.lng);
  const campo=document.getElementById('f-place');
  if(campo){ campo.value=end||''; syncLocRow(); }
}
function limparLocal(){
  document.getElementById('f-lat').value='';
  document.getElementById('f-lng').value='';
  document.getElementById('f-place').value='';
  vib(5); syncLocRow();
}
function localAuto(){ try{ return localStorage.getItem('gp-local-auto')!=='0'; }catch{ return true; } }
function toggleLocalAuto(){
  const v=!localAuto();
  try{ localStorage.setItem('gp-local-auto',v?'1':'0'); }catch{}
  vib(8);
  const sw=document.getElementById('local-switch'); if(sw) sw.checked=v;
  showToast(v?'O app busca o local sozinho ao lançar.':'O local só é buscado quando você tocar em "Buscar minha localização".');
}
let localNegado=false, ultimoLocal=null;
async function podePedirLocal(){
  if(!navigator.geolocation||!localAuto()||localNegado) return false;
  if(ultimoLocal&&Date.now()-ultimoLocal.t<300000) return true;
  try{
    const st=await navigator.permissions.query({name:'geolocation'});
    if(st.state==='denied'){ localNegado=true; return false; }
  }catch{}
  return true;
}
async function autoLocal(){
  if(document.getElementById('f-lat')?.value) return;
  if(!await podePedirLocal()) return;
  capturarLocal();
}

function subcatsOf(catId){
  const c=categories.find(x=>x.id===catId);
  return Array.isArray(c&&c.subcats)?c.subcats.filter(Boolean):[];
}
function mapsUrl(lat,lng){ return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; }
function coordsAgora(timeout=9000){
  return new Promise(resolve=>{
    if(!navigator.geolocation) return resolve(null);
    if(ultimoLocal&&Date.now()-ultimoLocal.t<300000) return resolve({lat:ultimoLocal.lat,lng:ultimoLocal.lng});
    navigator.geolocation.getCurrentPosition(
      p=>{ localNegado=false; const c={lat:Math.round(p.coords.latitude*1e6)/1e6,lng:Math.round(p.coords.longitude*1e6)/1e6}; ultimoLocal={...c,t:Date.now()}; resolve(c); },
      err=>{ if(err&&err.code===1) localNegado=true; resolve(null); },
      {enableHighAccuracy:false,timeout,maximumAge:300000}
    );
  });
}
function comTimeout(promessa,ms){
  return Promise.race([promessa,new Promise(r=>setTimeout(()=>r(null),ms))]);
}
async function ruaDoOSM(lat,lng){
  const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=pt-BR`,{headers:{Accept:'application/json'}});
  if(!r.ok) return null;
  const j=await r.json();
  const a=j.address||{};
  const rua=a.road||a.pedestrian||a.footway||a.residential||null;
  const numero=a.house_number?` ${a.house_number}`:'';
  const bairro=a.suburb||a.neighbourhood||a.city_district||a.quarter||null;
  const cidade=a.city||a.town||a.village||a.municipality||a.county||null;
  const partes=[];
  if(rua) partes.push(rua+numero);
  if(bairro&&bairro!==rua) partes.push(bairro);
  if(cidade&&cidade!==bairro) partes.push(cidade);
  if(partes.length) return partes.join(', ');
  return j.display_name?j.display_name.split(',').slice(0,3).join(',').trim():null;
}
async function cidadeDoBDC(lat,lng){
  const r=await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=pt`);
  if(!r.ok) return null;
  const j=await r.json();
  const partes=[j.locality,j.city,j.principalSubdivision].filter((v,i,arr)=>v&&arr.indexOf(v)===i);
  return partes.length?partes.slice(0,3).join(', '):null;
}
async function enderecoDe(lat,lng){
  try{ const r=await comTimeout(ruaDoOSM(lat,lng),6000); if(r) return r; }catch{}
  try{ const r=await comTimeout(cidadeDoBDC(lat,lng),5000); if(r) return r; }catch{}
  return null;
}
async function pegarLocal(timeout=9000){
  const c=await coordsAgora(timeout);
  if(!c) return null;
  c.place=await enderecoDe(c.lat,c.lng);
  return c;
}
function baseBudget(cat, monthKey){
  if(semTeto(cat)) return 0;
  const ov=monthOverride(cat,monthKey);
  return ov!=null?ov:parseFloat(cat.budget);
}
async function setMonthBudget(catId, monthKey, valor){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const mb={...(cat.month_budgets||{})};
  if(valor==null) delete mb[monthKey]; else mb[monthKey]=valor;
  await api.updateCategory(catId,{month_budgets:mb});
  cat.month_budgets=mb;
}
function rolloverAmount(catId, monthKey){
  return rollovers.filter(r=>r.cat_id===catId&&r.to_month===monthKey)
    .reduce((s,r)=>s+parseFloat(r.amount||0),0);
}
function loanAmount(catId, monthKey){
  return loans.filter(l=>l.cat_id===catId&&l.month_key===monthKey)
    .reduce((s,l)=>s+parseFloat(l.amount||0),0);
}
function loanGroupsOfCat(catId){
  const por={};
  loans.filter(l=>l.cat_id===catId).forEach(l=>{
    (por[l.loan_group]=por[l.loan_group]||{group:l.loan_group,linhas:[]}).linhas.push(l);
  });
  return Object.values(por).map(g=>{
    g.linhas.sort((a,b)=>a.month_key.localeCompare(b.month_key));
    const credito=g.linhas.find(l=>parseFloat(l.amount)>0);
    const devolucoes=g.linhas.filter(l=>parseFloat(l.amount)<0);
    g.valor=credito?parseFloat(credito.amount):0;
    g.mes=credito?credito.month_key:g.linhas[0].month_key;
    g.parcelas=devolucoes.length;
    g.aPagar=devolucoes.filter(l=>l.month_key>=currentMonthKey).reduce((s,l)=>s+Math.abs(parseFloat(l.amount)),0);
    return g;
  }).sort((a,b)=>b.mes.localeCompare(a.mes));
}
function reliefAmount(catId, monthKey){
  return reliefs.filter(r=>r.cat_id===catId&&r.month_key===monthKey)
    .reduce((s,r)=>s+parseFloat(r.amount||0),0);
}
function effBudget(cat, monthKey){
  return Math.round((baseBudget(cat,monthKey)+rolloverAmount(cat.id,monthKey)+loanAmount(cat.id,monthKey)+(semTeto(cat)?0:reliefAmount(cat.id,monthKey)))*100)/100;
}
function hasOverride(cat, monthKey){ return monthOverride(cat,monthKey)!=null; }

let expenseNames=[], acResults=[], histMini=[];

function saveCache(){
  try{
    const leves=expenses.map(e=>e.image_url?{...e,image_url:null,_img:1}:e);
    localStorage.setItem(`${CACHE_PREFIX}:${currentUser.id}`, JSON.stringify({categories,months,expenses:leves,currentMonthKey,expenseNames,histMini,avatar:imgSegura(myProfile&&myProfile.avatar_url),ts:Date.now()}));
  }catch{}
}
function montarHistorico(rows){
  histMini=(rows||[]).map(r=>({n:String(r.name||'').trim(),c:r.cat_id,v:Math.round((parseFloat(r.value)||0)*100)/100})).filter(r=>r.n);
  const freq={};
  histMini.forEach(r=>{ freq[r.n]=(freq[r.n]||0)+1; });
  expenseNames=Object.keys(freq).sort((a,b)=>freq[b]-freq[a]);
}
const NOME_RAPIDO=/^\d{2}\/\d{2} \d{2}:\d{2}$/;
function modaValor(linhas){
  const cont={};
  linhas.forEach(r=>{ const k=r.v.toFixed(2); cont[k]=(cont[k]||0)+1; });
  const [top]=Object.entries(cont).sort((a,b)=>b[1]-a[1]);
  return top&&top[1]>=2?parseFloat(top[0]):null;
}
function atalhosDe(catId,max=6){
  const por={};
  histMini.forEach(r=>{
    if(r.c!==catId||NOME_RAPIDO.test(r.n)) return;
    (por[r.n]=por[r.n]||[]).push(r);
  });
  return Object.entries(por)
    .filter(([,l])=>l.length>=2)
    .sort((a,b)=>b[1].length-a[1].length)
    .slice(0,max)
    .map(([nome,l])=>({nome,valor:modaValor(l),vezes:l.length}));
}
function valorTipico(nome,catId){
  const n=String(nome||'').trim().toLowerCase(); if(!n) return null;
  const mesma=histMini.filter(r=>r.n.toLowerCase()===n&&r.c===catId);
  return modaValor(mesma.length?mesma:histMini.filter(r=>r.n.toLowerCase()===n));
}

function showWelcomeTrial(){
  openModal(`<div class="modal-title"><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Bem-vindo ao GastoPensado!</div>
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
      <button type="button" class="me-avatar" onclick="document.getElementById('f-avatar').click()" aria-label="${avatarDe(currentUser.id)?'Trocar foto de perfil':'Adicionar foto de perfil'}">
        ${fotoOuLetra(currentUser.id,(myProfile?.username||currentUser?.email||'?').charAt(0).toUpperCase())}
        <span class="me-avatar-cam"><i class="fa-solid fa-camera" aria-hidden="true"></i></span>
      </button>
      <input type="file" id="f-avatar" accept="image/*" hidden onchange="salvarAvatar(this)"/>
      <div style="min-width:0;flex:1">
        ${uname?`<div style="font-weight:700;font-size:15px">${uname}</div>`:`<div style="font-weight:700;font-size:14px;color:var(--accent-text);cursor:pointer" onclick="openSetUsername()"><i class="fa-solid fa-at" aria-hidden="true"></i> Definir nome de usuário</div>`}
        <div style="font-size:12px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${email}</div>
        <div style="font-size:11px;color:var(--accent-text);font-weight:600;margin-top:2px">${isPro()?'Plano Pro':'Plano Gratuito'}</div>
        ${avatarDe(currentUser.id)?'<button type="button" class="me-avatar-rm" onclick="removerAvatar()">Remover foto</button>':'<button type="button" class="me-avatar-rm add" onclick="document.getElementById(\'f-avatar\').click()"><i class="fa-solid fa-camera" aria-hidden="true"></i> Adicionar foto</button>'}
      </div>
    </div>
    <div class="theme-row">
      <span class="theme-row-label"><i class="fa-solid ${isLight?'fa-sun':'fa-moon'}" id="theme-icon" aria-hidden="true"></i> Tema ${isLight?'claro':'escuro'}</span>
      <label class="switch"><input type="checkbox" id="theme-switch" ${isLight?'checked':''} onchange="toggleTheme();syncThemeRow()"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    <div class="theme-row">
      <span class="theme-row-label"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Buscar o local sozinho</span>
      <label class="switch"><input type="checkbox" id="local-switch" ${localAuto()?'checked':''} onchange="toggleLocalAuto()"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    <div class="theme-row">
      <span class="theme-row-label"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> Esconder valores</span>
      <label class="switch"><input type="checkbox" id="discreto-switch" ${discreto()?'checked':''} onchange="toggleDiscreto()"><span class="switch-track"><span class="switch-thumb"></span></span></label>
    </div>
    <div class="push-row" id="push-row"></div>
    <button class="btn-secondary" onclick="openCards()"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> Meus cartões</button>
    <button class="btn-secondary" onclick="openQuickGuide()"><i class="fa-solid fa-bolt" aria-hidden="true"></i> Lançamento rápido (iOS)</button>
    <button class="btn-secondary" onclick="openPaywall('Planos e assinatura')"><i class="fa-solid fa-crown" aria-hidden="true"></i> Ver planos</button>
    <button class="btn-secondary" onclick="_closeModal();showTutorial(true)"><i class="fa-solid fa-circle-question" aria-hidden="true"></i> Ver tutorial</button>
    ${isAdmin?`<button class="btn-secondary" style="border-color:var(--accent-line);color:var(--accent-text)" onclick="openAdminPanel()"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Painel Admin</button>`:''}
    <button class="btn-secondary" onclick="logout()"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> Sair da conta</button>
    <div style="text-align:center;font-size:11px;color:var(--text3);margin-top:14px">GastoPensado · v${APP_VERSION}</div>`);
  syncPushRow();
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
  if(!await confirmar('O acesso Pro desta pessoa acaba agora.',{titulo:'Revogar acesso Pro?',botao:'Revogar',perigo:true,icone:'fa-crown'}))return;
  try{await api.deleteAdminGrant(id);showToast('Acesso revogado.','success');openAdminList();}
  catch{showToast('Erro ao revogar.','error');}
}

function loadCache(){
  try{
    const raw=localStorage.getItem(`${CACHE_PREFIX}:${currentUser.id}`);
    if(!raw) return false;
    const c=JSON.parse(raw);
    if(!c.categories||!c.months) return false;
    const hoje=monthKeyOf(new Date());
    categories=c.categories; months=c.months;
    expenses=c.currentMonthKey===hoje?(c.expenses||[]):[];
    expenseNames=c.expenseNames||[];
    histMini=c.histMini||[];
    if(c.avatar) myProfile={...(myProfile||{}),avatar_url:c.avatar};
    currentMonthKey=hoje; viewMonthKey=hoje;
    return true;
  }catch{ return false; }
}

function valoresProntos(){ clearTimeout(valoresProntos._t); document.documentElement.classList.remove('gp-carregando'); }
async function init(){
  document.documentElement.classList.add('gp-carregando');
  clearTimeout(valoresProntos._t); valoresProntos._t=setTimeout(valoresProntos,12000);
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
    const relatedIds=[...new Set([...(myShares||[]).map(s=>s.shared_with_user_id),...(accShares||[]).map(s=>s.shared_by_user_id),...(friends||[]).map(f=>f.friend_user_id)].filter(id=>id&&id!==currentUser.id))];
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
    viewMonthKey=now;
    expenses=await api.getExpenses(viewMonthKey);
    budgetTransfers=await api.getBudgetTransfers(viewMonthKey).catch(()=>[]);
    rollovers=await api.getRollovers(viewMonthKey).catch(()=>[]);
    await loadCards();
    loans=await api.getLoans().catch(()=>[]);
    reliefs=await api.getReliefs().catch(()=>[]);
    refreshFutureMonths();
    refreshMonthIndex();
    applyAutoRollover();
    saveCache();
    document.getElementById('sync-dot')?.remove();
    render();
    valoresProntos();
    if(quickAdd) runQuickAdd(); else setTimeout(()=>showTutorial(),600);
    api.getExpenseHist().then(rows=>{ montarHistorico(rows); saveCache(); }).catch(()=>{
      api.getExpenseNames().then(rows=>{ montarHistorico((rows||[]).map(r=>({name:r.name}))); saveCache(); }).catch(()=>{});
    });
    autoCreateRecurring();
    loadPendingShares();
    startUnreadPoll();
  }catch(e){
    endQuickSplash(); quickAdd=null;
    document.getElementById('sync-dot')?.remove();
    valoresProntos();
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
  const c=canvas.getContext('2d'); c.fillStyle='#0F0E17';c.fillRect(0,0,1080,1920);c.fillStyle='#8B7BFF';c.fillRect(0,0,18,1920);
  c.fillStyle='#f0f0f0';c.font='700 72px serif';c.fillText(cat.name,80,150);c.fillStyle='#888';c.font='34px sans-serif';c.fillText(monthLabel(viewMonthKey),80,210);
  c.fillStyle='#1a1a1a';c.beginPath();c.roundRect(70,270,940,290,32);c.fill();c.fillStyle='#888';c.font='28px sans-serif';c.fillText('TOTAL GASTO',110,340);
  c.fillStyle='#f0f0f0';c.font='700 64px sans-serif';c.fillText(brl(spent),110,425);
  if(semTeto(cat)){ c.fillStyle='#888';c.font='600 28px sans-serif';c.fillText('Categoria sem teto · sem orçamento definido',110,495); }
  else{
    c.fillStyle=diff>=0?'#3DD68C':'#FF6B6B';c.font='600 28px sans-serif';c.fillText(diff>=0?`Dentro do orçamento · ${brl(diff)} livres`:`Orçamento excedido · ${brl(Math.abs(diff))}`,110,495);
    c.fillStyle='#2a2a2a';c.fillRect(110,520,860,10);c.fillStyle=diff>=0?'#8B7BFF':'#FF6B6B';c.fillRect(110,520,budget?Math.min(860,860*spent/budget):0,10);
  }
  c.fillStyle='#888';c.font='600 27px sans-serif';c.fillText('LANÇAMENTOS',80,650);let y=730;
  for(const item of items.slice(0,12)){c.fillStyle='#f0f0f0';c.font='500 31px sans-serif';c.fillText(String(item.name).slice(0,32),80,y);c.textAlign='right';c.font='600 31px sans-serif';c.fillText(brl(item.value),990,y);c.textAlign='left';c.fillStyle='#555';c.font='24px sans-serif';c.fillText(new Date(item.date+'T12:00').toLocaleDateString('pt-BR'),80,y+42);c.fillRect(80,y+75,910,2);y+=105;}
  if(!items.length){c.fillStyle='#888';c.font='30px sans-serif';c.fillText('Nenhum lançamento neste período.',80,y);}
  if(items.length>12){c.fillStyle='#888';c.font='28px sans-serif';c.fillText(`+ ${items.length-12} lançamentos`,80,y);}
  c.fillStyle='#8B7BFF';c.font='800 44px sans-serif';c.fillText('GastoPensado',80,1810);c.fillStyle='#A7A1B8';c.font='25px sans-serif';c.fillText('Gasto bom é gasto pensado.',80,1855);
  const blob=await canvasBlob(canvas);if(!blob){showToast('Não foi possível gerar a imagem.','error');return;}
  const safe=cat.name.toLowerCase().replace(/[^a-z0-9]+/gi,'-'),file=new File([blob],`gastocerto-${safe}.png`,{type:'image/png'});
  try{if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:`${cat.name} · GastoPensado`,files:[file]});return;}}catch(err){if(err.name==='AbortError')return;}
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
  if(!await confirmar('A pessoa deixa de ver esta categoria. O que ela já lançou continua lá.',{titulo:'Remover compartilhamento?',botao:'Remover',perigo:true,icone:'fa-user-minus'}))return;
  try{await api.deleteCategoryShare(shareId);showToast('Compartilhamento removido.','success');openManageShares(catId);}
  catch{showToast('Erro ao remover.','error');}
}

function friendLabel(f){ return f.username?('@'+f.username):f.email; }
function friendInitial(f){ return String(f.username||f.email||'?').charAt(0).toUpperCase(); }
const DATA_IMG_OK=/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+\/=]+$/;
function imgSegura(url){ return (typeof url==='string'&&DATA_IMG_OK.test(url))?url:null; }
function avatarDe(uid){
  if(!uid) return null;
  if(currentUser&&uid===currentUser.id) return imgSegura(myProfile&&myProfile.avatar_url);
  return imgSegura(profilesById[uid]&&profilesById[uid].avatar_url);
}
function fotoOuLetra(uid,letra){
  const url=avatarDe(uid);
  return url?`<img class="av-img" src="${url}" alt="" loading="lazy"/>`:escapeHtml(letra||'?');
}
function carregarPerfis(ids){
  const faltam=[...new Set((ids||[]).filter(id=>id&&id!==currentUser.id&&!profilesById[id]))];
  if(!faltam.length) return;
  api.getProfilesByIds(faltam).then(rows=>{ (rows||[]).forEach(p=>{ profilesById[p.id]=p; }); render(); }).catch(()=>{});
}
function syncAccountBtn(){
  const b=document.getElementById('account-btn'); if(!b) return;
  const url=avatarDe(currentUser&&currentUser.id)||'';
  if(b.dataset.av===url) return;
  b.dataset.av=url;
  b.classList.toggle('has-photo',!!url);
  b.innerHTML=url?`<img class="av-img" src="${url}" alt=""/>`:'<i class="fa-regular fa-user" aria-hidden="true"></i>';
}
function fotoQuadrada(file,lado=256,qualidade=0.82){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Falha ao ler o arquivo'));
    reader.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error('Imagem inválida'));
      img.onload=()=>{
        const m=Math.min(img.width,img.height);
        const cv=document.createElement('canvas');
        cv.width=lado; cv.height=lado;
        cv.getContext('2d').drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,lado,lado);
        resolve(cv.toDataURL('image/jpeg',qualidade));
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
async function salvarAvatar(input){
  const file=input&&input.files&&input.files[0]; if(!file) return;
  if(file.type&&!/^image\//.test(file.type)){ showToast('Escolha uma imagem.','error'); input.value=''; return; }
  showToast('Enviando foto…');
  try{
    const url=await fotoQuadrada(file);
    const r=await api.updateMyProfile({avatar_url:url});
    if(!r||!r.length){ showToast('Não achei seu perfil para salvar a foto. Defina um @usuário primeiro.','error'); return; }
    myProfile={...(myProfile||{}),avatar_url:url};
    saveCache(); vib(12); syncAccountBtn(); openAccountModal();
    showToast('Foto atualizada!','success');
  }catch(err){
    const msg=String(err&&err.message||'');
    showToast(/avatar_url/i.test(msg)?'Rode o SQL: ALTER TABLE profiles ADD COLUMN avatar_url text':`Não consegui salvar a foto: ${msg.slice(0,80)}`,'error');
  }finally{ input.value=''; }
}
async function removerAvatar(){
  if(!await confirmar('Volta a aparecer a inicial do seu nome.',{titulo:'Remover foto de perfil?',botao:'Remover',perigo:true,icone:'fa-image'})) return;
  try{
    await api.updateMyProfile({avatar_url:null});
    myProfile={...(myProfile||{}),avatar_url:null};
    saveCache(); syncAccountBtn(); openAccountModal();
    showToast('Foto removida.','success');
  }catch{ showToast('Erro ao remover a foto.','error'); }
}
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
  try{ friends=await api.getFriends()||[]; carregarPerfis(friends.map(f=>f.friend_user_id)); }catch{}
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
        <div class="friend-avatar">${fotoOuLetra(f.friend_user_id,friendInitial(f))}</div>
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
    carregarPerfis(friends.map(f=>f.friend_user_id));
    friendsViewRefresh();
    showToast('Amigo adicionado!','success');
  }catch(e){ showToast('Erro ao adicionar. Verifique se a tabela friends e a função friend_lookup existem.','error'); reset(); }
}
async function removeFriend(id){
  if(!await confirmar('Ele sai da sua lista de amigos.',{titulo:'Remover amigo?',botao:'Remover',perigo:true,icone:'fa-user-minus'})) return;
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
  if(!uid){ showToast(`${friendLabel(f)} ainda não tem conta no GastoPensado — não dá para conversar.`,'error'); return; }
  if(uid===currentUser.id){ showToast('Esse é você mesmo.','error'); return; }
  api.ensureReverseFriend(uid,currentUser.email,myProfile?.username).catch(()=>{});
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
  if(!await confirmar('O saldo entre vocês é recalculado.',{titulo:'Excluir lançamento?',botao:'Excluir',perigo:true})) return;
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
      <div class="dm-avatar">${fotoOuLetra(friendId,String(label||'?').replace(/^@/,'').charAt(0).toUpperCase())}</div>
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
  syncAccountBtn();
  document.getElementById('current-month-label').textContent=monthLabel(viewMonthKey);
  document.querySelector('.month-pill')?.classList.toggle('off-month',!!currentMonthKey&&viewMonthKey!==currentMonthKey);
  const isNow=viewMonthKey===currentMonthKey;
  const mostraFab=currentTab==='home'||currentTab==='categorias';
  document.getElementById('fab').style.display=mostraFab?'flex':'none';
  const mini=document.getElementById('fab-quick');
  if(mini) mini.style.display=(mostraFab&&currentTab==='home'&&categories.length)?'flex':'none';
  const hAdd=document.getElementById('hdr-add'), hQuick=document.getElementById('hdr-quick'), hAlivio=document.getElementById('hdr-alivio');
  if(hAlivio) hAlivio.hidden=!(currentTab==='home'&&categories.length);
  if(hAdd){ hAdd.hidden=!mostraFab; const l=document.getElementById('hdr-add-lbl'); if(l) l.textContent=currentTab==='categorias'?'Nova categoria':'Lançar gasto'; }
  if(hQuick) hQuick.hidden=!(currentTab==='home'&&categories.length);
  const el=document.getElementById('content');
  const web=telaWeb();
  document.documentElement.classList.toggle('gp-web',web);
  if(currentTab!=='mapa') desmontarMapa();
  if(currentTab==='home'&&webDetalhe) renderCatDetalhe(el,webDetalhe);
  else if(currentTab==='home') (web?renderPainel:renderHome)(el);
  else if(currentTab==='categorias') renderCategorias(el);
  else if(currentTab==='historico') renderHistorico(el);
  else if(currentTab==='relatorios') renderRelatorios(el);
  else if(currentTab==='mapa') renderMapa(el);
  else if(currentTab==='amigos') renderFriendsPage(el);
  else renderSplit(el);
  const pt=document.getElementById('page-title');
  if(pt){
    const det=currentTab==='home'&&webDetalhe?categories.find(c=>c.id===webDetalhe):null;
    pt.textContent=det?det.name:({home:'Painel',categorias:'Categorias',historico:'Histórico',relatorios:'Relatórios',mapa:'Mapa dos gastos',amigos:'Amigos',divisao:'Divisão'}[currentTab]||'');
  }
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
  if(currentCatIdx>=categories.length) currentCatIdx=0;

  const days=trialDaysRemaining();
  const trialBannerHtml=days>0&&days<=3?`<div style="padding:8px 20px 0"><div class="trial-banner" style="margin:0"><span>Seu acesso completo termina em <strong>${days} ${days===1?'dia':'dias'}</strong>.</span><button onclick="openPaywall('Continue com seus relatórios')">Ver Pro</button></div></div>`:'';

  const isPast=viewMonthKey<currentMonthKey;
  const rolloverBannerHtml=isPast?`<div style="padding:8px 20px 0"><div class="trial-banner" style="margin:0;border-color:var(--accent-line);background:var(--accent-soft)"><span>Mês encerrado. Levar as sobras e estouros para <strong>${monthLabel(nextMonthKey(viewMonthKey))}</strong>?</span><button onclick="openRolloverMonth()">Levar</button></div></div>`:'';

  const slidesHtml = categories.map((cat,i)=>buildSlide(cat,isNow)).join('');

  el.innerHTML=`<div id="home-content" style="display:flex;flex-direction:column;height:100%">
    ${pendingSharesHtml}
    ${pendingSplitHtml}
    ${unreadHtml}
    ${rolloverBannerHtml}
    ${trialBannerHtml}
    <div class="cat-chips" id="cat-chips">
      ${categories.map((c,i)=>`<button class="cat-chip tone-${catTone(c)}${i===currentCatIdx?' active':''}" data-i="${i}" onclick="goToSlide(${i})"><i class="fa-solid ${catIcon(c)} cc-ico" aria-hidden="true"></i>${escapeHtml(c.name)}</button>`).join('')}
    </div>
    <div class="cat-carousel-wrap" id="carousel-wrap">
      <button class="cat-arrow prev" onclick="slideCats(-1)" aria-label="Categorias anteriores" hidden><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
      <div class="cat-carousel" id="cat-carousel" style="transform:translateX(-${currentCatIdx*100}%)" onscroll="syncCatArrows()">
        ${slidesHtml}
      </div>
      <button class="cat-arrow next" onclick="slideCats(1)" aria-label="Próximas categorias" hidden><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
    </div>
  </div>`;

  setupSwipe();
}

function diasNoMes(mk){ const [y,m]=String(mk).split('-').map(Number); return new Date(y,m,0).getDate(); }
function isoDe(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function rotuloDia(iso){
  if(iso===todayLocal()) return 'Hoje';
  const ontem=new Date(); ontem.setDate(ontem.getDate()-1);
  if(iso===isoDe(ontem)) return 'Ontem';
  const t=new Date(iso+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}).replace(/\./g,'');
  return t.charAt(0).toUpperCase()+t.slice(1);
}
function ritmoDoMes(spent,available){
  const hoje=new Date(), dom=hoje.getDate(), total=diasNoMes(viewMonthKey);
  const restam=Math.max(1,total-dom+1);
  const porDia=available>0?available/restam:0;
  let ritmo;
  if(available<0) ritmo={cls:'over',val:'Estourou',sub:`${brl(Math.abs(available))} acima do teto`};
  else if(spent<=0) ritmo={cls:'ok',val:'Tudo livre',sub:'nenhum gasto ainda'};
  else{
    const media=spent/dom;
    const acaba=dom+Math.floor(available/media);
    if(acaba>=total) ritmo={cls:'ok',val:'Cabe no mês',sub:`média de ${brl(media)}/dia`};
    else{
      const d=new Date(hoje.getFullYear(),hoje.getMonth(),acaba);
      ritmo={cls:'warn',val:`Acaba dia ${d.getDate()}`,sub:`média de ${brl(media)}/dia`};
    }
  }
  return {porDia,restam,ritmo};
}
function xrowHtml(e,canEdit){
  const deOutro=e.user_id&&e.user_id!==currentUser.id;
  const meta=[];
  if(e.previsto) meta.push('<span class="xm-prev"><i class="fa-regular fa-clock" aria-hidden="true"></i> previsto</span>');
  if(e.subcat) meta.push(`<span class="xm-sub">${escapeHtml(e.subcat)}</span>`);
  if(e.recurring&&!e.previsto) meta.push('<span><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> todo mês</span>');
  if(e.installment_total>1) meta.push(`<span>${e.installment_no}/${e.installment_total}</span>`);
  if(e.card_id&&cardLabel(e.card_id)) meta.push(`<span class="xm-card" onclick="event.stopPropagation();openCardInfo('${e.id}')"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> ${escapeHtml(cardLabel(e.card_id))}</span>`);
  if(deOutro) meta.push(`<span class="xm-by">${escapeHtml(userTag(e.user_id)||'parceiro')}</span>`);
  if(e.place) meta.push(`<span class="xm-place"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${escapeHtml(e.place)}</span>`);
  const acao=(!e.previsto&&canEdit)?`openEditExpense('${e.id}')`:`openExpenseDetail('${e.id}')`;
  const clip=(e.image_url||e._img)?`<span class="xrow-clip" onclick="event.stopPropagation();viewReceipt('${e.id}')" title="Ver comprovante" aria-label="Ver comprovante"><i class="fa-solid fa-paperclip" aria-hidden="true"></i></span>`:'';
  return `<div class="xrow${e.previsto?' prev':''}" role="button" tabindex="0" onclick="${acao}">
    <div class="xrow-main">
      <div class="xrow-name"><span class="xrow-txt">${escapeHtml(e.name)}</span>${clip}</div>
      ${meta.length?`<div class="xrow-meta">${meta.join('<i class="xm-dot" aria-hidden="true"></i>')}</div>`:''}
    </div>
    <div class="xrow-val money">${brl(e.value)}</div>
  </div>`;
}
function listaPorDiaHtml(itens,canEdit){
  const grupos={};
  itens.forEach(e=>{ (grupos[e.date]=grupos[e.date]||[]).push(e); });
  return Object.keys(grupos).sort((x,y)=>y.localeCompare(x)).map(d=>{
    const g=grupos[d];
    const tot=g.reduce((s,e)=>s+parseFloat(e.value||0),0);
    return `<div class="day-group">
      <div class="day-head"><span class="day-name">${rotuloDia(d)}</span>${g.length>1?`<span class="day-total money">${brl(tot)}</span>`:''}</div>
      <div class="day-list">${g.map(e=>xrowHtml(e,canEdit)).join('')}</div>
    </div>`;
  }).join('');
}
function discreto(){ try{ return localStorage.getItem('gp-discreto')==='1'; }catch{ return false; } }
function aplicarDiscreto(){ document.documentElement.classList.toggle('gp-discreto',discreto()); }
function toggleDiscreto(){
  const v=!discreto();
  try{ localStorage.setItem('gp-discreto',v?'1':'0'); }catch{}
  aplicarDiscreto(); vib(8); render();
  const sw=document.getElementById('discreto-switch'); if(sw) sw.checked=v;
  showToast(v?'Valores escondidos. Toque no olho para mostrar.':'Valores à mostra.');
}

function buildSlide(cat, isNow){
  const isFuture=!!currentMonthKey&&viewMonthKey>currentMonthKey;
  const catExps=[...expenses.filter(e=>e.cat_id===cat.id),...projectedExpenses.filter(e=>e.cat_id===cat.id)];
  const spent=catExps.reduce((s,e)=>s+parseFloat(e.value),0);
  const budget=effBudget(cat,viewMonthKey);
  const overridden=hasOverride(cat,viewMonthKey);
  const available=budget-spent;
  const pct=budget>0?Math.min((spent/budget)*100,100):0;
  const isOver=available<0, isWarn=!isOver&&pct>75;
  const isOwned=cat.user_id===currentUser.id;
  const perm=isOwned?'owner':sharePerm(cat.id);
  const canEdit=isOwned||perm==='edit';
  const livre=semTeto(cat);

  const doMes=budgetTransfers.filter(t=>!t.month_key||t.month_key===viewMonthKey);
  const movs=movimentosDoMes(cat,doMes.filter(t=>t.from_cat_id===cat.id),doMes.filter(t=>t.to_cat_id===cat.id));
  const movHtml=movBlockHtml(cat,movs);

  const status=livre?'free':isOver?'over':isWarn?'warn':'ok';
  const pctLabel=budget>0?Math.round((spent/budget)*100):0;
  const heroLabel=livre?(isFuture?'Comprometido no mês':'Gasto no mês'):available>=0?(isFuture?'Deve sobrar':'Disponível'):(isFuture?'Vai estourar':'Acima do teto');
  const heroValue=livre?brl(spent):brl(Math.abs(available));
  const oculto=discreto();
  const rit=(isNow&&!livre)?ritmoDoMes(spent,available):null;

  const shared=!isOwned?`<div class="hero-shared"><i class="fa-solid ${perm==='edit'?'fa-pen-to-square':'fa-eye'}" aria-hidden="true"></i> ${perm==='edit'?'Compartilhada · pode editar':'Compartilhada · só leitura'}</div>`:'';

  const stats=rit?`<div class="hero-stats">
      <div class="hs${available>0?'':' over'}">
        <span class="hs-lbl"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i> Por dia</span>
        <span class="hs-val money">${available>0?brl(rit.porDia):'Sem folga'}</span>
        <span class="hs-sub">${available>0?(rit.restam===1?'só hoje':`pelos próximos ${rit.restam} dias`):'o teto já foi'}</span>
      </div>
      <div class="hs ${rit.ritmo.cls}">
        <span class="hs-lbl"><i class="fa-solid fa-gauge-high" aria-hidden="true"></i> No ritmo atual</span>
        <span class="hs-val">${rit.ritmo.val}</span>
        <span class="hs-sub money">${rit.ritmo.sub}</span>
      </div>
    </div>`:'';

  const lista=catExps.length
    ?`<div class="exp-days">${listaPorDiaHtml(catExps,canEdit)}</div>`
    :`<div class="exp-empty"><span class="exp-empty-ico"><i class="fa-regular fa-lightbulb" aria-hidden="true"></i></span><span>${isNow?'Nenhum gasto neste mês ainda.':'Nada lançado neste mês.'}</span>${canEdit&&isNow?`<button class="exp-empty-btn" onclick="openAddExpense('${cat.id}')"><i class="fa-solid fa-plus" aria-hidden="true"></i> Lançar o primeiro</button>`:''}</div>`;

  return `<div class="cat-slide">
    <div class="cat-slide-name">${catBadge(cat)}<span class="csn-txt">${escapeHtml(cat.name)}</span>${livre?'<span class="cat-slide-tag">sem teto</span>':''}</div>
    <div class="cat-hero ${status}">
      ${shared}
      <div class="hero-top">
        <div class="hero-label">${heroLabel}${livre?'<span class="hero-free-tag">sem teto</span>':''}</div>
        <div class="hero-tools">
          <button class="hero-tool" onclick="toggleDiscreto()" aria-label="${oculto?'Mostrar valores':'Esconder valores'}" title="${oculto?'Mostrar valores':'Esconder valores'}"><i class="fa-solid ${oculto?'fa-eye-slash':'fa-eye'}" aria-hidden="true"></i></button>
          <button class="hero-tool" onclick="openCatOptions('${cat.id}')" aria-label="Opções da categoria" title="Opções da categoria"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
        </div>
      </div>
      <div class="hero-amount ${livre||available>=0?'pos':'neg'} money">${!livre&&available<0?'−':''}${heroValue}</div>
      ${livre?`<div class="hero-sub" style="margin-top:12px"><span>${catExps.length} ${catExps.length===1?'lançamento':'lançamentos'}</span><span>sem orçamento definido</span></div>`
        :`<div class="hero-bar"><span style="width:${pct}%"></span></div>
      <div class="hero-sub">
        <span>${isFuture?'Comprometido':'Gasto'} <strong class="money">${brl(spent)}</strong></span>
        <span class="money">${budget>0?`${pctLabel}% de ${brl(budget)}`:'orçamento zerado'}${overridden?' ·&nbsp;ajustado':''}</span>
      </div>`}
      ${stats}
    </div>

    ${movHtml}

    <div class="exp-head">
      <span class="section-label" style="margin:0">Lançamentos${catExps.length?` · ${catExps.length}`:''}</span>
    </div>
    ${lista}
  </div>`;
}

function openCatOptions(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  const isNow=viewMonthKey===currentMonthKey;
  const dono=cat.user_id===currentUser.id;
  const livre=semTeto(cat);
  const outras=categories.filter(c=>c.user_id===currentUser.id&&!semTeto(c)).length>1;
  const op=[];
  op.push(['fa-chart-line','Análise completa','Gráficos, passado, futuro e todos os lançamentos',`abrirCatWeb('${catId}')`]);
  if(isNow&&dono&&!livre) op.push(['fa-sliders','Ajustar orçamento do mês',`Muda o teto só de ${monthLabel(viewMonthKey)}`,`openMonthOverride('${catId}')`]);
  if(mesEditavel()&&dono&&!livre&&outras) op.push(['fa-right-left','Transferir limite','Mover orçamento entre categorias',`openTransferBudget('${catId}')`]);
  if(mesEditavel()&&!livre&&(dono||sharePerm(catId)==='edit')) op.push(['fa-hand-holding-heart','Lançar alívio','Cashback, reembolso ou bônus que volta para o limite',`openAlivio('${catId}')`]);
  if(isNow&&dono&&!livre) op.push(['fa-hand-holding-dollar','Adiantar do mês seguinte','Puxar limite dos meses à frente',`openLoanMonth('${catId}')`]);
  if(dono) op.push(['fa-pen','Editar categoria','Nome, ícone, teto e tipos',`openEditCategory('${catId}')`]);
  if(dono) op.push(['fa-user-plus','Compartilhar','Dar acesso a um amigo',`openShareCategory('${catId}')`]);
  op.push(['fa-map-location-dot','Ver no mapa','Onde os gastos desta categoria aconteceram',`verCatNoMapa('${catId}')`]);
  op.push(['fa-arrow-up-from-bracket','Exportar imagem','Resumo pronto para mandar',`shareCategory('${catId}')`]);
  op.push(['fa-clock-rotate-left','Histórico de atividades','Quem lançou, editou ou apagou',`openActivityLog('${catId}')`]);
  vib(5);
  openSheet(`<div class="opt-head">${catBadge(cat,'lg')}<div class="opt-head-txt"><div class="opt-title">${escapeHtml(cat.name)}</div><div class="opt-sub money">${livre?'Sem teto':`${brl(effBudget(cat,viewMonthKey))} em ${monthLabel(viewMonthKey)}`}</div></div></div>
    <div class="opt-list">${op.map(([ic,t,sub,fn])=>`<button class="opt-row" onclick="closeSheet();${fn}"><span class="opt-ico"><i class="fa-solid ${ic}" aria-hidden="true"></i></span><span class="opt-body"><span class="opt-t">${t}</span><span class="opt-s">${sub}</span></span><i class="fa-solid fa-chevron-right opt-chev" aria-hidden="true"></i></button>`).join('')}</div>`);
}

function openExpenseDetail(expId){
  const e=findExpense(expId); if(!e) return;
  const cat=categories.find(c=>c.id===e.cat_id);
  const linhas=[['Categoria',`${cat?escapeHtml(cat.name):'—'}${e.subcat?` · ${escapeHtml(e.subcat)}`:''}`]];
  const dt=new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long'});
  linhas.push(['Data',dt.charAt(0).toUpperCase()+dt.slice(1)]);
  if(e.installment_total>1) linhas.push(['Parcela',`${e.installment_no} de ${e.installment_total}`]);
  if(e.recurring) linhas.push(['Repetição','Todo mês']);
  if(e.card_id&&cardLabel(e.card_id)) linhas.push(['Cartão',escapeHtml(cardLabel(e.card_id))]);
  if(e.place) linhas.push(['Onde',escapeHtml(e.place)]);
  if(e.user_id&&e.user_id!==currentUser.id) linhas.push(['Lançado por',escapeHtml(userTag(e.user_id)||'outra pessoa')]);
  vib(5);
  openSheet(`<div class="xd-head">${cat?catBadge(cat,'lg'):''}<div class="xd-txt"><div class="xd-name">${escapeHtml(e.name)}</div><div class="xd-val money">${brl(e.value)}</div></div></div>
    ${e.previsto?`<div class="fut-note" style="margin:0 0 12px"><i class="fa-regular fa-clock" aria-hidden="true"></i> Recorrente previsto: ainda não foi lançado neste mês.</div>`:''}
    <div class="cinfo" style="margin-top:0">${linhas.map(([k,v])=>`<div class="cinfo-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
    <div class="xd-acts">
      ${e.lat!=null&&e.lng!=null?`<a class="ghost-btn" href="${mapsUrl(e.lat,e.lng)}" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Ver no mapa</a>`:''}
      ${(e.image_url||e._img)?`<button class="ghost-btn" onclick="closeSheet();viewReceipt('${e.id}')"><i class="fa-solid fa-paperclip" aria-hidden="true"></i> Comprovante</button>`:''}
      ${e.card_id&&cardLabel(e.card_id)?`<button class="ghost-btn" onclick="closeSheet();openCardInfo('${e.id}')"><i class="fa-solid fa-credit-card" aria-hidden="true"></i> Cartão</button>`:''}
    </div>
    <button class="btn-secondary" onclick="closeSheet()">Fechar</button>`);
}

function dataCurta(iso){
  if(!iso) return null;
  const d=new Date(iso);
  if(isNaN(d)) return null;
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','');
}
function movimentosDoMes(cat,transfersOut,transfersIn){
  const out=[];
  const podeMexer=mesEditavel()&&cat.user_id===currentUser.id;
  loans.filter(l=>l.cat_id===cat.id&&l.month_key===viewMonthKey).forEach(l=>{
    const amt=parseFloat(l.amount||0);
    out.push({tipo:'loan',ref:l.loan_group,cat:cat.id,podeMexer,
      ico:'fa-hand-holding-dollar',classe:amt>=0?'amber':'neg',
      titulo:amt>=0?'Limite adiantado':'Devolução do adiantamento',
      onde:amt>=0?'Sai dos meses à frente':'Referente ao adiantamento',
      valor:amt,quando:l.created_at});
  });
  reliefs.filter(r=>r.cat_id===cat.id&&r.month_key===viewMonthKey).forEach(r=>{
    const n=reliefs.filter(x=>x.relief_group===r.relief_group).length;
    out.push({tipo:'relief',ref:r.id,cat:cat.id,podeMexer:mesEditavel()&&(r.user_id===currentUser.id||cat.user_id===currentUser.id),
      ico:fonteIcone(r.source),classe:'pos',
      titulo:r.source||'Alívio',
      onde:[r.name,n>1?`dividido em ${n} categorias`:null,r.user_id&&r.user_id!==currentUser.id?(userTag(r.user_id)||'outra pessoa'):null].filter(Boolean).join(' · ')||'Alívio',
      valor:parseFloat(r.amount||0),quando:r.created_at});
  });
  rollovers.filter(r=>r.cat_id===cat.id&&r.to_month===viewMonthKey&&Math.abs(parseFloat(r.amount||0))>=0.005).forEach(r=>{
    const amt=parseFloat(r.amount||0);
    out.push({tipo:'roll',ref:r.id,cat:cat.id,podeMexer,
      ico:'fa-arrow-right-arrow-left fa-rotate-90',classe:amt>=0?'pos':'neg',
      titulo:amt>=0?'Sobra do mês anterior':'Estouro do mês anterior',
      onde:`${monthLabel(r.from_month)}${r.auto?' · automático':''}`,
      valor:amt,quando:r.created_at});
  });
  (transfersOut||[]).forEach(t=>{
    out.push({tipo:'transfer',ref:t.id,cat:cat.id,podeMexer,
      ico:'fa-arrow-right-from-bracket',classe:'neg',titulo:'Limite enviado',
      onde:`Para ${categories.find(c=>c.id===t.to_cat_id)?.name||'outra categoria'}`,
      valor:-Math.abs(parseFloat(t.amount||0)),quando:t.created_at});
  });
  (transfersIn||[]).forEach(t=>{
    out.push({tipo:'transfer',ref:t.id,cat:cat.id,podeMexer,
      ico:'fa-arrow-right-to-bracket',classe:'pos',titulo:'Limite recebido',
      onde:`De ${categories.find(c=>c.id===t.from_cat_id)?.name||'outra categoria'}`,
      valor:Math.abs(parseFloat(t.amount||0)),quando:t.created_at});
  });
  return out.sort((a,b)=>String(b.quando||'').localeCompare(String(a.quando||'')));
}
function movAberto(catId,qtd){ return movOpen[catId]!==undefined?movOpen[catId]:qtd<=3; }
function movBlockHtml(cat,movs){
  if(!movs.length) return '';
  const liquido=Math.round(movs.reduce((s,m)=>s+m.valor,0)*100)/100;
  const aberto=movAberto(cat.id,movs.length);
  const pos=liquido>=0;
  return `<div class="mov-block${aberto?' open':''}" id="mov-${cat.id}">
    <button class="mov-head" onclick="toggleMov('${cat.id}',${movs.length})">
      <span class="mov-head-ico"><i class="fa-solid fa-sliders" aria-hidden="true"></i></span>
      <span class="mov-head-body">
        <span class="mov-head-title">Movimentações</span>
        <span class="mov-head-sub">${movs.length} ${movs.length===1?'ajuste':'ajustes'} no limite deste mês</span>
      </span>
      <span class="mov-head-num ${pos?'pos':'neg'}">${pos?'+':'−'}${brl(Math.abs(liquido))}</span>
      <i class="fa-solid fa-chevron-down mov-chev" aria-hidden="true"></i>
    </button>
    <div class="mov-list"${aberto?'':' hidden'}>${movs.map(movRowHtml).join('')}</div>
  </div>`;
}
function movRowHtml(m){
  const pos=m.valor>=0;
  const quando=dataCurta(m.quando);
  return `<div class="mov-row">
    <span class="mov-ico ${m.classe}"><i class="fa-solid ${m.ico}" aria-hidden="true"></i></span>
    <span class="mov-body">
      <span class="mov-title">${escapeHtml(m.titulo)}</span>
      <span class="mov-sub">${escapeHtml(m.onde)}${quando?` · ${quando}`:''}</span>
    </span>
    <span class="mov-val ${pos?'pos':'neg'}">${pos?'+':'−'}${brl(Math.abs(m.valor))}</span>
    ${m.podeMexer&&m.ref?`<button class="mov-x" onclick="desfazerMov('${m.tipo}','${m.ref}','${m.cat}')" aria-label="Desfazer" title="Desfazer"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`:''}
  </div>`;
}

async function desfazerMov(tipo,ref,catId){
  if(tipo==='relief') return desfazerAlivio(ref);
  if(tipo==='loan') return reverterLoan(ref,catId);
  if(tipo==='roll') return desfazerRollover(ref);
  if(tipo==='transfer') return desfazerTransfer(ref);
}
async function desfazerRollover(id){
  const r=rollovers.find(x=>String(x.id)===String(id)); if(!r) return;
  const amt=parseFloat(r.amount||0);
  if(!await confirmar(`${brl(Math.abs(amt))} trazido de ${monthLabel(r.from_month)}.\n\nO limite deste mês volta ao que era. O mês de origem não muda.`,{titulo:'Desfazer saldo do mês anterior?',botao:'Desfazer',perigo:true,icone:'fa-rotate-left'})) return;
  try{
    await api.zeroRollover(id);
    r.amount=0;
    saveCache(); vib(12); render();
    showToast('Saldo do mês anterior desfeito.','success');
  }catch{ showToast('Erro ao desfazer.','error'); }
}
async function desfazerTransfer(id){
  const t=budgetTransfers.find(x=>String(x.id)===String(id));
  if(!t){ showToast('Transferência não encontrada.','error'); return; }
  const mk=t.month_key||viewMonthKey;
  const amount=Math.abs(parseFloat(t.amount||0));
  const de=categories.find(c=>c.id===t.from_cat_id), para=categories.find(c=>c.id===t.to_cat_id);
  if(!de||!para){ showToast('Uma das categorias não existe mais.','error'); return; }
  const voltaPara=Math.round((baseBudget(para,mk)-amount)*100)/100;
  if(voltaPara<0){ showToast(`Não dá: ${para.name} ficaria com orçamento negativo em ${monthLabel(mk)}.`,'error'); return; }
  if(!await confirmar(`${brl(amount)} voltam de ${para.name} para ${de.name} em ${monthLabel(mk)}.`,{titulo:'Desfazer transferência?',botao:'Desfazer',perigo:true,icone:'fa-rotate-left'})) return;
  try{
    const voltaDe=Math.round((baseBudget(de,mk)+amount)*100)/100;
    await setMonthBudget(t.from_cat_id,mk,voltaDe===parseFloat(de.budget)?null:voltaDe);
    await setMonthBudget(t.to_cat_id,mk,voltaPara===parseFloat(para.budget)?null:voltaPara);
    await api.deleteBudgetTransfer(id).catch(()=>{});
    budgetTransfers=budgetTransfers.filter(x=>String(x.id)!==String(id));
    saveCache(); vib(12); render();
    showToast(`${brl(amount)} devolvidos para ${de.name}.`,'success');
  }catch{ showToast('Erro ao desfazer a transferência.','error'); }
}
function toggleMov(catId,qtd){
  vib(5);
  const el=document.getElementById(`mov-${catId}`); if(!el) return;
  const aberto=!movAberto(catId,qtd);
  movOpen[catId]=aberto;
  el.classList.toggle('open',aberto);
  const lista=el.querySelector('.mov-list'); if(lista) lista.hidden=!aberto;
}

function sharePerm(catId){ const s=acceptedShares.find(x=>x.category_id===catId); return s?.permission||'view'; }

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
  document.querySelectorAll('.cat-chip').forEach((c,j)=>{
    const on=j===i; c.classList.toggle('active',on);
    if(on) c.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
  });
}

const WEB_MQ=window.matchMedia('(min-width:1100px)');
function telaWeb(){ return WEB_MQ.matches; }
(function(){
  const f=()=>{ const a=document.getElementById('app'); if(currentUser&&a&&a.style.display!=='none') render(); };
  if(WEB_MQ.addEventListener) WEB_MQ.addEventListener('change',f); else if(WEB_MQ.addListener) WEB_MQ.addListener(f);
})();
let todosGastos=[], todosTs=0, todosPromessa=null, webDetalhe=null, webOrganizar=false, detFiltro={busca:'',tipo:''};
function garantirTodos(forcar){
  if(!forcar&&todosTs&&Date.now()-todosTs<300000) return Promise.resolve(todosGastos);
  if(todosPromessa) return todosPromessa;
  todosPromessa=api.getAllExpenses().then(r=>{ todosGastos=r||[]; todosTs=Date.now(); return todosGastos; }).catch(()=>todosGastos).finally(()=>{ todosPromessa=null; });
  return todosPromessa;
}
function gastosTodos(){ return todosGastos.filter(e=>e.month_key!==viewMonthKey).concat(expenses.filter(e=>!e.previsto)); }
function sujarTodos(){ todosTs=0; }
function somaDe(lista){ return lista.reduce((t,e)=>t+(parseFloat(e.value)||0),0); }
function gastoDe(lista,catId,mk){ return somaDe(lista.filter(e=>e.cat_id===catId&&e.month_key===mk)); }
function tetoDe(cat,mk){
  if(!cat||semTeto(cat)) return 0;
  return mk===viewMonthKey?effBudget(cat,mk):Math.round((baseBudget(cat,mk)+loanAmount(cat.id,mk)+reliefAmount(cat.id,mk))*100)/100;
}
function mesesAte(mk,n){ const out=[mk]; let k=mk; for(let i=1;i<n;i++){ k=prevMonthKey(k); out.unshift(k); } return out; }
function mesesApos(mk,n){ const out=[]; let k=mk; for(let i=0;i<n;i++){ k=nextMonthKey(k); out.push(k); } return out; }
function futurosDe(catId,mk){
  return [...futureExpenses.filter(e=>e.month_key===mk&&(!catId||e.cat_id===catId)),...projectedFor(mk).filter(e=>!catId||e.cat_id===catId)];
}
function mesCurto(mk){ return monthLabel(mk).split(' ')[0]; }
function compacto(v){
  const n=parseFloat(v)||0, a=Math.abs(n);
  if(a>=1e6) return (n/1e6).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mi';
  if(a>=1000) return (n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil';
  return Math.round(n).toLocaleString('pt-BR');
}

function webLayout(){
  try{ const v=JSON.parse(localStorage.getItem('gp-web-layout')||'{}'); return {ordem:Array.isArray(v.ordem)?v.ordem:[],ocultas:Array.isArray(v.ocultas)?v.ocultas:[]}; }
  catch{ return {ordem:[],ocultas:[]}; }
}
function salvarWebLayout(l){ try{ localStorage.setItem('gp-web-layout',JSON.stringify(l)); }catch{} }
function catsWeb(){
  const l=webLayout();
  const pos=c=>{ const i=l.ordem.indexOf(c.id); return i<0?100000+categories.indexOf(c):i; };
  const todas=[...categories].sort((a,b)=>pos(a)-pos(b));
  return {visiveis:todas.filter(c=>!l.ocultas.includes(c.id)),ocultas:todas.filter(c=>l.ocultas.includes(c.id))};
}
function moverCatWeb(id,dir){
  const {visiveis,ocultas}=catsWeb();
  const ids=visiveis.map(c=>c.id);
  const i=ids.indexOf(id), j=i+dir;
  if(i<0||j<0||j>=ids.length) return;
  [ids[i],ids[j]]=[ids[j],ids[i]];
  const l=webLayout(); l.ordem=ids.concat(ocultas.map(c=>c.id)); salvarWebLayout(l);
  vib(5); render();
}
function ocultarCatWeb(id,ocultar){
  const l=webLayout();
  l.ocultas=ocultar?[...new Set([...l.ocultas,id])]:l.ocultas.filter(x=>x!==id);
  salvarWebLayout(l); vib(5); render();
  if(ocultar) showToast('Oculta só nesta tela. No celular ela continua aparecendo.');
}
function toggleOrganizar(){ webOrganizar=!webOrganizar; vib(5); render(); }

function vbarsHtml(cols,opt={}){
  const max=Math.max(1,...cols.map(c=>Math.max(c.valor||0,c.teto||0)))*1.12;
  return `<div class="vbars" style="--alto:${opt.alto||170}px">${cols.map(c=>{
    const h=c.valor>0?Math.max(2.5,(c.valor/max)*100):0;
    const t=c.teto?Math.min(100,(c.teto/max)*100):null;
    const acima=c.teto&&c.valor>c.teto+0.005;
    return `<div class="vb-col${c.cls?' '+c.cls:''}"${c.onclick?` onclick="${c.onclick}"`:''} title="${escapeHtml(c.dica||c.label)}: ${brl(c.valor)}${c.teto?` · teto ${brl(c.teto)}`:''}">
      <div class="vb-val money">${c.valor>0?compacto(c.valor):''}</div>
      <div class="vb-area">${t!=null?`<span class="vb-teto" style="bottom:${t}%"></span>`:''}<span class="vb-bar${acima?' over':''}" style="height:${h}%"></span></div>
      <div class="vb-lbl">${escapeHtml(c.label)}</div>
    </div>`;}).join('')}</div>`;
}
function hbarsHtml(linhas,total){
  if(!linhas.length) return '<div class="wempty">Sem dados no período.</div>';
  const max=Math.max(1,...linhas.map(l=>l.valor));
  return `<div class="hbars">${linhas.map(l=>`<div class="hb-row${l.onclick?' click':''}"${l.onclick?` onclick="${l.onclick}"`:''}>
    <div class="hb-top"><span class="hb-name">${l.icone||''}<span class="hb-txt">${escapeHtml(l.nome)}</span></span><span class="hb-val money">${brl(l.valor)}${total?`<em>${Math.round(l.valor/total*100)}%</em>`:''}</span></div>
    <div class="hb-track"><span class="${l.tone?'tone-'+l.tone:''}" style="width:${Math.max(1.5,l.valor/max*100)}%"></span></div>
    ${l.sub?`<div class="hb-sub">${l.sub}</div>`:''}
  </div>`).join('')}</div>`;
}
function ritmoSvg(gastosMes,teto,mk){
  const dias=diasNoMes(mk);
  const ate=mk===currentMonthKey?Math.min(dias,new Date().getDate()):(mk<currentMonthKey?dias:0);
  const porDia=new Array(dias+1).fill(0);
  gastosMes.forEach(e=>{
    const d=String(e.date||'');
    const dia=d.slice(0,7)===mk?parseInt(d.slice(8,10),10):1;
    porDia[Math.min(dias,Math.max(1,dia||1))]+=parseFloat(e.value)||0;
  });
  let acc=0; const pts=[];
  for(let d=1;d<=ate;d++){ acc+=porDia[d]; pts.push([d,acc]); }
  if(!ate) return '<div class="wempty">O mês ainda não começou.</div>';
  const max=Math.max(teto||0,acc,1)*1.1;
  const X=d=>dias>1?((d-1)/(dias-1))*100:0, Y=v=>100-(v/max)*100;
  const linha=pts.map(([d,v])=>`${X(d).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
  const acima=teto&&acc>teto;
  return `<div class="ritmo-chart">
    <div class="rc-plot">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${teto?`<line x1="0" y1="${Y(teto).toFixed(2)}" x2="100" y2="${Y(teto).toFixed(2)}" class="rc-teto"/><line x1="0" y1="100" x2="100" y2="${Y(teto).toFixed(2)}" class="rc-ideal"/>`:''}
        <polygon points="0,100 ${linha} ${X(ate).toFixed(2)},100" class="rc-area${acima?' over':''}"/>
        <polyline points="${linha}" class="rc-line${acima?' over':''}"/>
      </svg>
      ${teto?`<span class="rc-teto-lbl money" style="top:${Y(teto)}%">teto ${compacto(teto)}</span>`:''}
    </div>
    <div class="rc-axis"><span>dia 1</span><span>dia ${Math.ceil(dias/2)}</span><span>dia ${dias}</span></div>
    <div class="rc-legend"><span><i class="rc-k line"></i> gasto acumulado <b class="money">${brl(acc)}</b></span>${teto?'<span><i class="rc-k ideal"></i> ritmo que fecha no teto</span>':''}</div>
  </div>`;
}
function sparkSvg(vals){
  if(!vals.some(v=>v>0)) return '';
  const max=Math.max(...vals,1), n=vals.length;
  const pts=vals.map((v,i)=>`${(n>1?i/(n-1)*100:0).toFixed(1)},${(34-v/max*30).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
}
function kpiHtml(ic,rotulo,valor,sub,cls='',onclick=''){
  return `<div class="kpi${cls?' '+cls:''}${onclick?' click':''}"${onclick?` onclick="${onclick}"`:''}>
    <span class="kpi-lbl"><i class="fa-solid ${ic}" aria-hidden="true"></i> ${rotulo}</span>
    <span class="kpi-val money">${valor}</span>
    ${sub?`<span class="kpi-sub">${String(sub).replace(/[−-]?R\$\s?[\d.,]+/g,m=>`<span class="money">${m}</span>`)}</span>`:''}
  </div>`;
}

function webCardHtml(cat,i,n,base){
  const isNow=viewMonthKey===currentMonthKey;
  const itens=[...expenses.filter(e=>e.cat_id===cat.id),...projectedExpenses.filter(e=>e.cat_id===cat.id)];
  const spent=somaDe(itens), budget=effBudget(cat,viewMonthKey), disp=budget-spent;
  const livre=semTeto(cat);
  const pct=budget>0?Math.min(100,spent/budget*100):0;
  const status=livre?'free':disp<0?'over':pct>75?'warn':'ok';
  const rit=isNow&&!livre?ritmoDoMes(spent,disp):null;
  const hist=mesesAte(currentMonthKey,6).map(mk=>gastoDe(base,cat.id,mk));
  const org=webOrganizar?`<div class="wc-org">
      <button type="button" onclick="event.stopPropagation();moverCatWeb('${cat.id}',-1)" ${i===0?'disabled':''} aria-label="Mover para a esquerda"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i></button>
      <button type="button" onclick="event.stopPropagation();moverCatWeb('${cat.id}',1)" ${i===n-1?'disabled':''} aria-label="Mover para a direita"><i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
      <button type="button" onclick="event.stopPropagation();ocultarCatWeb('${cat.id}',true)" aria-label="Ocultar"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i></button>
    </div>`:'<i class="fa-solid fa-arrow-up-right-from-square wc-go" aria-hidden="true"></i>';
  return `<div class="wcard ${status}${webOrganizar?' org':''}" ${webOrganizar?'':`onclick="abrirCatWeb('${cat.id}')" role="button" tabindex="0"`}>
    <div class="wc-top">${catBadge(cat)}<span class="wc-name">${escapeHtml(cat.name)}</span>${org}</div>
    <div class="wc-lbl">${livre?'Gasto no mês':disp>=0?'Disponível':'Acima do teto'}</div>
    <div class="wc-amt money${!livre&&disp<0?' neg':''}">${livre?brl(spent):(disp<0?'−':'')+brl(Math.abs(disp))}</div>
    ${livre?'':`<div class="wc-bar"><span style="width:${pct}%"></span></div>`}
    <div class="wc-sub"><span class="money">gasto ${brl(spent)}</span><span class="money">${livre?'sem teto':budget>0?`de ${brl(budget)}`:'orçamento zerado'}</span></div>
    <div class="wc-foot">
      ${rit?`<span class="wc-pd"><i class="fa-solid fa-calendar-day" aria-hidden="true"></i> <b class="money">${disp>0?brl(rit.porDia):'sem folga'}</b>${disp>0?'/dia':''}</span><span class="wc-rt ${rit.ritmo.cls}">${rit.ritmo.val}</span>`
        :`<span class="wc-pd">${itens.length} ${itens.length===1?'lançamento':'lançamentos'}</span>`}
    </div>
    ${sparkSvg(hist)}
  </div>`;
}

function renderPainel(el){
  const isNow=viewMonthKey===currentMonthKey;
  if(!todosTs) garantirTodos().then(()=>{ if(currentTab==='home'&&!webDetalhe&&telaWeb()) render(); });
  if(!categories.length){
    el.innerHTML=`<div class="wrap-web"><div class="welcome-card">
      <div class="welcome-emoji"><i class="fa-solid fa-seedling" aria-hidden="true"></i></div>
      <div class="welcome-title">Vamos organizar seus gastos</div>
      <div class="welcome-copy">Crie sua primeira categoria e defina quanto pretende gastar por mês.</div>
      <button class="btn-primary" onclick="openAddCategory()"><i class="fa-solid fa-plus" aria-hidden="true"></i> Criar categoria</button>
    </div></div>`;
    return;
  }
  const base=gastosTodos();
  const {visiveis,ocultas}=catsWeb();
  const idsVis=new Set(visiveis.map(c=>c.id));
  const comTeto=visiveis.filter(c=>!semTeto(c));
  const doMes=[...expenses,...projectedExpenses].filter(e=>idsVis.has(e.cat_id));
  const gastoTotal=somaDe(doMes);
  const gastoTeto=somaDe(doMes.filter(e=>comTeto.some(c=>c.id===e.cat_id)));
  const orc=comTeto.reduce((t,c)=>t+effBudget(c,viewMonthKey),0);
  const disp=orc-gastoTeto;
  const rit=isNow?ritmoDoMes(gastoTeto,disp):null;
  const prox=nextMonthKey(currentMonthKey);
  const compProx=somaDe(futurosDe(null,prox).filter(e=>idsVis.has(e.cat_id)));
  const orcProx=comTeto.reduce((t,c)=>t+tetoDe(c,prox),0);
  const nota=ocultas.length?' · categorias visíveis':'';

  const kpis=`<div class="kpis">
    ${kpiHtml('fa-wallet','Orçamento',brl(orc),`${comTeto.length} ${comTeto.length===1?'categoria':'categorias'} com teto${nota}`)}
    ${kpiHtml('fa-receipt','Gasto',brl(gastoTotal),orc>0?`${Math.round(gastoTeto/orc*100)}% do orçamento`:'no mês')}
    ${kpiHtml('fa-scale-balanced',disp>=0?'Disponível':'Acima do teto',(disp<0?'−':'')+brl(Math.abs(disp)),monthLabel(viewMonthKey),disp>=0?'pos':'neg')}
    ${rit?kpiHtml('fa-calendar-day','Por dia',disp>0?brl(rit.porDia):'Sem folga',disp>0?`pelos próximos ${rit.restam} dias`:'o teto já foi',disp>0?'':'neg'):kpiHtml('fa-list','Lançamentos',String(doMes.length),monthLabel(viewMonthKey))}
    ${kpiHtml('fa-calendar-plus',`Já comprometido em ${mesCurto(prox)}`,brl(compProx),orcProx>0?`${Math.round(compProx/orcProx*100)}% do teto de ${mesCurto(prox)}`:'parcelas e recorrentes','','openFuturo()')}
  </div>`;

  const cats=visiveis.map(c=>({c,v:somaDe(doMes.filter(e=>e.cat_id===c.id))})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const dist=hbarsHtml(cats.slice(0,8).map(x=>({nome:x.c.name,valor:x.v,tone:catTone(x.c),icone:`<i class="fa-solid ${catIcon(x.c)} hb-ico tone-${catTone(x.c)}" aria-hidden="true"></i>`,onclick:`abrirCatWeb('${x.c.id}')`})),gastoTotal);
  const futuro=vbarsHtml(mesesApos(currentMonthKey,4).map(mk=>({label:mesCurto(mk),valor:somaDe(futurosDe(null,mk).filter(e=>idsVis.has(e.cat_id))),teto:comTeto.reduce((t,c)=>t+tetoDe(c,mk),0),cls:'fut',onclick:'openFuturo()',dica:monthLabel(mk)})),{alto:130});

  el.innerHTML=`<div class="wrap-web">
    ${kpis}
    <div class="wsec-head">
      <div class="wsec-title">Categorias <span>${visiveis.length}</span></div>
      <div class="wsec-tools">
        ${ocultas.length&&!webOrganizar?`<button type="button" class="wsec-hint" onclick="toggleOrganizar()" title="Mostrar ou reorganizar"><i class="fa-solid fa-eye-slash" aria-hidden="true"></i> ${ocultas.length} oculta${ocultas.length>1?'s':''}</button>`:''}
        <button type="button" class="wbtn${webOrganizar?' on':''}" onclick="toggleOrganizar()"><i class="fa-solid fa-${webOrganizar?'check':'up-down-left-right'}" aria-hidden="true"></i> ${webOrganizar?'Pronto':'Organizar'}</button>
      </div>
    </div>
    ${webOrganizar?`<div class="org-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Setas mudam a ordem, o olho esconde. Vale só nesta tela do computador — no celular tudo continua igual.</div>`:''}
    ${webOrganizar&&ocultas.length?`<div class="ocultas"><span class="oc-lbl">Ocultas</span>${ocultas.map(c=>`<button type="button" class="pc tone-${catTone(c)}" onclick="ocultarCatWeb('${c.id}',false)"><i class="fa-solid ${catIcon(c)}" aria-hidden="true"></i><span>${escapeHtml(c.name)}</span><em>mostrar</em></button>`).join('')}</div>`:''}
    <div class="wgrid">${visiveis.map((c,i)=>webCardHtml(c,i,visiveis.length,base)).join('')}</div>
    <div class="wrow3">
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Ritmo do mês</div><div class="wp-sub">todas as categorias com teto</div></div>${ritmoSvg(doMes.filter(e=>comTeto.some(c=>c.id===e.cat_id)),orc,viewMonthKey)}</section>
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Onde foi o dinheiro</div><div class="wp-sub">${monthLabel(viewMonthKey)}</div></div>${dist}</section>
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Próximos meses</div><div class="wp-sub">já comprometido · linha = teto</div></div>${futuro}</section>
    </div>
  </div>`;
}

function abrirCatWeb(id){
  webDetalhe=id; detFiltro={busca:'',tipo:''}; vib(5);
  if(currentTab!=='home'){ currentTab='home'; document.querySelectorAll('.nav-item').forEach(t=>t.classList.toggle('active',t.dataset.tab==='home')); }
  render();
  const c=document.getElementById('content'); if(c) c.scrollTop=0;
}
function fecharCatWeb(){ webDetalhe=null; vib(5); render(); }
function detLista(catId){
  const q=normNome(detFiltro.busca);
  return [...expenses.filter(e=>e.cat_id===catId),...projectedExpenses.filter(e=>e.cat_id===catId)]
    .filter(e=>!detFiltro.tipo||(detFiltro.tipo==='__sem'?!e.subcat:e.subcat===detFiltro.tipo))
    .filter(e=>!q||normNome([e.name,e.subcat,e.place].filter(Boolean).join(' ')).includes(q))
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}
function detalhesGasto(e){
  const d=[];
  if(e.previsto) d.push('<span class="wt-prev">previsto</span>');
  if(e.recurring&&!e.previsto) d.push('todo mês');
  if(e.installment_total>1) d.push(`${e.installment_no}/${e.installment_total}`);
  if(e.card_id&&cardLabel(e.card_id)) d.push(escapeHtml(cardLabel(e.card_id)));
  if(e.user_id&&e.user_id!==currentUser.id) d.push(escapeHtml(userTag(e.user_id)||'parceiro'));
  if(e.place) d.push(`<span class="wt-place">${escapeHtml(e.place.split(',').slice(0,2).join(','))}</span>`);
  return d;
}
function detTabelaHtml(catId){
  const cat=categories.find(c=>c.id===catId);
  const pode=cat&&(cat.user_id===currentUser.id||sharePerm(cat.id)==='edit');
  const l=detLista(catId);
  if(!l.length) return `<div class="wempty">${detFiltro.busca||detFiltro.tipo?'Nada com esse filtro.':'Nenhum lançamento neste mês.'}</div>`;
  return `<div class="wtable-wrap"><table class="wtable">
    <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th class="wt-det">Detalhes</th><th class="r">Valor</th></tr></thead>
    <tbody>${l.map(e=>{
      const acao=(!e.previsto&&pode)?`openEditExpense('${e.id}')`:`openExpenseDetail('${e.id}')`;
      const det=detalhesGasto(e);
      return `<tr onclick="${acao}"${e.previsto?' class="prev"':''}>
        <td class="nw">${new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','')}</td>
        <td><span class="wt-name">${escapeHtml(e.name)}</span>${(e.image_url||e._img)?' <i class="fa-solid fa-paperclip wt-clip" aria-hidden="true"></i>':''}</td>
        <td>${e.subcat?`<span class="wt-tag">${escapeHtml(e.subcat)}</span>`:'<span class="wt-mute">—</span>'}</td>
        <td class="wt-det">${det.length?det.join('<i class="xm-dot" aria-hidden="true"></i>'):'<span class="wt-mute">—</span>'}</td>
        <td class="r money">${brl(e.value)}</td>
      </tr>`;}).join('')}</tbody>
    <tfoot><tr><td colspan="3">${l.length} ${l.length===1?'lançamento':'lançamentos'}</td><td class="wt-det"></td><td class="r money">${brl(somaDe(l))}</td></tr></tfoot>
  </table></div>`;
}
function detBuscar(v){
  detFiltro.busca=v;
  clearTimeout(detBuscar._t);
  detBuscar._t=setTimeout(()=>{ const b=document.getElementById('det-tabela'); if(b&&webDetalhe) b.innerHTML=detTabelaHtml(webDetalhe); },120);
}
function detTipo(t){
  detFiltro.tipo=detFiltro.tipo===t?'':t; vib(5);
  document.querySelectorAll('#det-tipos .pc').forEach(b=>b.classList.toggle('on',b.dataset.t===detFiltro.tipo));
  const b=document.getElementById('det-tabela'); if(b) b.innerHTML=detTabelaHtml(webDetalhe);
}

function renderCatDetalhe(el,catId){
  const cat=categories.find(c=>c.id===catId);
  if(!cat){ webDetalhe=null; renderHome(el); return; }
  if(!todosTs) garantirTodos().then(()=>{ if(webDetalhe===catId) render(); });
  const base=gastosTodos();
  const isNow=viewMonthKey===currentMonthKey;
  const livre=semTeto(cat);
  const pode=cat.user_id===currentUser.id||sharePerm(cat.id)==='edit';
  const doMes=[...expenses.filter(e=>e.cat_id===catId),...projectedExpenses.filter(e=>e.cat_id===catId)];
  const spent=somaDe(doMes), teto=effBudget(cat,viewMonthKey), disp=teto-spent;
  const rit=isNow&&!livre?ritmoDoMes(spent,disp):null;
  const ant=prevMonthKey(viewMonthKey), gAnt=gastoDe(base,catId,ant);
  let k=viewMonthKey; const tres=[];
  for(let i=0;i<3;i++){ k=prevMonthKey(k); tres.push(gastoDe(base,catId,k)); }
  const media3=tres.reduce((a,b)=>a+b,0)/3;
  const delta=gAnt>0?((spent-gAnt)/gAnt)*100:null;

  const cols=[
    ...mesesAte(currentMonthKey,6).map(mk=>({label:mesCurto(mk),dica:monthLabel(mk),valor:gastoDe(base,catId,mk),teto:tetoDe(cat,mk),cls:[mk===currentMonthKey?'atual':'',mk===viewMonthKey?'vendo':''].filter(Boolean).join(' ')})),
    ...mesesApos(currentMonthKey,4).map(mk=>({label:mesCurto(mk),dica:`${monthLabel(mk)} · comprometido`,valor:somaDe(futurosDe(catId,mk)),teto:tetoDe(cat,mk),cls:'fut'+(mk===viewMonthKey?' vendo':'')}))
  ];

  const porTipo={};
  doMes.forEach(e=>{ const t=e.subcat||'Sem tipo'; porTipo[t]=(porTipo[t]||0)+(parseFloat(e.value)||0); });
  const tipos=Object.entries(porTipo).sort((a,b)=>b[1]-a[1]);
  const usados=[...new Set(doMes.map(e=>e.subcat).filter(Boolean))];
  const temSemTipo=doMes.some(e=>!e.subcat);

  const proximos=mesesApos(currentMonthKey,6).map(mk=>({mk,itens:futurosDe(catId,mk)})).filter(g=>g.itens.length);
  const doTransf=budgetTransfers.filter(t=>!t.month_key||t.month_key===viewMonthKey);
  const movs=movimentosDoMes(cat,doTransf.filter(t=>t.from_cat_id===catId),doTransf.filter(t=>t.to_cat_id===catId));

  el.innerHTML=`<div class="wrap-web">
    <div class="wd-head">
      <button type="button" class="wd-back" onclick="fecharCatWeb()"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> ${telaWeb()?'Painel':'Voltar'}</button>
      <div class="wd-title">${catBadge(cat,'lg')}<div class="wd-title-txt"><div class="wd-name">${escapeHtml(cat.name)}</div><div class="wd-sub money">${livre?'Sem teto':`Teto de ${brl(teto)} em ${monthLabel(viewMonthKey)}`}${!pode?' · só leitura':''}</div></div></div>
      <div class="wd-acts">
        ${pode?`<button type="button" class="wbtn primary" onclick="openAddExpense('${catId}')"><i class="fa-solid fa-plus" aria-hidden="true"></i> Lançar</button>`:''}
        <button type="button" class="wbtn" onclick="openCatOptions('${catId}')" aria-label="Opções da categoria"><i class="fa-solid fa-ellipsis" aria-hidden="true"></i></button>
      </div>
    </div>
    <div class="kpis">
      ${livre?kpiHtml('fa-receipt','Gasto no mês',brl(spent),`${doMes.length} lançamentos`):kpiHtml('fa-scale-balanced',disp>=0?'Disponível':'Acima do teto',(disp<0?'−':'')+brl(Math.abs(disp)),`gasto ${brl(spent)} de ${brl(teto)}`,disp>=0?'pos':'neg')}
      ${rit?kpiHtml('fa-calendar-day','Por dia',disp>0?brl(rit.porDia):'Sem folga',disp>0?`pelos próximos ${rit.restam} dias`:'o teto já foi',disp>0?'':'neg'):kpiHtml('fa-list','Lançamentos',String(doMes.length),monthLabel(viewMonthKey))}
      ${rit?kpiHtml('fa-gauge-high','No ritmo atual',rit.ritmo.val,rit.ritmo.sub,rit.ritmo.cls==='ok'?'pos':rit.ritmo.cls==='over'?'neg':'warn'):kpiHtml('fa-hashtag','Ticket médio',doMes.length?brl(spent/doMes.length):'—','por lançamento')}
      ${kpiHtml('fa-arrow-right-arrow-left',`vs ${mesCurto(ant)}`,delta==null?'—':`${delta>0?'+':''}${Math.round(delta)}%`,gAnt>0?`${mesCurto(ant)}: ${brl(gAnt)}`:'sem gasto no mês anterior',delta==null?'':delta>0?'neg':'pos')}
      ${kpiHtml('fa-chart-simple','Média de 3 meses',brl(media3),media3>0?(Math.abs(spent/media3-1)<0.01?'este mês em linha com a média':spent>media3?`este mês está ${Math.round((spent/media3-1)*100)}% acima`:`este mês está ${Math.round((1-spent/media3)*100)}% abaixo`):'sem histórico')}
    </div>
    <div class="wd-grid">
      <section class="wpanel span2">
        <div class="wp-head"><div class="wp-title">Passado e futuro</div><div class="wp-sub">gasto nos últimos 6 meses e o que já está comprometido nos próximos 4 · linha = teto</div></div>
        ${vbarsHtml(cols,{alto:200})}
        <div class="vb-legend"><span><i class="vb-k"></i> gasto</span><span><i class="vb-k fut"></i> comprometido</span><span><i class="vb-k teto"></i> teto</span></div>
      </section>
      <section class="wpanel">
        <div class="wp-head"><div class="wp-title">Ritmo de ${mesCurto(viewMonthKey)}</div><div class="wp-sub">acumulado dia a dia</div></div>
        ${ritmoSvg(doMes,livre?0:teto,viewMonthKey)}
      </section>
      <section class="wpanel">
        <div class="wp-head"><div class="wp-title">Por tipo</div><div class="wp-sub">${monthLabel(viewMonthKey)}</div></div>
        ${tipos.length?hbarsHtml(tipos.map(([t,v])=>({nome:t,valor:v,tone:catTone(cat)})),spent):'<div class="wempty">Sem lançamentos no mês.</div>'}
      </section>
      <section class="wpanel span2">
        <div class="wp-head wp-head-row">
          <div><div class="wp-title">Lançamentos de ${monthLabel(viewMonthKey)}</div><div class="wp-sub">clique para ${pode?'editar':'ver'}</div></div>
          <div class="wsearch"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Buscar nome, tipo ou local" oninput="detBuscar(this.value)" autocomplete="off"/></div>
        </div>
        ${(usados.length)?`<div class="pick-chips wrap" id="det-tipos" style="margin-bottom:12px">${usados.map(t=>`<button type="button" class="pc" data-t="${escapeHtml(t)}" onclick="detTipo(this.dataset.t)">${escapeHtml(t)}</button>`).join('')}${temSemTipo?'<button type="button" class="pc" data-t="__sem" onclick="detTipo(this.dataset.t)">Sem tipo</button>':''}</div>`:''}
        <div id="det-tabela">${detTabelaHtml(catId)}</div>
      </section>
      <section class="wpanel">
        <div class="wp-head"><div class="wp-title">Próximos compromissos</div><div class="wp-sub">parcelas e recorrentes à frente</div></div>
        ${proximos.length?`<div class="wfut">${proximos.map(g=>`<div class="wf-mes"><div class="wf-head"><span>${monthLabel(g.mk)}</span><b class="money">${brl(somaDe(g.itens))}</b></div>${g.itens.map(e=>`<div class="wf-item${e.previsto?' prev':''}"><span class="wf-name">${escapeHtml(e.name)}${e.installment_total>1?` <em>${e.installment_no}/${e.installment_total}</em>`:''}${e.previsto?' <em>recorrente</em>':''}</span><span class="money">${brl(e.value)}</span></div>`).join('')}</div>`).join('')}</div>`:'<div class="wempty">Nada comprometido à frente.</div>'}
      </section>
      <section class="wpanel">
        <div class="wp-head"><div class="wp-title">Movimentações do limite</div><div class="wp-sub">${monthLabel(viewMonthKey)}</div></div>
        ${movs.length?`<div class="wmovs">${movs.map(movRowHtml).join('')}</div>`:'<div class="wempty">Nenhum ajuste de limite neste mês.</div>'}
      </section>
    </div>
  </div>`;
}

const DIAS_SEMANA=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
let bi=(()=>{ const pad={periodo:'6m',cat:'',agrupar:'cat',busca:'',ordem:'total',dir:-1,aberto:''}; try{ const b={...pad,...JSON.parse(localStorage.getItem('gp-bi')||'{}'),busca:'',aberto:''}; if(!['nome','qtd','media','total'].includes(b.ordem)){ b.ordem='total'; b.dir=-1; } return b; }catch{ return pad; } })();
function salvarBi(){ try{ localStorage.setItem('gp-bi',JSON.stringify({periodo:bi.periodo,agrupar:bi.agrupar,cat:bi.cat,ordem:bi.ordem,dir:bi.dir})); }catch{} }
function biMeses(){
  if(bi.periodo==='tudo'){
    const ks=[...new Set(gastosTodos().map(e=>e.month_key).filter(k=>k&&k<=currentMonthKey))].sort();
    return ks.length?ks:[currentMonthKey];
  }
  return mesesAte(currentMonthKey,{mes:1,'3m':3,'6m':6,'12m':12}[bi.periodo]||6);
}
function biFiltrados(){
  const meses=new Set(biMeses());
  const q=normNome(bi.busca);
  return gastosTodos().filter(e=>{
    if(!meses.has(e.month_key)) return false;
    if(bi.cat&&e.cat_id!==bi.cat) return false;
    if(q){
      const c=categories.find(x=>x.id===e.cat_id);
      if(!normNome([e.name,e.subcat,e.place,c&&c.name,cardLabel(e.card_id)].filter(Boolean).join(' ')).includes(q)) return false;
    }
    return true;
  });
}
function biChave(e){
  switch(bi.agrupar){
    case 'tipo': return e.subcat||'—';
    case 'mes': return e.month_key;
    case 'dia': return String(new Date(e.date+'T12:00').getDay());
    case 'cartao': return e.card_id||'—';
    case 'local': return e.place?e.place.split(',')[0].trim():'—';
    case 'pessoa': return e.user_id||'—';
    default: return e.cat_id;
  }
}
function biRotulo(k){
  switch(bi.agrupar){
    case 'tipo': return k==='—'?'Sem tipo':k;
    case 'mes': return monthLabel(k);
    case 'dia': return DIAS_SEMANA[+k]||k;
    case 'cartao': return k==='—'?'Sem cartão':(cardLabel(k)||'Cartão removido');
    case 'local': return k==='—'?'Sem local':k;
    case 'pessoa': return k===currentUser.id?'Você':(userTag(k)||'Outra pessoa');
    default: { const c=categories.find(x=>x.id===k); return c?c.name:'Categoria removida'; }
  }
}
function biIcone(k){
  if(bi.agrupar==='cat'){ const c=categories.find(x=>x.id===k); return c?`<i class="fa-solid ${catIcon(c)} hb-ico tone-${catTone(c)}" aria-hidden="true"></i>`:''; }
  const ic={tipo:'fa-tag',mes:'fa-calendar',dia:'fa-calendar-week',cartao:'fa-credit-card',local:'fa-location-dot',pessoa:'fa-user'}[bi.agrupar];
  return ic?`<i class="fa-solid ${ic} hb-ico" aria-hidden="true"></i>`:'';
}
function biPer(p){ bi.periodo=p; bi.aberto=''; salvarBi(); vib(5); marcarSeg('bi-per',p); atualizarBI(); }
function biAgrupar(a){ bi.agrupar=a; bi.aberto=''; salvarBi(); vib(5); marcarSeg('bi-grp',a); atualizarBI(); }
function biCat(v){ bi.cat=v; bi.aberto=''; salvarBi(); atualizarBI(); }
function biBuscar(v){ bi.busca=v; clearTimeout(biBuscar._t); biBuscar._t=setTimeout(atualizarBI,160); }
function biOrdenar(k){ if(bi.ordem===k) bi.dir=-bi.dir; else { bi.ordem=k; bi.dir=k==='nome'?1:-1; } salvarBi(); atualizarBI(); }
function biAbrir(k){ bi.aberto=bi.aberto===k?'':k; vib(5); atualizarBI(); }
function marcarSeg(id,v){ document.querySelectorAll(`#${id} button`).forEach(b=>b.classList.toggle('on',b.dataset.v===v)); }

function renderRelatorios(el){
  if(!isPro()){ el.innerHTML=`<div class="wrap-web">${lockedCard('Relatórios','Busca, agrupamentos, gráficos e exportação estão disponíveis no Pro.')}</div>`; return; }
  const per=[['mes','Este mês'],['3m','3 meses'],['6m','6 meses'],['12m','12 meses'],['tudo','Tudo']];
  const grp=[['cat','Categoria'],['tipo','Tipo'],['mes','Mês'],['dia','Dia da semana'],['cartao','Cartão'],['local','Local'],['pessoa','Pessoa']];
  el.innerHTML=`<div class="wrap-web">
    <button type="button" class="wd-back bi-back" onclick="switchTab('historico')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Histórico</button>
    <div class="bi-bar">
      <div class="seg" id="bi-per">${per.map(([v,l])=>`<button type="button" data-v="${v}" class="${bi.periodo===v?'on':''}" onclick="biPer('${v}')">${l}</button>`).join('')}</div>
      <select class="form-input bi-sel" onchange="biCat(this.value)" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        ${categories.map(c=>`<option value="${c.id}"${bi.cat===c.id?' selected':''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
      <div class="wsearch bi-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" placeholder="Buscar por nome, tipo, local, cartão…" oninput="biBuscar(this.value)" autocomplete="off"/></div>
      <button type="button" class="wbtn" onclick="exportarCSV()"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Exportar CSV</button>
    </div>
    <div class="bi-grp"><span class="bi-grp-lbl">Agrupar por</span><div class="seg" id="bi-grp">${grp.map(([v,l])=>`<button type="button" data-v="${v}" class="${bi.agrupar===v?'on':''}" onclick="biAgrupar('${v}')">${l}</button>`).join('')}</div></div>
    <div id="bi-out"><div class="loading"><div class="spinner"></div>Carregando o histórico…</div></div>
  </div>`;
  garantirTodos().then(()=>{ if(currentTab==='relatorios') atualizarBI(); });
}

function atualizarBI(){
  const out=document.getElementById('bi-out'); if(!out) return;
  const lista=biFiltrados();
  const meses=biMeses();
  const total=somaDe(lista);
  const maior=[...lista].sort((a,b)=>(parseFloat(b.value)||0)-(parseFloat(a.value)||0))[0];
  const nMeses=Math.max(1,meses.length);
  const catSel=bi.cat?categories.find(c=>c.id===bi.cat):null;

  const grupos={};
  lista.forEach(e=>{ const k=biChave(e); const g=(grupos[k]=grupos[k]||{k,total:0,qtd:0,itens:[]}); g.total+=parseFloat(e.value)||0; g.qtd++; g.itens.push(e); });
  let linhas=Object.values(grupos).map(g=>({...g,media:g.total/g.qtd,nome:biRotulo(g.k)}));
  const ord=bi.ordem, dir=bi.dir;
  linhas.sort((a,b)=>{
    if(ord==='nome'){
      if(bi.agrupar==='mes') return dir*a.k.localeCompare(b.k);
      if(bi.agrupar==='dia') return dir*(((+a.k)+6)%7-((+b.k)+6)%7);
      return dir*a.nome.localeCompare(b.nome,'pt-BR');
    }
    return dir*((a[ord]||0)-(b[ord]||0));
  });

  const evol=vbarsHtml(meses.slice(-12).map(mk=>{
    const v=somaDe(lista.filter(e=>e.month_key===mk));
    const t=bi.busca?0:(catSel?tetoDe(catSel,mk):categories.filter(c=>!semTeto(c)).reduce((s,c)=>s+tetoDe(c,mk),0));
    return {label:mesCurto(mk),dica:monthLabel(mk),valor:v,teto:t,cls:mk===currentMonthKey?'atual':''};
  }),{alto:190});

  const semana=[1,2,3,4,5,6,0].map(d=>{ const l=lista.filter(e=>new Date(e.date+'T12:00').getDay()===d); return {label:DIAS_SEMANA[d].slice(0,3),dica:DIAS_SEMANA[d],valor:somaDe(l)}; });
  const futMeses=mesesApos(currentMonthKey,6);
  const q=normNome(bi.busca);
  const futFiltra=e=>{ if(!q) return true; const c=categories.find(x=>x.id===e.cat_id); return normNome([e.name,e.subcat,e.place,c&&c.name].filter(Boolean).join(' ')).includes(q); };
  const comp=vbarsHtml(futMeses.map(mk=>({label:mesCurto(mk),dica:monthLabel(mk),valor:somaDe(futurosDe(bi.cat||null,mk).filter(futFiltra)),teto:bi.busca?0:(catSel?tetoDe(catSel,mk):categories.filter(c=>!semTeto(c)).reduce((s,c)=>s+tetoDe(c,mk),0)),cls:'fut',onclick:'openFuturo()'})),{alto:150});

  const alvs=reliefs.filter(r=>meses.includes(r.month_key)&&(!bi.cat||r.cat_id===bi.cat)&&(!q||normNome([r.source,r.name].filter(Boolean).join(' ')).includes(q)));
  const alvTot=alvs.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const porFonte={}; alvs.forEach(r=>{ const k=r.source||'Alívio'; porFonte[k]=(porFonte[k]||0)+(parseFloat(r.amount)||0); });
  const alivioPanel=`<section class="wpanel"><div class="wp-head"><div class="wp-title">Alívios</div><div class="wp-sub">cashback, reembolso e afins · <span class="money">${brl(alvTot)}</span> no período</div></div>${alvs.length?hbarsHtml(Object.entries(porFonte).sort((a,b)=>b[1]-a[1]).map(([nome,valor])=>({nome,valor,icone:`<i class="fa-solid ${fonteIcone(nome)} hb-ico" aria-hidden="true"></i>`,tone:0})),alvTot):'<div class="wempty">Nenhum alívio no período.</div>'}</section>`;
  const seta=k=>bi.ordem===k?`<i class="fa-solid fa-arrow-${bi.dir>0?'up':'down'} bi-sort" aria-hidden="true"></i>`:'';
  const tabela=linhas.length?`<div class="wtable-wrap"><table class="wtable bi-table">
    <thead><tr>
      <th class="sort" onclick="biOrdenar('nome')">${{cat:'Categoria',tipo:'Tipo',mes:'Mês',dia:'Dia da semana',cartao:'Cartão',local:'Local',pessoa:'Pessoa'}[bi.agrupar]} ${seta('nome')}</th>
      <th class="r sort" onclick="biOrdenar('qtd')"><span class="th-lg">Lançamentos</span><span class="th-sm">Qtd</span> ${seta('qtd')}</th>
      <th class="r sort c-opt" onclick="biOrdenar('media')">Ticket médio ${seta('media')}</th>
      <th class="r sort" onclick="biOrdenar('total')">Total ${seta('total')}</th>
      <th class="r c-opt">Participação</th>
    </tr></thead>
    <tbody>${linhas.map(g=>{
      const aberto=bi.aberto===g.k;
      const pct=total>0?g.total/total*100:0;
      return `<tr class="grp${aberto?' aberto':''}" onclick="biAbrir('${escapeHtml(g.k).replace(/'/g,'&#39;')}')">
        <td><span class="bi-g">${biIcone(g.k)}<span>${escapeHtml(g.nome)}</span><i class="fa-solid fa-chevron-${aberto?'up':'down'} bi-chev" aria-hidden="true"></i></span></td>
        <td class="r">${g.qtd}</td><td class="r money c-opt">${brl(g.media)}</td><td class="r money"><b>${brl(g.total)}</b></td>
        <td class="r c-opt"><span class="bi-pct"><span style="width:${pct.toFixed(1)}%"></span></span>${Math.round(pct)}%</td>
      </tr>${aberto?`<tr class="drill"><td colspan="5" class="drill-td"><div class="drill-list">${[...g.itens].sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,40).map(e=>{ const c=categories.find(x=>x.id===e.cat_id); return `<div class="drill-row" onclick="event.stopPropagation();${(e.user_id===currentUser.id||sharePerm(e.cat_id)==='edit')&&e.month_key===viewMonthKey?`openEditExpense('${e.id}')`:`abrirCatWeb('${e.cat_id}')`}"><span class="nw">${String(e.date).slice(8,10)}/${String(e.date).slice(5,7)}/${String(e.date).slice(2,4)}</span><span class="dr-name">${escapeHtml(e.name)}</span><span class="dr-cat">${c?escapeHtml(c.name):''}${e.subcat?` · ${escapeHtml(e.subcat)}`:''}</span><span class="r money">${brl(e.value)}</span></div>`; }).join('')}${g.itens.length>40?`<div class="drill-mais">+ ${g.itens.length-40} lançamentos</div>`:''}</div></td></tr>`:''}`;
    }).join('')}</tbody>
    <tfoot><tr><td>${linhas.length} ${linhas.length===1?'grupo':'grupos'}</td><td class="r">${lista.length}</td><td class="r money c-opt">${lista.length?brl(total/lista.length):'—'}</td><td class="r money"><b>${brl(total)}</b></td><td class="r c-opt">100%</td></tr></tfoot>
  </table></div>`:'<div class="wempty">Nenhum lançamento com esses filtros.</div>';

  const top=[...lista].sort((a,b)=>(parseFloat(b.value)||0)-(parseFloat(a.value)||0)).slice(0,10);
  const periodoTxt=meses.length===1?monthLabel(meses[0]):`${monthLabel(meses[0])} a ${monthLabel(meses[meses.length-1])}`;

  out.innerHTML=`
    <div class="bi-periodo">${periodoTxt}${catSel?` · ${escapeHtml(catSel.name)}`:''}${bi.busca?` · “${escapeHtml(bi.busca)}”`:''}</div>
    <div class="kpis">
      ${kpiHtml('fa-coins','Total no período',brl(total),`${lista.length} ${lista.length===1?'lançamento':'lançamentos'}`)}
      ${kpiHtml('fa-calendar','Média por mês',brl(total/nMeses),`em ${nMeses} ${nMeses===1?'mês':'meses'}`)}
      ${kpiHtml('fa-hashtag','Ticket médio',lista.length?brl(total/lista.length):'—','por lançamento')}
      ${kpiHtml('fa-arrow-trend-up','Maior gasto',maior?brl(maior.value):'—',maior?escapeHtml(maior.name):'')}
      ${kpiHtml('fa-hand-holding-heart','Alívios',brl(alvTot),alvTot>0?`gasto líquido ${brl(total-alvTot)}`:'nenhum no período',alvTot>0?'pos':'')}
      ${kpiHtml('fa-layer-group','Maior grupo',linhas.length?escapeHtml([...linhas].sort((a,b)=>b.total-a.total)[0].nome):'—',linhas.length&&total?`${Math.round([...linhas].sort((a,b)=>b.total-a.total)[0].total/total*100)}% do total`:'')}
    </div>
    <div class="wd-grid">
      <section class="wpanel span2"><div class="wp-head"><div class="wp-title">Evolução mensal</div><div class="wp-sub">${bi.busca?'gasto dos lançamentos encontrados':'gasto · linha = teto somado'}</div></div>${evol}</section>
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Distribuição</div><div class="wp-sub">por ${{cat:'categoria',tipo:'tipo',mes:'mês',dia:'dia da semana',cartao:'cartão',local:'local',pessoa:'pessoa'}[bi.agrupar]}</div></div>${hbarsHtml([...linhas].sort((a,b)=>b.total-a.total).slice(0,8).map(g=>({nome:g.nome,valor:g.total,icone:biIcone(g.k),tone:bi.agrupar==='cat'?catTone(categories.find(c=>c.id===g.k)):0,onclick:`biAbrir('${escapeHtml(g.k).replace(/'/g,'&#39;')}')`})),total)}</section>
      <section class="wpanel span3"><div class="wp-head"><div class="wp-title">Detalhamento</div><div class="wp-sub">clique no título da coluna para ordenar · clique na linha para ver os lançamentos</div></div>${tabela}</section>
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Dia da semana</div><div class="wp-sub">em que dia o dinheiro sai</div></div>${vbarsHtml(semana,{alto:140})}</section>
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Maiores gastos</div><div class="wp-sub">top 10 do período</div></div>${top.length?`<div class="wtop">${top.map((e,i)=>{ const c=categories.find(x=>x.id===e.cat_id); return `<div class="wt-row" onclick="abrirCatWeb('${e.cat_id}')"><span class="wt-rank">${i+1}</span><span class="wt-mid"><span class="wt-n">${escapeHtml(e.name)}</span><span class="wt-s">${c?escapeHtml(c.name):''} · ${monthLabel(e.month_key)}</span></span><span class="money">${brl(e.value)}</span></div>`; }).join('')}</div>`:'<div class="wempty">Sem gastos.</div>'}</section>
      <section class="wpanel"><div class="wp-head"><div class="wp-title">Comprometido à frente</div><div class="wp-sub">parcelas e recorrentes · linha = teto</div></div>${comp}</section>
      ${alivioPanel}
    </div>`;
}

function exportarCSV(){
  const l=biFiltrados().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!l.length){ showToast('Nada para exportar com esses filtros.','error'); return; }
  const esc=v=>{ const t=String(v==null?'':v); return /[;"\r\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t; };
  const cab=['Data','Mês','Categoria','Tipo','Descrição','Valor','Cartão','Parcela','Recorrente','Local','Lançado por'];
  const linhas=[cab.join(';')].concat(l.map(e=>{
    const c=categories.find(x=>x.id===e.cat_id);
    return [e.date,e.month_key,c?c.name:'',e.subcat||'',e.name,(parseFloat(e.value)||0).toFixed(2).replace('.',','),cardLabel(e.card_id)||'',e.installment_total>1?`${e.installment_no}/${e.installment_total}`:'',e.recurring?'sim':'',e.place||'',e.user_id===currentUser.id?'você':(userTag(e.user_id)||'')].map(esc).join(';');
  }));
  const blob=new Blob(['\ufeff'+linhas.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`gastopensado-${bi.periodo}-${todayLocal()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  showToast(`${l.length} lançamentos exportados.`,'success');
}
const FONTES_PADRAO=[['Cashback','fa-coins'],['Reembolso','fa-receipt'],['Bônus','fa-gift'],['Estorno','fa-rotate-left']];
function fontesExtras(){
  const v=currentUser&&currentUser.user_metadata&&currentUser.user_metadata.alivio_fontes;
  return Array.isArray(v)?v.filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,30)):[];
}
function fontesAlivio(){
  const pad=FONTES_PADRAO.map(([n])=>n);
  return [...pad,...fontesExtras().filter(n=>!pad.some(x=>normNome(x)===normNome(n)))];
}
function fonteIcone(nome){
  const fixa=FONTES_PADRAO.find(([n])=>normNome(n)===normNome(nome)); if(fixa) return fixa[1];
  const t=normNome(nome);
  if(/cash|ponto|milha|livelo|esfera/.test(t)) return 'fa-coins';
  if(/reembols|devolv|ressarc/.test(t)) return 'fa-receipt';
  if(/bonus|premi|presente|brinde|sorteio/.test(t)) return 'fa-gift';
  if(/estorn|chargeback|cancel/.test(t)) return 'fa-rotate-left';
  if(/pix|transfer|ted|deposit/.test(t)) return 'fa-money-bill-transfer';
  if(/venda|vendi|desapeg/.test(t)) return 'fa-tag';
  if(/salari|freela|renda|extra|13/.test(t)) return 'fa-briefcase';
  return 'fa-hand-holding-heart';
}
function lancTipoHtml(ativo){
  return `<div class="lanc-tipo" role="tablist" aria-label="Tipo de lançamento">
    <button type="button" role="tab" class="lt-gasto${ativo==='gasto'?' on':''}" aria-selected="${ativo==='gasto'}" onclick="${ativo==='gasto'?'':'voltarParaGasto()'}"><i class="fa-solid fa-receipt" aria-hidden="true"></i> Gasto</button>
    <button type="button" role="tab" class="lt-alivio${ativo==='alivio'?' on':''}" aria-selected="${ativo==='alivio'}" onclick="${ativo==='alivio'?'':'trocarParaAlivio()'}"><i class="fa-solid fa-hand-holding-heart" aria-hidden="true"></i> Alívio</button>
  </div>`;
}
function catsAlivio(){ return catsLancaveis().filter(c=>!semTeto(c)); }
function mesAlivio(){ return mesEditavel()?viewMonthKey:currentMonthKey; }
let alv=null;
function trocarParaAlivio(){ vib(5); openAlivio(document.getElementById('f-catId')?.value||null); }
function voltarParaGasto(){ vib(5); const c=alv&&alv.cats[0]; openAddExpense(c||catsLancaveis()[0]?.id); }
function openAlivio(catId){
  const cats=catsAlivio();
  if(!cats.length){ showToast(categories.length?'Alívio entra no limite: precisa de uma categoria com teto.':'Crie uma categoria primeiro.','error'); return; }
  const ini=cats.some(c=>c.id===catId)?catId:null;
  alv={total:0,cats:ini?[ini]:[],cents:{},fonte:fontesAlivio()[0],editado:false,editFontes:false};
  openModal(alivioFormHtml());
  syncFontes(); marcarCatsAlivio(); renderAlvSplit();
  const v=document.getElementById('al-valor'); if(v) try{ v.focus({preventScroll:true}); }catch{ v.focus(); }
}
function alivioFormHtml(){
  const mk=mesAlivio();
  return `${lancTipoHtml('alivio')}
    <div class="xf-title">Lançar alívio</div>
    <p class="al-intro">Cashback, reembolso, bônus: dinheiro que volta e <strong>aumenta o limite</strong> de ${monthLabel(mk)}. O teto padrão não muda.</p>
    <label class="amt-box al-amt" for="al-valor">
      <span class="amt-cur">R$</span>
      <input class="amt-input" id="al-valor" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off" oninput="moneyKey(this);alvTotal(this.value)"/>
    </label>
    <div class="amt-lbl">Quanto voltou</div>
    <div class="form-group">
      <label class="form-label">De onde veio</label>
      <div class="pick-chips wrap" id="al-fontes"></div>
      <div class="al-nova" id="al-nova" hidden>
        <input class="form-input" id="al-nova-in" maxlength="30" placeholder="Ex: Pontos Livelo" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();salvarFonte();}"/>
        <button type="button" class="al-nova-ok" onclick="salvarFonte()">Adicionar</button>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Descrição <span class="lbl-opt">opcional</span></label>
      <input class="form-input" id="al-nome" maxlength="80" placeholder="Ex: Cashback da fatura de agosto" autocomplete="off"/></div>
    <div class="form-group">
      <label class="form-label">Vai para <span class="lbl-opt">uma ou mais categorias</span></label>
      <div class="pick-chips wrap" id="al-cats">${catsAlivio().map(c=>`<button type="button" class="pc tone-${catTone(c)}" data-id="${c.id}" onclick="alvCat(this.dataset.id)"><i class="fa-solid ${catIcon(c)}" aria-hidden="true"></i><span>${escapeHtml(c.name)}</span></button>`).join('')}</div>
    </div>
    <div id="al-split"></div>
    <button class="btn-primary" id="al-salvar" onclick="salvarAlivio()" disabled>Lançar alívio</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`;
}
function syncFontes(){
  const box=document.getElementById('al-fontes'); if(!box||!alv) return;
  const extras=fontesExtras();
  const eExtra=n=>extras.some(x=>normNome(x)===normNome(n));
  box.classList.toggle('editando',alv.editFontes);
  box.innerHTML=fontesAlivio().map(n=>{
    const extra=eExtra(n);
    const cls=alv.editFontes?(extra?' al-f-rm':' al-f-fixa'):(alv.fonte===n?' on':'');
    return `<button type="button" class="pc al-f${cls}" data-n="${escapeHtml(n)}" onclick="alvFonte(this.dataset.n)"${alv.editFontes&&!extra?' disabled':''}><i class="fa-solid ${alv.editFontes&&extra?'fa-xmark':fonteIcone(n)}" aria-hidden="true"></i><span>${escapeHtml(n)}</span></button>`;
  }).join('')
  +(alv.editFontes?'':`<button type="button" class="pc al-f-add" onclick="toggleNovaFonte()"><i class="fa-solid fa-plus" aria-hidden="true"></i><span>Nova fonte</span></button>`)
  +(extras.length?`<button type="button" class="pc al-f-edit" onclick="toggleEditFontes()"><i class="fa-solid ${alv.editFontes?'fa-check':'fa-pen'}" aria-hidden="true"></i><span>${alv.editFontes?'Pronto':'Editar'}</span></button>`:'');
}
function alvFonte(n){
  if(!alv) return;
  if(alv.editFontes){ removerFonte(n); return; }
  alv.fonte=n; vib(5); syncFontes(); syncBotaoAlivio();
}
function toggleNovaFonte(abrir){
  const box=document.getElementById('al-nova'); if(!box) return;
  const v=abrir==null?box.hidden:!!abrir;
  box.hidden=!v; vib(5);
  if(v){ const i=document.getElementById('al-nova-in'); if(i){ i.value=''; i.focus(); } }
}
function toggleEditFontes(){ if(!alv) return; alv.editFontes=!alv.editFontes; vib(5); toggleNovaFonte(false); syncFontes(); }
function gravarFontes(lista){
  currentUser.user_metadata={...(currentUser.user_metadata||{}),alivio_fontes:lista};
  try{ if(session) localStorage.setItem(SESSION_KEY,JSON.stringify(session)); }catch{}
  return api.updateUserMeta({alivio_fontes:lista}).then(u=>{
    if(u&&u.user_metadata){ currentUser.user_metadata=u.user_metadata; try{ localStorage.setItem(SESSION_KEY,JSON.stringify(session)); }catch{} }
  });
}
function salvarFonte(){
  const i=document.getElementById('al-nova-in'); if(!i||!alv) return;
  const nome=i.value.trim().replace(/\s+/g,' ').slice(0,30);
  if(!nome){ i.focus(); return; }
  const existente=fontesAlivio().find(n=>normNome(n)===normNome(nome));
  if(existente){ alv.fonte=existente; toggleNovaFonte(false); syncFontes(); syncBotaoAlivio(); return; }
  alv.fonte=nome;
  gravarFontes([...fontesExtras(),nome]).catch(()=>showToast('A fonte vale agora, mas não foi salva na sua conta.','error'));
  vib(10); toggleNovaFonte(false); syncFontes(); syncBotaoAlivio();
}
function removerFonte(n){
  const lista=fontesExtras().filter(x=>normNome(x)!==normNome(n));
  if(alv&&normNome(alv.fonte)===normNome(n)) alv.fonte=fontesAlivio()[0];
  gravarFontes(lista).catch(()=>showToast('Não deu para salvar agora.','error'));
  if(alv&&!lista.length) alv.editFontes=false;
  vib(8); syncFontes(); syncBotaoAlivio();
  showToast(`${n} saiu das fontes. Os alívios já lançados continuam.`);
}
function marcarCatsAlivio(){ document.querySelectorAll('#al-cats .pc').forEach(b=>b.classList.toggle('on',!!alv&&alv.cats.includes(b.dataset.id))); }
function centsDe(txt){ const v=parseNum(String(txt||'')); return isNaN(v)?0:Math.max(0,Math.round(v*100)); }
function fmtCents(c){ return (c/100).toFixed(2).replace('.',','); }
function fmtPct(p){ const r=Math.round(p*10)/10; return (Number.isInteger(r)?String(r):r.toFixed(1)).replace('.',','); }
function somaAlivio(){ return alv.cats.reduce((s,id)=>s+(alv.cents[id]||0),0); }
function dividirIgual(){
  const n=alv.cats.length; alv.cents={};
  if(!n) return;
  const base=Math.floor(alv.total/n), resto=alv.total-base*n;
  alv.cats.forEach((id,i)=>{ alv.cents[id]=base+(i<resto?1:0); });
  alv.editado=false;
}
function reescalar(){
  const soma=somaAlivio();
  if(!soma){ dividirIgual(); return; }
  let acc=0;
  const partes=alv.cats.map(id=>{ const exato=alv.total*(alv.cents[id]||0)/soma; const f=Math.floor(exato); acc+=f; return {id,f,r:exato-f}; });
  let falta=alv.total-acc;
  partes.sort((a,b)=>b.r-a.r).forEach(pp=>{ alv.cents[pp.id]=pp.f+(falta>0?1:0); if(falta>0) falta--; });
}
function alvTotal(txt){
  if(!alv) return;
  alv.total=centsDe(txt);
  if(alv.editado) reescalar(); else dividirIgual();
  syncAlvSplit();
}
function alvCat(id){
  if(!alv) return;
  vib(5);
  alv.cats=alv.cats.includes(id)?alv.cats.filter(x=>x!==id):[...alv.cats,id];
  dividirIgual(); marcarCatsAlivio(); renderAlvSplit();
}
function alvIgual(){ if(!alv) return; vib(8); dividirIgual(); syncAlvSplit(); }
function alvCompletar(id){
  if(!alv) return;
  const dif=alv.total-somaAlivio();
  alv.cents[id]=Math.max(0,(alv.cents[id]||0)+dif);
  alv.editado=true; vib(8); syncAlvSplit();
}
function alvDefinir(id,cents,campo){
  alv.cents[id]=Math.min(cents,alv.total||cents);
  alv.editado=true;
  if(alv.cats.length===2){ const o=alv.cats.find(x=>x!==id); alv.cents[o]=Math.max(0,alv.total-alv.cents[id]); }
  syncAlvSplit(id,campo);
}
function alvValor(id,txt){ if(alv) alvDefinir(id,centsDe(txt),'v'); }
function alvPct(id,txt){
  if(!alv) return;
  const p=parseNum(String(txt||''));
  alvDefinir(id,isNaN(p)?0:Math.round(alv.total*Math.min(100,Math.max(0,p))/100),'p');
}
function renderAlvSplit(){
  const box=document.getElementById('al-split'); if(!box||!alv) return;
  if(!alv.cats.length){ box.innerHTML='<div class="al-vazio"><i class="fa-regular fa-hand-pointer" aria-hidden="true"></i> Toque nas categorias que recebem o alívio. Com mais de uma, o valor é dividido igual e você ajusta.</div>'; syncBotaoAlivio(); return; }
  if(alv.cats.length===1){
    const c=categories.find(x=>x.id===alv.cats[0]);
    box.innerHTML=`<div class="al-um">${c?catBadge(c):''}<span class="al-um-t">Tudo para <strong>${c?escapeHtml(c.name):''}</strong></span><span class="al-um-v money" id="al-um-v"></span></div>`;
    syncAlvSplit(); return;
  }
  box.innerHTML=`<div class="al-split">
    <div class="al-bar" id="al-bar">${alv.cats.map(id=>{ const c=categories.find(x=>x.id===id); return `<span class="al-seg tone-${c?catTone(c):1}" data-id="${id}"></span>`; }).join('')}</div>
    ${alv.cats.map(id=>{ const c=categories.find(x=>x.id===id); return `<div class="al-row" data-id="${id}">
      <span class="al-row-cat">${c?catBadge(c):''}<span class="al-row-n">${c?escapeHtml(c.name):''}</span></span>
      <label class="al-in al-in-v"><span>R$</span><input type="text" inputmode="decimal" id="al-v-${id}" aria-label="Valor para ${c?escapeHtml(c.name):''}" oninput="moneyKey(this);alvValor('${id}',this.value)" onfocus="this.select()"/></label>
      <label class="al-in al-in-p"><input type="text" inputmode="decimal" id="al-p-${id}" aria-label="Porcentagem para ${c?escapeHtml(c.name):''}" oninput="alvPct('${id}',this.value)" onfocus="this.select()"/><span>%</span></label>
      <button type="button" class="al-fix" id="al-fix-${id}" onclick="alvCompletar('${id}')" aria-label="Completar aqui" title="Pôr aqui o que falta"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i></button>
    </div>`; }).join('')}
    <div class="al-foot"><span class="al-st" id="al-st"></span><button type="button" class="al-link" onclick="alvIgual()"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Dividir igual</button></div>
  </div>`;
  syncAlvSplit();
}
function syncAlvSplit(focoId,campo){
  if(!alv) return;
  const um=document.getElementById('al-um-v');
  if(um){ alv.cents[alv.cats[0]]=alv.total; um.textContent=alv.total?brl(alv.total/100):''; syncBotaoAlivio(); return; }
  const soma=somaAlivio(), dif=alv.total-soma;
  alv.cats.forEach(id=>{
    const c=alv.cents[id]||0, pct=alv.total?c/alv.total*100:0;
    const v=document.getElementById(`al-v-${id}`), pc=document.getElementById(`al-p-${id}`), fx=document.getElementById(`al-fix-${id}`);
    if(v&&!(focoId===id&&campo==='v')) v.value=alv.total?fmtCents(c):'';
    if(pc&&!(focoId===id&&campo==='p')) pc.value=alv.total?fmtPct(pct):'';
    if(fx) fx.hidden=!alv.total||dif===0||(c+dif)<0;
    const seg=document.querySelector(`#al-bar .al-seg[data-id="${id}"]`); if(seg) seg.style.width=`${alv.total?Math.min(100,pct):100/alv.cats.length}%`;
  });
  const st=document.getElementById('al-st');
  if(st){
    st.className='al-st'+(!alv.total?'':dif===0?' ok':dif>0?' falta':' passou');
    st.innerHTML=!alv.total?'Digite o valor para dividir'
      :dif===0?`<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Fecha 100% · <span class="money">${brl(alv.total/100)}</span>`
      :dif>0?`<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Faltam <span class="money">${brl(dif/100)}</span>`
      :`<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Passou <span class="money">${brl(-dif/100)}</span>`;
  }
  syncBotaoAlivio();
}
function alivioValido(){
  return !!alv&&alv.total>0&&!!alv.fonte&&alv.cats.length>0&&somaAlivio()===alv.total&&alv.cats.every(id=>(alv.cents[id]||0)>0);
}
function syncBotaoAlivio(){
  const b=document.getElementById('al-salvar'); if(!b||!alv) return;
  const ok=alivioValido();
  b.disabled=!ok;
  const zerada=alv.cats.length>1&&alv.total>0&&somaAlivio()===alv.total&&alv.cats.some(id=>!(alv.cents[id]>0));
  b.textContent=zerada?'Tire a categoria que ficou com zero':ok?`Lançar alívio de ${brl(alv.total/100)}`:'Lançar alívio';
}
async function salvarAlivio(){
  if(!alivioValido()) return;
  const b=document.getElementById('al-salvar'); b.disabled=true; b.textContent='Lançando…';
  const mk=mesAlivio();
  const data=mk===currentMonthKey?todayLocal():`${mk}-01`;
  const grupo=uid()+uid();
  const nome=(document.getElementById('al-nome')?.value||'').trim().slice(0,80)||null;
  const rows=alv.cats.map(id=>({id:uid()+uid(),relief_group:grupo,source:alv.fonte,name:nome,cat_id:id,month_key:mk,amount:alv.cents[id]/100,date:data}));
  const total=alv.total/100, fonte=alv.fonte;
  try{
    await api.insertReliefs(rows);
    reliefs=await api.getReliefs().catch(()=>[...rows.map(r=>({...r,user_id:currentUser.id,created_at:new Date().toISOString()})),...reliefs]);
    vib(15); _closeModal(); render();
    const c1=categories.find(c=>c.id===rows[0].cat_id);
    showToast(`${brl(total)} de ${fonte} ${rows.length>1?`em ${rows.length} categorias`:`em ${c1?c1.name:'categoria'}`}.`,'success');
  }catch(err){
    const msg=String(err?.message||'');
    showToast(/budget_reliefs|schema cache|does not exist/i.test(msg)?'Falta criar a tabela budget_reliefs no Supabase.':`Erro: ${msg.slice(0,80)}`,'error');
    b.disabled=false; syncBotaoAlivio();
  }
}
async function desfazerAlivio(id){
  const r=reliefs.find(x=>String(x.id)===String(id)); if(!r) return;
  const grupo=reliefs.filter(x=>x.relief_group===r.relief_group);
  const cat=categories.find(c=>c.id===r.cat_id);
  const valor=parseFloat(r.amount||0);
  let alvo=null;
  if(grupo.length>1){
    const total=grupo.reduce((s,x)=>s+parseFloat(x.amount||0),0);
    alvo=await perguntar({titulo:`Desfazer ${r.source||'alívio'}?`,texto:`Este alívio de ${brl(total)} foi dividido em ${grupo.length} categorias.`,opcoes:[
      {label:`Desfazer tudo · ${brl(total)}`,valor:'todos',tipo:'danger',icone:'fa-rotate-left'},
      {label:`Só de ${cat?cat.name:'esta categoria'} · ${brl(valor)}`,valor:'um',tipo:'ghost-danger'},
      {label:'Cancelar',valor:null,tipo:'ghost'}
    ]});
  }else{
    alvo=await confirmar(`${brl(valor)} de ${r.source||'alívio'} saem do limite de ${cat?cat.name:'categoria'} em ${monthLabel(r.month_key)}.`,{titulo:'Desfazer alívio?',botao:'Desfazer',perigo:true,icone:'fa-rotate-left'})?'um':null;
  }
  if(!alvo) return;
  try{
    if(alvo==='todos'){ await api.deleteReliefGroup(r.relief_group); reliefs=reliefs.filter(x=>x.relief_group!==r.relief_group); }
    else{ await api.deleteRelief(r.id); reliefs=reliefs.filter(x=>String(x.id)!==String(r.id)); }
    vib(12); render();
    showToast('Alívio desfeito.','success');
  }catch{ showToast('Erro ao desfazer o alívio.','error'); }
}
const LEAFLET_CSS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
const LEAFLET_JS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
let leafletPromessa=null, mapaInst=null, mapaCamada=null, mapaPins=null, mapaTema='', mapaLugares=[];
let mapaF=(()=>{ const pad={periodo:'90',cat:'',mes:''}; try{ return {...pad,...JSON.parse(localStorage.getItem('gp-mapa')||'{}'),mes:''}; }catch{ return pad; } })();
function salvarMapaF(){ try{ localStorage.setItem('gp-mapa',JSON.stringify({periodo:mapaF.periodo,cat:mapaF.cat})); }catch{} }
function carregarLeaflet(){
  if(window.L&&window.L.map) return Promise.resolve(window.L);
  if(leafletPromessa) return leafletPromessa;
  leafletPromessa=new Promise((ok,falha)=>{
    if(!document.querySelector(`link[href="${LEAFLET_CSS}"]`)){
      const css=document.createElement('link'); css.rel='stylesheet'; css.href=LEAFLET_CSS; css.integrity='sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='; css.crossOrigin='anonymous';
      document.head.appendChild(css);
    }
    const js=document.createElement('script'); js.src=LEAFLET_JS; js.integrity='sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='; js.crossOrigin='anonymous'; js.async=true;
    js.onload=()=>window.L&&window.L.map?ok(window.L):falha(new Error('leaflet'));
    js.onerror=()=>{ leafletPromessa=null; js.remove(); falha(new Error('leaflet')); };
    document.head.appendChild(js);
  });
  return leafletPromessa;
}
function tilesMapa(){ return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'; }
function trocarTilesMapa(){
  if(!mapaInst||!window.L) return;
  const url=tilesMapa(); if(url===mapaTema) return;
  if(mapaCamada) mapaCamada.remove();
  mapaCamada=window.L.tileLayer(url,{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(mapaInst);
  mapaTema=url;
}
function desmontarMapa(){ if(mapaInst){ mapaInst.remove(); } mapaInst=null; mapaCamada=null; mapaPins=null; mapaTema=''; }
function temLocal(e){
  const la=parseFloat(e&&e.lat), ln=parseFloat(e&&e.lng);
  return isFinite(la)&&isFinite(ln)&&Math.abs(la)<=90&&Math.abs(ln)<=180&&!(la===0&&ln===0);
}
function mapaMes(){ return mapaF.mes||viewMonthKey||currentMonthKey; }
function mapaFiltrados(){
  const hoje=todayLocal();
  let lista=gastosTodos().filter(e=>!e.previsto&&(!mapaF.cat||e.cat_id===mapaF.cat));
  if(mapaF.periodo==='mes') lista=lista.filter(e=>e.month_key===mapaMes());
  else{
    lista=lista.filter(e=>!e.date||e.date<=hoje);
    if(mapaF.periodo!=='tudo'){ const d=new Date(); d.setDate(d.getDate()-(parseInt(mapaF.periodo,10)||90)+1); const ini=isoDe(d); lista=lista.filter(e=>e.date&&e.date>=ini); }
  }
  return {lista,com:lista.filter(temLocal)};
}
function lugaresDe(com){
  const g={};
  com.forEach(e=>{
    const la=parseFloat(e.lat), ln=parseFloat(e.lng);
    const k=`${la.toFixed(4)},${ln.toFixed(4)}`;
    const x=(g[k]=g[k]||{k,lat:0,lng:0,itens:[],total:0});
    x.itens.push(e); x.total+=parseFloat(e.value)||0; x.lat+=la; x.lng+=ln;
  });
  return Object.values(g).map(x=>{
    const n=x.itens.length;
    x.lat/=n; x.lng/=n;
    const conta=(arr)=>{ const m={}; arr.forEach(v=>{ if(v) m[v]=(m[v]||0)+1; }); return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]||null; };
    const lugar=conta(x.itens.map(e=>e.place));
    x.place=lugar?lugar[0]:null;
    const nome=conta(x.itens.map(e=>String(e.name||'').trim()).filter(v=>v&&!NOME_RAPIDO.test(v)));
    const rua=x.place?x.place.split(',')[0].trim():null;
    x.titulo=nome&&nome[1]*2>=n?nome[0]:(rua||'Local sem endereço');
    x.sub=x.titulo===rua?x.place.split(',').slice(1).join(',').trim():(x.place||'');
    const porCat={}; x.itens.forEach(e=>{ porCat[e.cat_id]=(porCat[e.cat_id]||0)+(parseFloat(e.value)||0); });
    const top=Object.entries(porCat).sort((a,b)=>b[1]-a[1])[0];
    x.cat=top?categories.find(c=>c.id===top[0])||null:null;
    x.itens.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return x;
  }).sort((a,b)=>b.total-a.total);
}
function pinMapa(L,x){
  const t=x.cat?catTone(x.cat):1, ic=x.cat?catIcon(x.cat):'fa-location-dot', n=x.itens.length;
  return L.divIcon({className:'mp-pin-wrap',html:`<span class="mp-pin tone-${t}"><i class="fa-solid ${ic}" aria-hidden="true"></i>${n>1?`<b>${n>99?'99+':n}</b>`:''}</span>`,iconSize:[36,44],iconAnchor:[18,43]});
}
function dataCurtaBR(d){ const t=String(d||''); return t.length>=10?`${t.slice(8,10)}/${t.slice(5,7)}/${t.slice(2,4)}`:'—'; }
function renderMapa(el){
  if(el.querySelector('#mapa-shell')){ atualizarMapa(false); return; }
  desmontarMapa();
  const per=[['mes','Mês'],['60','60 dias'],['90','90 dias'],['120','120 dias'],['tudo','Tudo']];
  el.innerHTML=`<div class="wrap-web mapa-page" id="mapa-shell">
    <button type="button" class="wd-back bi-back" onclick="switchTab('historico')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Histórico</button>
    <div class="bi-bar mapa-bar">
      <div class="seg" id="mapa-per">${per.map(([v,l])=>`<button type="button" data-v="${v}" class="${mapaF.periodo===v?'on':''}" onclick="mapaPer('${v}')">${l}</button>`).join('')}</div>
      <div class="mapa-mes" id="mapa-mes"${mapaF.periodo==='mes'?'':' hidden'}>
        <button type="button" class="mm-arr" onclick="mapaMesPasso(-1)" aria-label="Mês anterior"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <span id="mapa-mes-lbl"></span>
        <button type="button" class="mm-arr" id="mapa-mes-prox" onclick="mapaMesPasso(1)" aria-label="Próximo mês"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>
      <select class="form-input bi-sel" id="mapa-cat" onchange="mapaCat(this.value)" aria-label="Categoria">
        <option value="">Todas as categorias</option>
        ${categories.map(c=>`<option value="${c.id}"${mapaF.cat===c.id?' selected':''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="mapa-resumo" id="mapa-resumo"></div>
    <div class="mapa-grid">
      <div class="mapa-box"><div id="mapa"><div class="loading"><div class="spinner"></div>Carregando o mapa…</div></div><div class="mapa-vazio" id="mapa-vazio" hidden></div></div>
      <section class="wpanel mapa-lista" id="mapa-lista"><div class="wp-head"><div class="wp-title">Onde você mais gasta</div><div class="wp-sub" id="mapa-lista-sub"></div></div><div id="mapa-lugares"></div></section>
    </div>
  </div>`;
  atualizarMapa(false);
  Promise.all([carregarLeaflet(),garantirTodos()]).then(([L])=>{
    if(currentTab!=='mapa'||!document.getElementById('mapa-shell')) return;
    montarMapa(L);
  }).catch(()=>{
    const m=document.getElementById('mapa');
    if(m) m.innerHTML='<div class="wempty mapa-erro"><i class="fa-solid fa-wifi" aria-hidden="true"></i> Não consegui carregar o mapa. Confira a conexão e abra de novo.</div>';
  });
}
function montarMapa(L){
  const box=document.getElementById('mapa'); if(!box) return;
  desmontarMapa();
  box.innerHTML='';
  ajustarAlturaMapa();
  mapaInst=L.map(box,{zoomControl:true,worldCopyJump:true,tap:true});
  mapaInst.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  trocarTilesMapa();
  mapaPins=L.layerGroup().addTo(mapaInst);
  atualizarMapa(true);
}
function ajustarAlturaMapa(){
  const box=document.getElementById('mapa'); if(!box) return;
  const lista=document.getElementById('mapa-lista');
  let h;
  if(telaWeb()){
    const topo=box.getBoundingClientRect().top;
    const fundo=document.getElementById('content').getBoundingClientRect().bottom;
    h=Math.max(420,Math.round(fundo-topo-28));
    if(lista) lista.style.maxHeight=`${h}px`;
  }else{
    h=Math.max(300,Math.min(560,Math.round(window.innerHeight*0.55)));
    if(lista) lista.style.maxHeight='';
  }
  box.style.height=`${h}px`;
  if(mapaInst) mapaInst.invalidateSize();
}
window.addEventListener('resize',()=>{ if(currentTab==='mapa'){ clearTimeout(ajustarAlturaMapa._t); ajustarAlturaMapa._t=setTimeout(ajustarAlturaMapa,120); } });
function atualizarMapa(enquadrar){
  const {lista,com}=mapaFiltrados();
  mapaLugares=lugaresDe(com);
  const total=somaDe(com), sem=lista.length-com.length;
  const res=document.getElementById('mapa-resumo');
  if(res) res.innerHTML=com.length
    ?`<span><b>${com.length}</b> ${com.length===1?'lançamento':'lançamentos'} em <b>${mapaLugares.length}</b> ${mapaLugares.length===1?'lugar':'lugares'} · <b class="money">${brl(total)}</b></span>${sem?`<span class="mr-sem"><i class="fa-regular fa-eye-slash" aria-hidden="true"></i> ${sem} sem local não aparece${sem>1?'m':''}</span>`:''}`
    :`<span class="mr-sem">${lista.length?`${lista.length} ${lista.length===1?'lançamento':'lançamentos'} no período, nenhum com local.`:'Nenhum lançamento no período.'}</span>`;
  const sel=document.getElementById('mapa-cat'); if(sel&&sel.value!==mapaF.cat) sel.value=mapaF.cat;
  marcarSeg('mapa-per',mapaF.periodo);
  const mm=document.getElementById('mapa-mes'); if(mm) mm.hidden=mapaF.periodo!=='mes';
  const lbl=document.getElementById('mapa-mes-lbl'); if(lbl) lbl.textContent=monthLabel(mapaMes());
  const prox=document.getElementById('mapa-mes-prox'); if(prox) prox.disabled=mapaMes()>=currentMonthKey;
  const sub=document.getElementById('mapa-lista-sub'); if(sub) sub.textContent=mapaLugares.length?'toque para ver no mapa':'';
  const box=document.getElementById('mapa-lugares');
  if(box) box.innerHTML=mapaLugares.length?mapaLugares.slice(0,40).map((x,i)=>`<button type="button" class="mp-lugar" onclick="abrirLugar(${i})">
      <span class="mp-rank">${i+1}</span>${x.cat?catBadge(x.cat):'<span class="cat-ico"><i class="fa-solid fa-location-dot" aria-hidden="true"></i></span>'}
      <span class="mp-l-mid"><span class="mp-l-t">${escapeHtml(x.titulo)}</span><span class="mp-l-s">${x.itens.length} ${x.itens.length===1?'lançamento':'lançamentos'}${x.sub?` · ${escapeHtml(x.sub)}`:''}</span></span>
      <span class="mp-l-v money">${brl(x.total)}</span>
    </button>`).join('')+(mapaLugares.length>40?`<div class="drill-mais">+ ${mapaLugares.length-40} lugares no mapa</div>`:'')
    :'<div class="wempty">Quando você lança um gasto com local, ele aparece aqui.</div>';
  const vazio=document.getElementById('mapa-vazio');
  if(vazio){ vazio.hidden=!!mapaLugares.length||!mapaInst; vazio.innerHTML='<i class="fa-solid fa-map-pin" aria-hidden="true"></i><span>Nenhum lançamento com local nesse período.</span>'; }
  if(!mapaInst||!mapaPins||!window.L) return;
  const L=window.L;
  trocarTilesMapa();
  mapaPins.clearLayers();
  mapaLugares.forEach((x,i)=>{
    const m=L.marker([x.lat,x.lng],{icon:pinMapa(L,x),title:x.titulo,riseOnHover:true,keyboard:true});
    m.on('click',()=>abrirLugar(i));
    m.addTo(mapaPins); x.marker=m;
  });
  if(enquadrar){
    if(mapaLugares.length===1) mapaInst.setView([mapaLugares[0].lat,mapaLugares[0].lng],16);
    else if(mapaLugares.length) mapaInst.fitBounds(L.latLngBounds(mapaLugares.map(x=>[x.lat,x.lng])),{padding:[48,48],maxZoom:16});
    else mapaInst.setView([-15.8,-47.9],4);
  }
}
function mapaPer(v){ mapaF.periodo=v; if(v!=='mes') mapaF.mes=''; salvarMapaF(); vib(5); marcarSeg('mapa-per',v); const mm=document.getElementById('mapa-mes'); if(mm) mm.hidden=v!=='mes'; atualizarMapa(true); }
function mapaMesPasso(d){
  const alvo=d<0?prevMonthKey(mapaMes()):nextMonthKey(mapaMes());
  if(d>0&&alvo>currentMonthKey) return;
  mapaF.mes=alvo; vib(5); atualizarMapa(true);
}
function mapaCat(v){ mapaF.cat=v; salvarMapaF(); atualizarMapa(true); }
function verCatNoMapa(catId){ mapaF.cat=catId; salvarMapaF(); switchTab('mapa'); }
function abrirLugar(i){
  const x=mapaLugares[i]; if(!x) return;
  vib(5);
  if(mapaInst) mapaInst.flyTo([x.lat,x.lng],Math.max(mapaInst.getZoom(),15),{duration:.5});
  openSheet(`<div class="xd-head">${x.cat?catBadge(x.cat,'lg'):''}<div class="xd-txt"><div class="xd-name">${escapeHtml(x.titulo)}</div><div class="xd-val money">${brl(x.total)}</div></div></div>
    <div class="mp-sub">${x.itens.length} ${x.itens.length===1?'lançamento':'lançamentos'} aqui${x.sub?` · ${escapeHtml(x.sub)}`:''}</div>
    <div class="mp-lista">${x.itens.slice(0,80).map(e=>{ const c=categories.find(k=>k.id===e.cat_id); return `<button type="button" class="mp-item" onclick="detalheMapa('${escapeHtml(String(e.id))}')"><span class="mp-d">${dataCurtaBR(e.date)}</span><span class="mp-n">${escapeHtml(e.name||'')}<em>${c?escapeHtml(c.name):''}${e.subcat?` · ${escapeHtml(e.subcat)}`:''}</em></span><span class="money">${brl(e.value)}</span></button>`; }).join('')}</div>
    <a class="btn-secondary mp-maps" href="${mapsUrl(x.lat,x.lng)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right" aria-hidden="true"></i> Abrir no Google Maps</a>`);
}
function detalheMapa(id){
  const e=gastosTodos().find(x=>String(x.id)===String(id)); if(!e) return;
  const cat=categories.find(c=>c.id===e.cat_id);
  const linhas=[['Categoria',`${cat?escapeHtml(cat.name):'—'}${e.subcat?` · ${escapeHtml(e.subcat)}`:''}`]];
  const dt=new Date(e.date+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  linhas.push(['Data',dt.charAt(0).toUpperCase()+dt.slice(1)]);
  if(e.month_key&&e.month_key!==String(e.date).slice(0,7)) linhas.push(['Conta em',monthLabel(e.month_key)]);
  if(e.installment_total>1) linhas.push(['Parcela',`${e.installment_no} de ${e.installment_total}`]);
  if(e.recurring) linhas.push(['Repetição','Todo mês']);
  if(e.card_id&&cardLabel(e.card_id)) linhas.push(['Cartão',escapeHtml(cardLabel(e.card_id))]);
  if(e.place) linhas.push(['Onde',escapeHtml(e.place)]);
  if(e.user_id&&e.user_id!==currentUser.id) linhas.push(['Lançado por',escapeHtml(userTag(e.user_id)||'outra pessoa')]);
  const pode=e.user_id===currentUser.id||sharePerm(e.cat_id)==='edit'||(cat&&cat.user_id===currentUser.id&&!e.user_id);
  vib(5);
  openSheet(`<div class="xd-head">${cat?catBadge(cat,'lg'):''}<div class="xd-txt"><div class="xd-name">${escapeHtml(e.name||'')}</div><div class="xd-val money">${brl(e.value)}</div></div></div>
    <div class="cinfo" style="margin-top:0">${linhas.map(([k,v])=>`<div class="cinfo-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div>
    ${pode?`<button class="btn-primary" onclick="editarDoMapa('${escapeHtml(String(e.id))}','${escapeHtml(String(e.month_key))}')"><i class="fa-solid fa-pen" aria-hidden="true"></i> Editar gasto</button>`:''}
    <button class="btn-secondary" onclick="closeSheet()">Fechar</button>`);
}
async function editarDoMapa(id,mk){
  closeSheet();
  if(mk&&mk!==viewMonthKey) await goToMonth(mk);
  if(!expenses.some(x=>x.id===id)){ showToast('Não achei esse gasto. Ele pode ter sido apagado.','error'); return; }
  openEditExpense(id);
}
function telaLarga(){ return window.matchMedia('(min-width:700px)').matches; }
function slideCats(dir){
  const c=document.getElementById('cat-carousel'); if(!c) return;
  vib(5);
  const slide=c.querySelector('.cat-slide');
  const passo=slide?slide.getBoundingClientRect().width+18:Math.max(260,c.clientWidth*0.8);
  const inicio=c.scrollLeft;
  const alvo=Math.max(0,Math.min(c.scrollWidth-c.clientWidth,inicio+dir*passo));
  try{ c.scrollTo({left:alvo,behavior:'smooth'}); }catch{ c.scrollLeft=alvo; }
  setTimeout(()=>{ if(c.scrollLeft===inicio&&alvo!==inicio) c.scrollLeft=alvo; syncCatArrows(); },400);
}
function syncCatArrows(){
  const c=document.getElementById('cat-carousel'); if(!c) return;
  const prev=document.querySelector('.cat-arrow.prev'), next=document.querySelector('.cat-arrow.next');
  const sobra=c.scrollWidth-c.clientWidth;
  const mostra=telaLarga()&&sobra>4;
  if(prev){ prev.hidden=!mostra; prev.disabled=c.scrollLeft<=2; }
  if(next){ next.hidden=!mostra; next.disabled=c.scrollLeft>=sobra-2; }
}
function setupSwipe(){
  const wrap=document.getElementById('carousel-wrap');
  if(!wrap) return;
  syncCatArrows();
  if(telaLarga()) return;
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
  const comTeto=categories.filter(c=>!semTeto(c));
  const livres=categories.length-comTeto.length;
  const totalBudget=comTeto.reduce((s,c)=>s+parseFloat(c.budget||0),0);
  const totalHtml=`<div class="cat-total-card">
    <span class="cat-total-label"><i class="fa-solid fa-wallet" aria-hidden="true"></i> Orçamento total · ${comTeto.length} ${comTeto.length===1?'categoria':'categorias'}${livres?` <span style="opacity:.7">(+${livres} sem teto)</span>`:''}</span>
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
      ${catBadge(cat,'lg')}
      <div class="cat-manage-info">
        <div class="cat-manage-name">${escapeHtml(cat.name)}${!owned?`<span style="font-size:10px;color:var(--accent-text);background:var(--accent-soft);border-radius:100px;padding:1px 7px;margin-left:6px;font-weight:600">${perm==='edit'?'editar':'leitura'}</span>`:''}</div>
        <div class="cat-manage-budget">${semTeto(cat)?'<span class="free-tag">sem teto</span>':`${brl(cat.budget)}/mês`}</div>
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

function renderHistorico(el){
  if(!isPro()){
    const current=expenses.reduce((s,e)=>s+parseFloat(e.value),0);
    const totalBudget=categories.reduce((s,c)=>s+effBudget(c,currentMonthKey),0);
    const totalAvail=totalBudget-current;
    const totalPct=totalBudget>0?Math.min((current/totalBudget)*100,100):0;
    el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))">
      
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
  el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))"><div class="loading"><div class="spinner"></div>Carregando...</div></div>`;
  renderHistoricoAsync(el);
}
async function renderHistoricoAsync(el){
  let allExps=[];
  try{ allExps=await api.getAllExpenses(); }
  catch{ el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))"><div class="empty"><div class="empty-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="empty-text">Erro ao carregar histórico.</div></div></div>`; return; }

  const byMonth={};
  allExps.forEach(e=>{ (byMonth[e.month_key]=byMonth[e.month_key]||[]).push(e); });

  const budgetOf=mk=>categories.reduce((s,c)=>s+effBudget(c,mk),0);

  const chartMonths=months.filter(m=>byMonth[m.key]).slice(0,6).reverse();
  let chartHtml='';
  if(chartMonths.length>1){
    const semTetoIds=new Set(categories.filter(semTeto).map(c=>c.id));
    const totals=chartMonths.map(m=>byMonth[m.key].reduce((s,e)=>s+parseFloat(e.value),0));
    const totaisComTeto=chartMonths.map(m=>byMonth[m.key].filter(e=>!semTetoIds.has(e.cat_id)).reduce((s,e)=>s+parseFloat(e.value),0));
    const max=Math.max(...totals, ...chartMonths.map(m=>budgetOf(m.key)), 1);
    chartHtml=`<div class="chart-card">
      <div class="chart-title">Gasto total por mês</div>
      <div class="chart-bars">
        ${chartMonths.map((m,i)=>{
          const h=Math.max((totals[i]/max)*100,4);
          const mb=budgetOf(m.key);
          const over=mb>0&&totaisComTeto[i]>mb;
          return `<div class="chart-col">
            <div class="chart-val">${totals[i]>=1000?(totals[i]/1000).toFixed(1).replace('.',',')+'k':Math.round(totals[i])}</div>
            <div class="chart-bar${over?' over':''}" style="height:${h}%"></div>
            <div class="chart-label">${monthLabel(m.key).split(' ')[0]}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  const idsLivres=new Set(categories.filter(semTeto).map(c=>c.id));
  const gastoLivre=expenses.filter(e=>idsLivres.has(e.cat_id)).reduce((s,e)=>s+parseFloat(e.value),0);
  const totalSpentSummary=expenses.filter(e=>!idsLivres.has(e.cat_id)).reduce((s,e)=>s+parseFloat(e.value),0);
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
    ${gastoLivre>0?`<div class="summary-free"><span><i class="fa-solid fa-infinity" aria-hidden="true"></i> Categorias sem teto</span><span>${brl(gastoLivre)}</span></div>`:''}
    <button class="summary-btn" onclick="openConsolidado()">Ver consolidado do mês <i class="fa-solid fa-chevron-right" style="font-size:10px" aria-hidden="true"></i></button>
    <button class="summary-btn" onclick="openFuturo()">Saldo dos próximos meses <i class="fa-solid fa-chevron-right" style="font-size:10px" aria-hidden="true"></i></button>
    <button class="summary-btn accent" onclick="switchTab('relatorios')"><i class="fa-solid fa-chart-pie" aria-hidden="true"></i> Relatórios: busca, agrupamentos e gráficos <i class="fa-solid fa-chevron-right" style="font-size:10px" aria-hidden="true"></i></button>
    <button class="summary-btn accent" onclick="switchTab('mapa')"><i class="fa-solid fa-map-location-dot" aria-hidden="true"></i> Mapa: onde cada gasto aconteceu <i class="fa-solid fa-chevron-right" style="font-size:10px" aria-hidden="true"></i></button>
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
    const monthSpent=exps.filter(e=>!idsLivres.has(e.cat_id)).reduce((s,e)=>s+parseFloat(e.value),0);
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
      const livre=semTeto(cat);
      const cb=effBudget(cat,month.key);
      const avail=cb-spent;
      html+=`<div class="hist-cat-item">
        <div class="hist-cat-name"><span>${cat.name}</span>${livre?'<span class="free-tag">sem teto</span>':badgeHtml(avail)}</div>
        ${livre?`<div class="hist-row"><span>Gasto</span><span>${brl(spent)}</span></div>`
        :`<div class="hist-row"><span>Orçamento</span><span>${brl(cb)}</span></div>
        <div class="hist-row"><span>Gasto</span><span>${brl(spent)}</span></div>
        <div class="hist-row"><span>Saldo</span><span style="color:${avail>=0?'var(--accent)':'var(--red)'}">${brl(avail)}</span></div>`}
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
  el.innerHTML=`<div style="padding:16px 20px calc(28px + var(--safe-bot))">${html||'<div class="empty"><div class="empty-icon"><i class="fa-regular fa-calendar-xmark"></i></div><div class="empty-text">Nenhum gasto registrado ainda.</div></div>'}</div>`;
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
  if(!await confirmar('O saldo do grupo volta ao estado anterior.',{titulo:'Remover pagamento?',botao:'Remover',perigo:true}))return;
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
  if(!await confirmar('Todas as despesas, membros e pagamentos do grupo são removidos.\n\nNão dá para desfazer.',{titulo:`Excluir "${group?.name||'grupo'}"?`,botao:'Excluir grupo',perigo:true})) return;
  try{
    await api.deleteSplitGroup(groupId);
    splitGroups=splitGroups.filter(g=>g.id!==groupId);
    _closeModal();
    showToast('Grupo excluído.','success');
    renderSplit(document.getElementById('content'));
  }catch(e){showToast('Erro ao excluir grupo: '+String(e?.message||'').slice(0,50),'error');}
}

function openModal(html){ document.getElementById('modal-content').innerHTML=html; document.getElementById('modal-overlay').classList.add('open'); fitViewport(); }
function _closeModal(){ closeSheet(); document.getElementById('modal-overlay').classList.remove('open'); }
function closeModalOverlay(e){ if(e.target===document.getElementById('modal-overlay')) _closeModal(); }
function openSheet(html){
  closeSheet();
  const ov=document.createElement('div');
  ov.id='gc-sheet'; ov.className='dm-sheet-overlay';
  ov.onclick=e=>{ if(e.target===ov) closeSheet(); };
  ov.innerHTML=`<div class="dm-sheet"><div class="modal-handle"></div>${html}</div>`;
  document.body.appendChild(ov);
  fitViewport();
  requestAnimationFrame(()=>ov.classList.add('open'));
}
function closeSheet(){ document.getElementById('gc-sheet')?.remove(); }
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
    const used=expenses.filter(e=>!e.previsto&&e.date===today).length;
    if(used>=CONFIG.FREE_DAILY_LAUNCHES){ openPaywall(`Você já registrou ${used} gastos hoje. No Pro, os lançamentos são ilimitados.`); return; }
  }
  openModal(expenseFormHtml(null,catId));
  posAbrirForm(null);
  autoLocal();
  const v=document.getElementById('f-value'); if(v) try{ v.focus({preventScroll:true}); }catch{ v.focus(); }
}
function repeatFieldHtml(mode='none',installmentTotal='',installmentNo=1,valueMode='compra',isEdit=false,cardId='',lockCard=false){
  const total=Math.max(1,parseInt(installmentTotal,10)||1);
  const no=Math.min(total,Math.max(1,parseInt(installmentNo,10)||1));
  return `<div class="form-group"><label class="form-label">Repetição</label>
    <div class="dm-seg" id="f-repeat-seg">
      <button type="button" class="dm-seg-btn${mode==='none'?' active':''}" data-v="none" onclick="repeatSeg(this)">Única</button>
      <button type="button" class="dm-seg-btn${mode==='recurring'?' active':''}" data-v="recurring" onclick="repeatSeg(this)">Recorrente</button>
      <button type="button" class="dm-seg-btn${mode==='installment'?' active':''}" data-v="installment" onclick="repeatSeg(this)">Cartão</button>
    </div>
    <div id="f-installment-wrap" ${mode==='installment'?'':'hidden'} style="margin-top:12px">
      <input type="hidden" id="f-card" value="${cardId||''}"/>
      <input type="hidden" id="f-installment-no" value="${no}"/>
      <input type="hidden" id="f-installment-total" value="${total}"/>
      <div class="pick-row${lockCard?' locked':''}" id="f-card-row"${lockCard?' data-locked="1"':' role="button" tabindex="0" onclick="openCardPicker()"'}>
        <span class="pick-ico"><i class="fa-solid fa-credit-card" aria-hidden="true"></i></span>
        <span class="pick-body"><span class="pick-name" id="f-card-val">Sem cartão específico</span><span class="pick-sub" id="f-card-sub">Toque para escolher</span></span>
        <i class="fa-solid fa-${lockCard?'lock':'chevron-right'} pick-arrow" aria-hidden="true"></i>
      </div>
      <div class="dm-seg" id="f-installment-vmode" style="margin:12px 0">
        <button type="button" class="dm-seg-btn${valueMode==='parcela'?'':' active'}" data-v="compra" onclick="instVModeSeg(this)">Valor da compra</button>
        <button type="button" class="dm-seg-btn${valueMode==='parcela'?' active':''}" data-v="parcela" onclick="instVModeSeg(this)">Valor da parcela</button>
      </div>
      <div class="step-grid">
        ${stepperHtml('no','Parcela atual',no)}
        ${stepperHtml('total','Total de parcelas',total)}
      </div>
      <div class="inst-sum" id="f-inst-sum"></div>
      <div class="tm-row" id="f-thismonth-row"${isEdit?' hidden data-edit="1"':''}>
        <input type="checkbox" id="f-installment-thismonth" checked onchange="onThisMonthToggle()"/>
        <label for="f-installment-thismonth">Cai já neste mês<span>Desmarque se a fatura já fechou e a cobrança só chega no mês que vem.</span></label>
      </div>
      <div class="inst-target" id="f-invoice-hint" hidden></div>
    </div>
  </div>`;
}
function stepperHtml(k,label,val){
  return `<div class="stepper">
    <span class="stepper-lbl">${label}</span>
    <div class="stepper-ctl">
      <button type="button" class="stepper-btn" onclick="stepInst('${k}',-1)" aria-label="Diminuir ${label}"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
      <span class="stepper-val" data-step="${k}" id="f-inst-${k}-val">${val}</span>
      <button type="button" class="stepper-btn" onclick="stepInst('${k}',1)" aria-label="Aumentar ${label}"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
    </div>
    <span class="stepper-drag"><i class="fa-solid fa-arrows-left-right" aria-hidden="true"></i> arraste o número</span>
  </div>`;
}
function instGet(k){ const el=document.getElementById(k==='no'?'f-installment-no':'f-installment-total'); return el?Math.max(1,parseInt(el.value,10)||1):1; }
function instSet(k,v){
  v=Math.max(1,Math.min(60,Math.round(v)));
  let no=instGet('no'), total=instGet('total');
  if(k==='no'){ no=v; if(no>total) total=no; } else { total=v; if(no>total) no=total; }
  const en=document.getElementById('f-installment-no'); if(en) en.value=no;
  const et=document.getElementById('f-installment-total'); if(et) et.value=total;
  const dn=document.getElementById('f-inst-no-val'); if(dn) dn.textContent=no;
  const dt=document.getElementById('f-inst-total-val'); if(dt) dt.textContent=total;
  syncInstSummary();
}
function stepInst(k,d){ const antes=instGet(k); instSet(k,antes+d); if(instGet(k)!==antes) vib(6); }
let _stepDrag=null;
function stepDown(e){
  const el=e.target&&e.target.closest?e.target.closest('.stepper-val'):null; if(!el) return;
  _stepDrag={k:el.dataset.step,x:e.clientX,base:instGet(el.dataset.step),passos:0};
  el.classList.add('dragging');
  try{ el.setPointerCapture(e.pointerId); }catch{}
  e.preventDefault();
}
function stepMove(e){
  if(!_stepDrag) return;
  const dx=e.clientX-_stepDrag.x;
  if(Math.abs(dx)<6) return;
  const passos=Math.round(dx/13);
  if(passos===_stepDrag.passos) return;
  _stepDrag.passos=passos;
  instSet(_stepDrag.k,_stepDrag.base+passos);
  vib(4);
}
function stepUp(){
  if(!_stepDrag) return;
  document.querySelectorAll('.stepper-val.dragging').forEach(el=>el.classList.remove('dragging'));
  _stepDrag=null;
}
document.addEventListener('pointerdown',stepDown,{passive:false});
document.addEventListener('pointermove',stepMove);
document.addEventListener('pointerup',stepUp);
document.addEventListener('pointercancel',stepUp);
function selectedCard(){ const el=document.getElementById('f-card'); return el&&el.value?cardById(el.value):null; }
function openCardPicker(){
  if(!cards.length){ showToast('Cadastre um cartão em Sua conta › Meus cartões.','error'); return; }
  const cur=document.getElementById('f-card')?.value||'';
  const opcoes=cards.map(c=>`<button type="button" class="pick-opt${c.id===cur?' on':''}" onclick="pickCard('${c.id}')">
      <span class="pick-ico"><i class="fa-solid fa-credit-card" aria-hidden="true"></i></span>
      <span class="pick-body"><span class="pick-name">${escapeHtml(c.name)}</span><span class="pick-sub">Fecha dia ${c.closing_day}${c.due_day?` · vence dia ${c.due_day}`:''}</span></span>
      <i class="fa-solid fa-check pick-chk" aria-hidden="true"></i>
    </button>`).join('');
  openSheet(`<div class="modal-title">Em qual cartão foi a compra?</div>
    <p class="modal-note">Escolhendo o cartão, o app descobre sozinho em qual fatura a compra entra.</p>
    <div class="pick-list">${opcoes}
      <button type="button" class="pick-opt${cur?'':' on'}" onclick="pickCard('')">
        <span class="pick-ico"><i class="fa-solid fa-hand-pointer" aria-hidden="true"></i></span>
        <span class="pick-body"><span class="pick-name">Não quero especificar</span><span class="pick-sub">Você decide na mão em qual mês entra</span></span>
        <i class="fa-solid fa-check pick-chk" aria-hidden="true"></i>
      </button>
    </div>`);
}
function pickCard(id){
  const el=document.getElementById('f-card'); if(el) el.value=id;
  closeSheet(); vib(10); syncCardRow(); syncInvoiceHint();
}
function syncCardRow(){
  const row=document.getElementById('f-card-row'); if(!row) return;
  const c=selectedCard();
  const travado=!!row.dataset.locked;
  const val=document.getElementById('f-card-val');
  const sub=document.getElementById('f-card-sub');
  row.classList.toggle('on',!!c);
  if(travado){
    const temId=!!document.getElementById('f-card')?.value;
    if(val) val.textContent=c?c.name:(temId?'Cartão de outra pessoa':'Sem cartão específico');
    if(sub) sub.textContent=c
      ? `${cardDatesLabel(c)}${cardIsMine(c)?'':` · de ${cardOwnerLabel(c)}`}`
      : (temId?'Sem acesso aos dados deste cartão':'Quem lançou não informou o cartão');
  }else{
    if(val) val.textContent=c?c.name:(cards.length?'Sem cartão específico':'Nenhum cartão cadastrado');
    if(sub) sub.textContent=c?cardDatesLabel(c):(cards.length?'Toque para escolher':'Cadastre em Sua conta › Meus cartões');
  }
  const tm=document.getElementById('f-thismonth-row');
  if(tm&&!tm.dataset.edit) tm.hidden=!!c;
}
function repeatSeg(btn){
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  setTimeout(syncMaisResumo,0);
  const isInst=btn.dataset.v==='installment';
  const wrap=document.getElementById('f-installment-wrap');
  if(wrap) wrap.hidden=!isInst;
  updateValueFieldLabel();
  if(isInst){
    syncCardRow(); syncInstSummary(); syncInvoiceHint();
    const jaTem=document.getElementById('f-card')?.value;
    const travado=!!document.getElementById('f-card-row')?.dataset.locked;
    if(wrap&&!jaTem&&!travado&&cards.length&&!wrap.dataset.asked){ wrap.dataset.asked='1'; openCardPicker(); }
  }
}
function repeatSegVal(){ const el=document.querySelector('#f-repeat-seg .dm-seg-btn.active'); return el?el.dataset.v:'none'; }
function onThisMonthToggle(){ syncInvoiceHint(); }
function onExpenseDateChange(){ if(repeatSegVal()==='installment') syncInvoiceHint(); }
function onExpenseValueInput(){ if(repeatSegVal()==='installment') syncInstSummary(); }
function invoiceTargetMonth(){
  const card=selectedCard();
  const date=document.getElementById('f-date')?.value;
  if(card&&date) return cardInvoiceMonth(card,date)||viewMonthKey;
  const cb=document.getElementById('f-installment-thismonth');
  return (cb&&!cb.checked)?nextMonthKey(viewMonthKey):viewMonthKey;
}
function syncInvoiceHint(){
  const hint=document.getElementById('f-invoice-hint'); if(!hint) return;
  const card=selectedCard();
  const alvo=invoiceTargetMonth();
  hint.hidden=false;
  hint.innerHTML=card
    ? `<i class="fa-solid fa-receipt" aria-hidden="true"></i><span>Entra na fatura de <strong>${monthLabel(alvo)}</strong> — ${escapeHtml(card.name)} fecha dia ${card.closing_day}.</span>`
    : `<i class="fa-regular fa-calendar-check" aria-hidden="true"></i><span>Vai contar no orçamento de <strong>${monthLabel(alvo)}</strong>.</span>`;
}
function syncInstSummary(){
  syncMaisResumo();
  const box=document.getElementById('f-inst-sum'); if(!box) return;
  const no=instGet('no'), total=instGet('total'), restantes=total-no+1;
  const bruto=parseNum(document.getElementById('f-value')?.value||'');
  const temValor=!isNaN(bruto)&&bruto>0;
  const cada=temValor?(instValueMode()==='compra'?Math.round((bruto/total)*100)/100:bruto):null;
  const compra=temValor?(instValueMode()==='compra'?bruto:Math.round(cada*total*100)/100):null;
  const editando=!!document.getElementById('f-thismonth-row')?.dataset.edit;
  const linha=editando
    ? (total===1?'Compra à vista no cartão.':`Parcela <strong>${no}</strong> de <strong>${total}</strong> desta compra.`)
    : total===1
      ? 'Compra à vista — uma cobrança só.'
      : restantes===1
        ? `Parcela <strong>${no}</strong> de <strong>${total}</strong> — é a última, o app lança só ela.`
        : `Parcela <strong>${no}</strong> de <strong>${total}</strong> — o app lança ${restantes} cobranças, uma por mês.`;
  const dinheiro=temValor?(editando||restantes===1?`<strong>${brl(cada)}</strong>${total>1?' por parcela':''}`:`${restantes}× de <strong>${brl(cada)}</strong>`)+(total>1?` · compra de ${brl(compra)}`:''):'';
  box.innerHTML=`<div class="inst-sum-txt">${linha}</div>${dinheiro?`<div class="inst-sum-money">${dinheiro}</div>`:''}`;
}
function instVModeSeg(btn){
  [...btn.parentElement.children].forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  updateValueFieldLabel(); syncInstSummary();
}
function instValueMode(){ const el=document.querySelector('#f-installment-vmode .dm-seg-btn.active'); return el?el.dataset.v:'compra'; }
function updateValueFieldLabel(){
  const label=document.getElementById('f-value-label'); if(!label) return;
  if(repeatSegVal()!=='installment'){ label.textContent='Valor (R$)'; return; }
  label.textContent=instValueMode()==='parcela'?'Valor de cada parcela (R$)':'Valor total da compra (R$)';
}

function openEditExpense(expId){
  const e=expenses.find(x=>x.id===expId); if(!e) return;
  openModal(expenseFormHtml(e));
  posAbrirForm(e);
}

async function saveExpense(expId){
  const catId=document.getElementById('f-catId').value;
  const name=document.getElementById('f-name').value.trim();
  let value=parseNum(document.getElementById('f-value').value);
  const date=document.getElementById('f-date').value;
  const repeatMode=repeatSegVal();
  const recurring=repeatMode==='recurring';
  if(!name||isNaN(value)||value<=0||!date){ showToast('Preencha todos os campos.','error'); return; }
  if(!expId&&!isPro()&&expenses.filter(e=>!e.previsto&&e.date===date).length>=CONFIG.FREE_DAILY_LAUNCHES){ openPaywall('Limite diário de lançamentos atingido'); return; }
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
  const card_id=repeatMode==='installment'?(document.getElementById('f-card')?.value||null):null;
  let targetMonthKey=viewMonthKey, targetDate=date, skippedToNextMonth=false;
  if(repeatMode==='installment'&&!expId){
    targetMonthKey=invoiceTargetMonth();
    if(targetMonthKey!==monthKeyOf(new Date(date+'T12:00'))) targetDate=`${targetMonthKey}-01`;
    skippedToNextMonth=targetMonthKey!==viewMonthKey;
  }
  const btn=document.getElementById('btn-save-exp'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    let image_url=null, trocouFoto=false;
    const newFile=document.getElementById('f-receipt')?.files?.[0];
    if(newFile){ btn.textContent='Enviando foto...'; try{ image_url=await getReceiptUrl(); trocouFoto=true; }catch(upErr){ showToast(`Foto não enviada: ${upErr.message}`,'error'); } btn.textContent='Salvando...'; }
    const subcat=document.getElementById('f-subcat')?.value||null;
    const latRaw=document.getElementById('f-lat')?.value, lngRaw=document.getElementById('f-lng')?.value;
    const lat=latRaw?parseFloat(latRaw):null, lng=lngRaw?parseFloat(lngRaw):null;
    const place=document.getElementById('f-place')?.value||null;
    const payload={cat_id:catId,name,value,date:targetDate,recurring,installment_total,installment_no,installment_group,card_id,subcat,lat,lng,place};
    if(!expId||trocouFoto) payload.image_url=image_url;
    if(expId) await api.updateExpense(expId,payload);
    else{
      let ultimoMk=targetMonthKey;
      if(repeatMode==='installment'&&installment_total>installment_no){
        for(let n=installment_no+1;n<=installment_total;n++) ultimoMk=nextMonthKey(ultimoMk);
      }
      await ensureMonthsExist(targetMonthKey,ultimoMk);
      await api.insertExpense({id:uid(),month_key:targetMonthKey,...payload});
      if(repeatMode==='installment'&&installment_total>installment_no){
        btn.textContent='Criando parcelas...';
        let mk=targetMonthKey;
        for(let n=installment_no+1;n<=installment_total;n++){
          mk=nextMonthKey(mk);
          await api.insertExpense({id:uid(),month_key:mk,...payload,date:`${mk}-01`,installment_no:n});
        }
      }
    }
    logActivity(catId,expId?'edit':'create',name,value);
    sujarTodos();
    if(name && !expenseNames.includes(name)) expenseNames.unshift(name);
    if(name&&!expId) histMini.unshift({n:name,c:catId,v:Math.round(value*100)/100});
    expenses=await api.getExpenses(viewMonthKey);
    await refreshFutureMonths();
    refreshMonthIndex();
    saveCache();
    vib(15);
    _closeModal(); render(); showToast(skippedToNextMonth?`Salvo! ${installment_total>1?'A 1ª parcela cai':'A cobrança cai'} em ${monthLabel(targetMonthKey)}.`:'Salvo!','success');
  }catch(err){
    const msg=String(err?.message||'');
    if(/image_url/i.test(msg)){
      showToast('Falta a coluna no banco: ALTER TABLE expenses ADD COLUMN image_url text','error');
    }else if(/recurring/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN recurring boolean DEFAULT false','error');
    }else if(/installment/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN installment_no integer, ADD COLUMN installment_total integer, ADD COLUMN installment_group text','error');
    }else if(/subcat/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN subcat text','error');
    }else if(/\blat\b|\blng\b|\bplace\b/i.test(msg)){
      showToast('Rode o SQL: ALTER TABLE expenses ADD COLUMN lat numeric, ADD COLUMN lng numeric, ADD COLUMN place text','error');
    }else if(/not present in table|foreign key|violates/i.test(msg)){
      showToast('Não consegui abrir o mês de destino. Tente de novo.','error');
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
    if(lbl) lbl.innerHTML=`<i class="fa-solid fa-check" style="color:var(--pos-text)"></i> ${escapeHtml(file.name)}`;
    syncMaisResumo();
  };
  reader.readAsDataURL(file);
}
function receiptPickerHtml(existingUrl=''){
  existingUrl=imgSegura(existingUrl)||'';
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
async function viewReceipt(id,isSplit){
  const list=isSplit?(window._splitExpCache||[]):expenses;
  const item=list.find(x=>String(x.id)===String(id));
  if(!item) return;
  if(!item.image_url&&item._img&&!isSplit){
    try{ item.image_url=await api.getExpenseImage(id); }catch{}
    if(!item.image_url){ showToast('Sem conexão para abrir o comprovante.','error'); return; }
  }
  if(!item.image_url) return;
  if(!imgSegura(item.image_url)){ showToast('Esse comprovante não é uma imagem válida.','error'); return; }
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
  if(!await confirmar('A imagem é apagada. O gasto continua.',{titulo:'Excluir comprovante?',botao:'Excluir imagem',perigo:true,icone:'fa-image'})) return;
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
    const seguintes=Math.max(0,target.installment_total-target.installment_no);
    const r=await perguntar({
      titulo:`Excluir "${target.name}"?`,
      texto:`É a parcela ${target.installment_no} de ${target.installment_total}.${seguintes?` Ainda há ${seguintes} ${seguintes===1?'parcela lançada':'parcelas lançadas'} depois dela.`:''}`,
      opcoes:[
        ...(seguintes?[{label:seguintes===1?'Esta e a seguinte':`Esta e as ${seguintes} seguintes`,valor:'todas',tipo:'danger',icone:'fa-layer-group'}]:[]),
        {label:'Só esta parcela',valor:'uma',tipo:seguintes?'ghost-danger':'danger',icone:seguintes?'':'fa-trash'},
        {label:'Cancelar',valor:null,tipo:'ghost'}
      ]});
    if(!r) return;
    alsoFuture=r==='todas';
  }else if(!await confirmar(`${target?target.name:'Gasto'} · ${brl(target?.value||0)}`,{titulo:'Excluir este gasto?',botao:'Excluir',perigo:true})) return;
  try{
    const res=await api.deleteExpense(expId);
    if(!res||!res.length){ showToast('Você não tem permissão para excluir este gasto.','error'); return; }
    if(target) logActivity(target.cat_id,'delete',target.name,target.value);
    let removed=1;
    if(alsoFuture){
      try{ const r=await api.deleteInstallmentsAfter(target.installment_group,target.installment_no); removed+=(r?.length||0); }catch{}
      await refreshFutureMonths();
    }
    expenses=expenses.filter(e=>e.id!==expId); sujarTodos(); saveCache(); _closeModal(); render(); refreshMonthIndex();
    showToast(removed>1?`${removed} parcelas removidas.`:'Gasto excluído.','success');
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

function budgetFieldsHtml(cat){
  const livre=semTeto(cat);
  return `<div class="form-group" id="f-budget-group" ${livre?'hidden':''}><label class="form-label">Orçamento mensal (R$)</label>
      <input class="form-input" id="f-cbudget" type="text" inputmode="decimal" placeholder="0,00" value="${cat&&!livre?cat.budget:''}" oninput="moneyKey(this)"/></div>
    <div class="tm-row" style="margin-top:0;margin-bottom:16px">
      <input type="checkbox" id="f-no-limit" ${livre?'checked':''} onchange="onNoLimitToggle()"/>
      <label for="f-no-limit">Sem teto<span>Categoria só para acompanhar o gasto, sem orçamento e sem alerta de estouro. Não entra no total orçado.</span></label>
    </div>`;
}
function onNoLimitToggle(){
  const livre=!!document.getElementById('f-no-limit')?.checked;
  const grp=document.getElementById('f-budget-group'); if(grp) grp.hidden=livre;
  const roll=document.getElementById('f-roll-group'); if(roll) roll.hidden=livre;
  if(livre){
    const p=document.getElementById('f-roll-pos'); if(p) p.checked=false;
    const n=document.getElementById('f-roll-neg'); if(n) n.checked=false;
  }
}
function rolloverFieldsHtml(cat){
  const pos=cat?.rollover_positive, neg=cat?.rollover_negative;
  return `<div class="form-group" id="f-roll-group" ${semTeto(cat)?'hidden':''}><label class="form-label">Saldo do mês anterior</label>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;margin-bottom:6px">
      <input type="checkbox" id="f-roll-pos" ${pos?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-roll-pos" style="font-size:13px;cursor:pointer;flex:1">Levar a sobra <span style="color:var(--text2);font-size:12px">(o que não gastou vira limite extra no mês seguinte)</span></label>
    </div>
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px">
      <input type="checkbox" id="f-roll-neg" ${neg?'checked':''} style="width:18px;height:18px;accent-color:var(--accent);flex-shrink:0"/>
      <label for="f-roll-neg" style="font-size:13px;cursor:pointer;flex:1">Levar o estouro <span style="color:var(--text2);font-size:12px">(o que passou do limite é descontado do mês seguinte)</span></label>
    </div>
    <span class="field-hint">${cat&&cat.rollover_from&&(cat.rollover_positive||cat.rollover_negative)
      ?`Vale a partir de <strong>${monthLabel(cat.rollover_from)}</strong>.`
      :`Passa a valer a partir de <strong>${monthLabel(nextMonthKey(currentMonthKey))}</strong> &mdash; o mês atual não é mexido.`}
      Deixe os dois desmarcados para decidir mês a mês, na mão.</span></div>`;
}
function subcatEditorHtml(cat){
  const list=Array.isArray(cat&&cat.subcats)?cat.subcats.filter(Boolean):[];
  return `<div class="form-group">
    <label class="form-label">Tipos dentro da categoria <span class="lbl-opt">opcional</span></label>
    <input type="hidden" id="f-subcats" value="${escapeHtml(JSON.stringify(list))}"/>
    <div class="sub-chips" id="f-subcats-chips"></div>
    <div class="sub-add">
      <input class="form-input" id="f-subcat-new" maxlength="24" placeholder="Ex: Delivery" autocomplete="off" onkeydown="if(event.key==='Enter'){event.preventDefault();addSubcat()}"/>
      <button type="button" class="sub-add-btn" onclick="addSubcat()" aria-label="Adicionar tipo"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
    </div>
    <span class="field-hint">Separa o que está dentro da mesma categoria — em Comida, por exemplo: Preparos, Delivery, Restaurante. Some do lançamento se você não cadastrar nenhum.</span>
  </div>`;
}
function subcatsDraft(){ try{ return JSON.parse(document.getElementById('f-subcats')?.value||'[]'); }catch{ return []; } }
function renderSubcatsDraft(){
  const list=subcatsDraft();
  const box=document.getElementById('f-subcats-chips'); if(!box) return;
  box.innerHTML=list.length
    ? list.map((sc,i)=>`<span class="sub-chip on">${escapeHtml(sc)}<i class="fa-solid fa-xmark sub-x" onclick="removeSubcat(${i})" aria-label="Remover"></i></span>`).join('')
    : '<span class="sub-empty">Nenhum tipo cadastrado.</span>';
}
function addSubcat(){
  const inp=document.getElementById('f-subcat-new'); if(!inp) return;
  const nome=(inp.value||'').trim();
  if(!nome) return;
  const list=subcatsDraft();
  if(list.some(x=>x.toLowerCase()===nome.toLowerCase())){ showToast('Esse tipo já existe.','error'); return; }
  if(list.length>=12){ showToast('No máximo 12 tipos por categoria.','error'); return; }
  list.push(nome);
  document.getElementById('f-subcats').value=JSON.stringify(list);
  inp.value=''; vib(6); renderSubcatsDraft(); inp.focus();
}
function removeSubcat(i){
  const list=subcatsDraft();
  list.splice(i,1);
  document.getElementById('f-subcats').value=JSON.stringify(list);
  vib(5); renderSubcatsDraft();
}

function iconPickerHtml(cat){
  const atual=catIcon(cat);
  const manual=!!(cat&&cat.icon);
  return `<div class="form-group">
    <label class="form-label">Ícone</label>
    <input type="hidden" id="f-cicon" value="${atual}" data-manual="${manual?'1':''}"/>
    <div class="icon-grid tone-${catTone(cat||{name:'nova'})}" id="f-cicon-grid">${CAT_ICONES.map(ic=>`<button type="button" class="icon-opt${ic===atual?' on':''}" data-ic="${ic}" onclick="pickIcone(this.dataset.ic)" aria-label="${ic.replace('fa-','')}"><i class="fa-solid ${ic}" aria-hidden="true"></i></button>`).join('')}</div>
  </div>`;
}
function marcarIcone(ic){
  document.querySelectorAll('#f-cicon-grid .icon-opt').forEach(b=>b.classList.toggle('on',b.dataset.ic===ic));
  const h=document.getElementById('f-cicon'); if(h) h.value=ic;
}
function pickIcone(ic){ vib(5); const h=document.getElementById('f-cicon'); if(h) h.dataset.manual='1'; marcarIcone(ic); }
function sugerirIcone(){
  const h=document.getElementById('f-cicon'); if(!h||h.dataset.manual) return;
  marcarIcone(iconePalpite(document.getElementById('f-cname')?.value));
}

function openAddCategory(){
  if(!isPro()&&categories.length>=CONFIG.FREE_MAX_CATEGORIES){ openPaywall('Crie categorias ilimitadas'); return; }
  openModal(`<div class="modal-title">Nova categoria</div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-cname" placeholder="Ex: Academia" autocomplete="off" oninput="sugerirIcone()"/></div>
    ${iconPickerHtml(null)}
    ${budgetFieldsHtml(null)}
    ${subcatEditorHtml(null)}
    ${rolloverFieldsHtml(null)}
    <button class="btn-primary" id="btn-save-cat" onclick="saveCategory(null)">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
  renderSubcatsDraft();
}

function openEditCategory(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  openModal(`<div class="modal-title">Editar categoria</div>
    <div class="form-group"><label class="form-label">Nome</label>
      <input class="form-input" id="f-cname" value="${escapeHtml(cat.name)}" autocomplete="off" oninput="sugerirIcone()"/></div>
    ${iconPickerHtml(cat)}
    ${budgetFieldsHtml(cat)}
    ${subcatEditorHtml(cat)}
    ${rolloverFieldsHtml(cat)}
    <button class="btn-primary" id="btn-save-cat" onclick="saveCategory('${catId}')">Salvar</button>
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
  renderSubcatsDraft();
}

async function saveCategory(catId){
  const name=document.getElementById('f-cname').value.trim();
  const no_limit=!!document.getElementById('f-no-limit')?.checked;
  const budget=no_limit?0:parseNum(document.getElementById('f-cbudget').value);
  const rollover_positive=!no_limit&&!!document.getElementById('f-roll-pos')?.checked;
  const rollover_negative=!no_limit&&!!document.getElementById('f-roll-neg')?.checked;
  if(!name){ showToast('Informe o nome da categoria.','error'); return; }
  if(!no_limit&&(isNaN(budget)||budget<=0)){ showToast('Informe o orçamento ou marque "Sem teto".','error'); return; }
  const catAtual=catId?categories.find(c=>c.id===catId):null;
  const eraAtivo=!!(catAtual&&(catAtual.rollover_positive||catAtual.rollover_negative));
  const ficaAtivo=rollover_positive||rollover_negative;
  if(catId&&eraAtivo&&!ficaAtivo){
    let jaLevados=[];
    try{ jaLevados=await api.getRolloversOfCat(catId)||[]; }catch{}
    if(jaLevados.length){ perguntarDesligarRollover(catId,name,budget,jaLevados.length); return; }
  }
  let rollover_from=catAtual?.rollover_from||null;
  if(!eraAtivo&&ficaAtivo) rollover_from=nextMonthKey(currentMonthKey);
  if(!ficaAtivo) rollover_from=null;
  if(!catId&&!isPro()&&categories.length>=CONFIG.FREE_MAX_CATEGORIES){ openPaywall('Limite de categorias atingido'); return; }
  const btn=document.getElementById('btn-save-cat'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    const subcats=subcatsDraft();
    const dados={name,budget,no_limit,rollover_positive,rollover_negative,rollover_from,subcats};
    const campoIcone=document.getElementById('f-cicon');
    const icone=campoIcone?.value||'';
    if(icone&&(campoIcone.dataset.manual||catAtual?.icon)) dados.icon=icone;
    const nid=catId||uid();
    const gravar=d=>catId?api.updateCategory(catId,d):api.insertCategory({id:nid,position:categories.length,...d});
    let semColunaIcone=false;
    try{ await gravar(dados); }
    catch(e1){
      if(dados.icon&&/icon/i.test(String(e1?.message||''))){ delete dados.icon; await gravar(dados); semColunaIcone=true; }
      else throw e1;
    }
    logActivity(nid,catId?'cat_edit':'cat_create',name,budget);
    categories=await api.getCategories();
    saveCache();
    vib(15);
    _closeModal(); render();
    showToast(semColunaIcone?'Salva — para guardar o ícone, rode: ALTER TABLE categories ADD COLUMN icon text':'Categoria salva!',semColunaIcone?'':'success');
  }catch(err){
    const msg=String(err?.message||'');
    showToast(/subcats/i.test(msg)?'Rode o SQL: ALTER TABLE categories ADD COLUMN subcats jsonb DEFAULT \'[]\'::jsonb':'Erro ao salvar.','error');
    btn.disabled=false; btn.textContent='Salvar';
  }
}

function perguntarDesligarRollover(catId,name,budget,qtd){
  openModal(`<div class="modal-title">Parar de levar o saldo</div>
    <p class="modal-note">Esta categoria já levou saldo em <strong>${qtd} ${qtd===1?'mês':'meses'}</strong>. O que fazer com o que já foi levado?</p>
    <button class="btn-primary" onclick="desligarRollover('${catId}',${JSON.stringify(name).replace(/"/g,'&quot;')},${budget},false)">
      Manter o histórico
    </button>
    <p class="modal-note" style="margin:8px 0 16px;font-size:12px">Os saldos já levados continuam valendo nos meses em que entraram. Daqui pra frente, nada novo é levado.</p>
    <button class="btn-secondary" onclick="desligarRollover('${catId}',${JSON.stringify(name).replace(/"/g,'&quot;')},${budget},true)">
      Apagar tudo que já foi levado
    </button>
    <p class="modal-note" style="margin:8px 0 16px;font-size:12px">Remove os ${qtd} saldos desta categoria. Os orçamentos daqueles meses voltam ao valor original.</p>
    <button class="btn-secondary" onclick="openEditCategory('${catId}')">Cancelar</button>`);
}
async function desligarRollover(catId,name,budget,apagar){
  try{
    if(apagar){
      await api.deleteRolloversOfCat(catId);
      rollovers=rollovers.filter(r=>r.cat_id!==catId);
    }
    await api.updateCategory(catId,{name,budget,rollover_positive:false,rollover_negative:false,rollover_from:null});
    logActivity(catId,'cat_edit',name,budget);
    categories=await api.getCategories();
    saveCache(); vib(15); _closeModal(); render();
    showToast(apagar?'Saldos apagados e acúmulo desligado.':'Acúmulo desligado. Histórico mantido.','success');
  }catch{ showToast('Erro ao salvar.','error'); }
}
async function confirmDeleteCategory(catId){
  const cat=categories.find(c=>c.id===catId);
  if(!cat) return;
  if(cat.user_id!==currentUser.id){
    if(!await confirmar('Você deixa de ver esta categoria compartilhada. Nada é apagado para quem é dono.',{titulo:`Sair de ${cat.name}?`,botao:'Sair da categoria',perigo:true,icone:'fa-link-slash'})) return;
    try{
      const share=acceptedShares.find(s=>s.category_id===catId);
      if(share) await api.deleteCategoryShare(share.id);
      acceptedShares=acceptedShares.filter(s=>s.category_id!==catId);
      categories=await api.getCategories();
      saveCache(); render(); showToast('Acesso removido.','success');
    }catch{ showToast('Erro ao remover acesso.','error'); }
    return;
  }
  let daCat=[];
  try{ daCat=await api.getExpensesOfCat(catId)||[]; }catch{}
  const qtd=daCat.length;
  const soma=daCat.reduce((s,e)=>s+parseFloat(e.value||0),0);
  const deOutros=daCat.filter(e=>e.user_id&&e.user_id!==currentUser.id).length;
  const aviso=qtd
    ? `${qtd} ${qtd===1?'lançamento':'lançamentos'} · ${brl(soma)}\n\nVai junto: parcelas futuras, adiantamentos, transferências e o histórico da categoria. Não dá para desfazer.`
    : 'A categoria está vazia.';
  if(!await confirmar(aviso,{titulo:`Excluir ${cat.name}?`,botao:qtd?'Excluir tudo':'Excluir',perigo:true})) return;
  showToast(qtd?'Apagando a categoria e os lançamentos…':'Apagando…');
  try{
    await api.deleteExpensesOfCat(catId);
    await Promise.all([
      api.deleteRolloversOfCat(catId).catch(()=>{}),
      api.deleteTransfersOfCat(catId).catch(()=>{}),
      api.deleteLoansOfCat(catId).catch(()=>{}),
      api.deleteReliefsOfCat(catId).catch(()=>{}),
      api.deleteSharesOfCat(catId).catch(()=>{}),
      api.deleteActivityOfCat(catId).catch(()=>{}),
    ]);
    await api.deleteCategory(catId);
    logActivity(catId,'cat_delete',cat.name,cat.budget);
    categories=categories.filter(c=>c.id!==catId);
    expenses=expenses.filter(e=>e.cat_id!==catId);
    loans=loans.filter(l=>l.cat_id!==catId);
    reliefs=reliefs.filter(r=>r.cat_id!==catId);
    rollovers=rollovers.filter(r=>r.cat_id!==catId);
    budgetTransfers=budgetTransfers.filter(t=>t.from_cat_id!==catId&&t.to_cat_id!==catId);
    if(currentCatIdx>=categories.length) currentCatIdx=Math.max(0,categories.length-1);
    saveCache(); render();
    refreshFutureMonths(); refreshMonthIndex();
    showToast(qtd?`Categoria e ${qtd} ${qtd===1?'lançamento':'lançamentos'} removidos.`:'Removida.','success');
  }catch(err){
    const msg=String(err?.message||'');
    if(/foreign key|violates|still referenced/i.test(msg)){
      showToast(deOutros
        ? `${deOutros===1?'Sobrou 1 lançamento':`Sobraram ${deOutros} lançamentos`} de outra pessoa. Só quem lançou pode apagar.`
        : 'Sobrou algo apontando para esta categoria. Recarregue e tente de novo.','error');
    }else{
      showToast(`Erro ao deletar: ${msg.slice(0,90)}`,'error');
    }
  }
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
    const rows=await api.getExpensesFrom(currentMonthKey)||[];
    futureExpenses=rows.filter(e=>e.month_key>currentMonthKey);
    recurringBase=rows.filter(e=>e.month_key===currentMonthKey&&e.recurring);
    const by={};
    futureExpenses.forEach(e=>{ const k=e.month_key; (by[k]=by[k]||{key:k,total:0,count:0}); by[k].total+=parseFloat(e.value||0); by[k].count++; });
    futureMonthKeys=Object.values(by).sort((a,b)=>a.key.localeCompare(b.key));
  }catch{ futureExpenses=[]; recurringBase=[]; futureMonthKeys=[]; }
  syncProjected();
}

async function refreshMonthIndex(){
  try{
    const rows=await api.getMonthTotals()||[];
    const idx={};
    rows.forEach(r=>{ const k=r.month_key; if(!k) return; (idx[k]=idx[k]||{key:k,total:0,count:0}); idx[k].total+=parseFloat(r.value||0); idx[k].count++; });
    monthIndex=idx;
  }catch{}
}
function monthHasEntries(key){ return !!(monthIndex[key]&&monthIndex[key].count>0); }
function navMonths(){
  const set=new Set(Object.keys(monthIndex).filter(monthHasEntries));
  if(currentMonthKey) set.add(currentMonthKey);
  if(viewMonthKey) set.add(viewMonthKey);
  return [...set].sort();
}
function neighborMonth(key,dir){
  const list=navMonths();
  const i=list.indexOf(key);
  if(i<0) return null;
  const j=i+dir;
  return j>=0&&j<list.length?list[j]:null;
}
function monthExtra(key){
  const m=monthIndex[key];
  if(!m||!m.count) return 'sem lançamento';
  return `${brl(m.total)} · ${m.count} ${m.count===1?'lançamento':'lançamentos'}`;
}
function stepRowHtml(key,dir){
  const rotulo=dir>0?'Próximo':'Anterior';
  if(!key) return `<div class="ms-row off"><span class="ms-when">${rotulo}<em>fim da linha</em></span></div>`;
  return `<button class="ms-row" onclick="stepMonth(${dir})">
    <span class="ms-when">${monthLabel(key)}<em>${rotulo} · ${monthExtra(key)}</em></span>
  </button>`;
}
function monthStepperHtml(){
  const proximo=neighborMonth(viewMonthKey,1);
  const anterior=neighborMonth(viewMonthKey,-1);
  const agora=viewMonthKey===currentMonthKey;
  return `<button class="ms-arrow" onclick="stepMonth(1)"${proximo?'':' disabled'} aria-label="Mês seguinte"><i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>
    ${stepRowHtml(proximo,1)}
    <div class="ms-row on">
      <span class="ms-when">${monthLabel(viewMonthKey)}<em>${agora?'Este mês':'Vendo agora'} · ${monthExtra(viewMonthKey)}</em></span>
      <i class="fa-solid fa-eye ms-eye" aria-hidden="true"></i>
    </div>
    ${stepRowHtml(anterior,-1)}
    <button class="ms-arrow" onclick="stepMonth(-1)"${anterior?'':' disabled'} aria-label="Mês anterior"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>`;
}
async function stepMonth(dir){
  const alvo=neighborMonth(viewMonthKey,dir);
  if(!alvo) return;
  vib(6);
  const host=document.getElementById('ms-host');
  if(host) host.classList.add('busy');
  await goToMonth(alvo);
  const h=document.getElementById('ms-host');
  if(h){ h.classList.remove('busy'); h.innerHTML=monthStepperHtml(); }
}
function monthGridHtml(){
  const nav=new Set(navMonths());
  const chaves=[...new Set([...Object.keys(monthIndex),...months.map(m=>m.key),currentMonthKey,viewMonthKey].filter(Boolean))].sort();
  if(!chaves.length) return '';
  const anos=[...new Set(chaves.map(k=>k.split('-')[0]))].sort();
  const primeiro=chaves[0], ultimo=chaves[chaves.length-1];
  return anos.map(ano=>{
    const de=ano===primeiro.split('-')[0]?+primeiro.split('-')[1]:1;
    const ate=ano===ultimo.split('-')[0]?+ultimo.split('-')[1]:12;
    const chips=[];
    for(let mes=de;mes<=ate;mes++){
      const key=`${ano}-${String(mes).padStart(2,'0')}`;
      const nome=monthLabel(key).split(' ')[0];
      const pode=nav.has(key);
      const cls=[key===viewMonthKey?'on':'',key===currentMonthKey?'now':'',pode?'has':'off'].filter(Boolean).join(' ');
      chips.push(pode
        ? `<button class="mg-chip ${cls}" onclick="selectMonth('${key}')">${nome}</button>`
        : `<span class="mg-chip ${cls}">${nome}</span>`);
    }
    return `<div class="mg-year">${ano}</div><div class="mg-grid">${chips.join('')}</div>`;
  }).join('');
}
function openMonthGrid(){
  vib(5);
  const grid=monthGridHtml();
  document.getElementById('modal-content').innerHTML=`<div class="modal-title">Escolher mês</div>
    <p class="modal-note">Só dá para abrir os meses que têm lançamento. O mês atual está sempre disponível.</p>
    ${grid||'<div class="fut-empty">Nenhum mês para escolher ainda.</div>'}
    <div class="mg-legend"><span><i class="mg-dot has" aria-hidden="true"></i> tem lançamento</span><span><i class="mg-dot off" aria-hidden="true"></i> vazio</span></div>
    <button class="btn-secondary" style="margin-top:16px" onclick="openMonthPicker()">Voltar</button>`;
  const alvo=document.querySelector('.mg-chip.on');
  if(alvo) alvo.scrollIntoView({block:'center'});
}

const FUTURE_HORIZON=12;
function projectedFor(monthKey){
  if(!monthKey||!currentMonthKey||monthKey<=currentMonthKey) return [];
  const reais=futureExpenses.filter(e=>e.month_key===monthKey);
  return recurringBase
    .filter(r=>!reais.some(e=>e.cat_id===r.cat_id&&e.name===r.name))
    .map(r=>({...r,id:`prev-${r.id}-${monthKey}`,month_key:monthKey,date:`${monthKey}-01`,previsto:true}));
}
function syncProjected(){ projectedExpenses=projectedFor(viewMonthKey); }
function futureMonthData(monthKey){
  const itens=[...futureExpenses.filter(e=>e.month_key===monthKey),...projectedFor(monthKey)];
  const livres=new Set(categories.filter(semTeto).map(c=>c.id));
  const comprometido=itens.filter(e=>!livres.has(e.cat_id)).reduce((s,e)=>s+parseFloat(e.value||0),0);
  const semOrcamento=itens.filter(e=>livres.has(e.cat_id)).reduce((s,e)=>s+parseFloat(e.value||0),0);
  const orcamento=categories.reduce((s,c)=>s+baseBudget(c,monthKey)+(semTeto(c)?0:loanAmount(c.id,monthKey)+reliefAmount(c.id,monthKey)),0);
  return {key:monthKey,itens,comprometido,semOrcamento,orcamento,resta:Math.round((orcamento-comprometido)*100)/100};
}
function futurePlan(n=FUTURE_HORIZON){
  const out=[]; let k=nextMonthKey(currentMonthKey);
  for(let i=0;i<n;i++){ out.push(futureMonthData(k)); k=nextMonthKey(k); }
  return out;
}

function futureItemTag(e){
  if(e.installment_total>1) return `parcela ${e.installment_no}/${e.installment_total}`;
  if(e.previsto) return 'recorrente · previsto';
  if(e.recurring) return 'recorrente';
  return 'lançado';
}
function futureBodyHtml(m){
  if(!m.itens.length) return `<div class="fut-empty">Nada comprometido neste mês.</div>`;
  const grupos=categories.map(c=>({cat:c,itens:m.itens.filter(e=>e.cat_id===c.id)})).filter(g=>g.itens.length);
  const orfaos=m.itens.filter(e=>!categories.some(c=>c.id===e.cat_id));
  if(orfaos.length) grupos.push({cat:null,itens:orfaos});
  return grupos.map(g=>{
    const total=g.itens.reduce((s,e)=>s+parseFloat(e.value||0),0);
    const teto=g.cat&&!semTeto(g.cat)?baseBudget(g.cat,m.key)+loanAmount(g.cat.id,m.key):null;
    const sobra=teto!=null?Math.round((teto-total)*100)/100:null;
    return `<div class="fut-group">
      <div class="fut-group-head">
        <span class="fut-group-name">${escapeHtml(g.cat?g.cat.name:'Sem categoria')}</span>
        <span class="fut-group-num">${brl(total)}<em>${teto!=null?` de ${brl(teto)}`:' sem teto'}</em></span>
      </div>
      ${g.itens.map(e=>`<div class="fut-line${e.previsto?' previsto':''}">
        <span class="fut-line-name">${escapeHtml(e.name)}<em>${futureItemTag(e)}</em></span>
        <span class="fut-line-val">${brl(e.value)}</span>
      </div>`).join('')}
      ${sobra!=null?`<div class="fut-line total"><span class="fut-line-name">${sobra>=0?'Sobra prevista':'Estouro previsto'}</span><span class="fut-line-val ${sobra>=0?'pos':'neg'}">${brl(Math.abs(sobra))}</span></div>`:''}
    </div>`;
  }).join('');
}
function futureRowHtml(m){
  const aberto=!!futureOpen[m.key];
  const pct=m.orcamento>0?Math.min((m.comprometido/m.orcamento)*100,100):(m.comprometido>0?100:0);
  const neg=m.resta<0;
  return `<div class="fut-item${aberto?' open':''}" id="fut-${m.key}">
    <button class="fut-head" onclick="toggleFuturo('${m.key}')">
      <span class="fut-when">${monthLabel(m.key)}<em>${m.itens.length?`${m.itens.length} ${m.itens.length===1?'compromisso':'compromissos'}`:'sem compromissos'}</em></span>
      <span class="fut-nums">
        <span class="fut-rest ${neg?'neg':'pos'}">${neg?'-':''}${brl(Math.abs(m.resta))}</span>
        <em>${neg?'acima do orçamento':`livre de ${brl(m.orcamento)}`}</em>
      </span>
      <i class="fa-solid fa-chevron-down fut-chev" aria-hidden="true"></i>
    </button>
    <div class="fut-bar"><span class="${neg?'neg':pct>75?'warn':''}" style="width:${pct}%"></span></div>
    <div class="fut-body"${aberto?'':' hidden'}>
      ${m.semOrcamento>0?`<div class="fut-note"><i class="fa-solid fa-infinity" aria-hidden="true"></i> ${brl(m.semOrcamento)} em categorias sem teto, fora da conta acima.</div>`:''}
      ${futureBodyHtml(m)}
      <button class="fut-open" onclick="selectMonth('${m.key}')"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Abrir ${monthLabel(m.key)}</button>
    </div>
  </div>`;
}
function toggleFuturo(key){
  vib(5);
  futureOpen[key]=!futureOpen[key];
  const el=document.getElementById(`fut-${key}`); if(!el) return;
  el.classList.toggle('open',!!futureOpen[key]);
  const body=el.querySelector('.fut-body'); if(body) body.hidden=!futureOpen[key];
}
function openFuturo(){
  if(!isPro()){ openPaywall('Saldo dos próximos meses'); return; }
  const plano=futurePlan();
  const comCompromisso=plano.filter(m=>m.itens.length);
  const ate=comCompromisso.length?comCompromisso[comCompromisso.length-1].key:null;
  const visiveis=ate?plano.filter(m=>m.key<=ate):plano.slice(0,3);
  const totalComp=visiveis.reduce((s,m)=>s+m.comprometido+m.semOrcamento,0);
  const apertados=visiveis.filter(m=>m.resta<0);
  openModal(`<div class="modal-title">Próximos meses</div>
    <p class="modal-note">O que já está comprometido daqui para frente: parcelas do cartão, gastos recorrentes e lançamentos que você jogou para os meses seguintes, comparados com o teto das suas categorias.</p>
    <div class="fut-summary">
      <div class="fut-summary-block"><span>Comprometido</span><strong>${brl(totalComp)}</strong><em>em ${visiveis.length} ${visiveis.length===1?'mês':'meses'}</em></div>
      <div class="fut-summary-block"><span>Meses no vermelho</span><strong class="${apertados.length?'neg':'pos'}">${apertados.length}</strong><em>${apertados.length?apertados.map(m=>monthLabel(m.key).split(' ')[0]).join(', '):'nenhum'}</em></div>
    </div>
    ${!comCompromisso.length?`<div class="fut-empty" style="margin:14px 0 0">Nada lançado para frente ainda. Parcelas e gastos recorrentes aparecem aqui sozinhos.</div>`:''}
    <div class="cons-section" style="margin:20px 0 10px">Mês a mês</div>
    ${visiveis.map(futureRowHtml).join('')}
    ${ate&&ate<plano[plano.length-1].key?`<div class="fut-note" style="margin-top:12px"><i class="fa-regular fa-circle-check" aria-hidden="true"></i> Depois de ${monthLabel(ate)} não há nada comprometido.</div>`:''}
    <button class="btn-secondary" style="margin-top:18px" onclick="_closeModal()">Fechar</button>`);
}
function openMonthPicker(){
  if(!isPro()){ openPaywall('Histórico de meses anteriores'); return; }
  const html=`<div class="modal-title">Mês</div>
    <div class="ms" id="ms-host">${monthStepperHtml()}</div>
    <button class="ms-pick" onclick="openMonthGrid()"><i class="fa-solid fa-table-cells" aria-hidden="true"></i> Escolher outro mês</button>
    <button class="mp-future" onclick="openFuturo()"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i> Ver o saldo dos próximos meses</button>
    <button class="btn-secondary" style="margin-top:10px" onclick="_closeModal()">Fechar</button>`;
  if(document.getElementById('modal-overlay').classList.contains('open')) document.getElementById('modal-content').innerHTML=html;
  else openModal(html);
}

async function goToMonth(key){
  viewMonthKey=key; currentCatIdx=0;
  syncProjected();
  expenses=await api.getExpenses(viewMonthKey);
  rollovers=await api.getRollovers(viewMonthKey).catch(()=>[]);
  budgetTransfers=await api.getBudgetTransfers(viewMonthKey).catch(()=>[]);
  syncProjected();
  render();
}

async function selectMonth(key){
  _closeModal();
  if(currentTab!=='home'&&currentTab!=='categorias'&&currentTab!=='historico'){ currentTab='home'; document.querySelectorAll('.nav-item').forEach(t=>t.classList.toggle('active',t.dataset.tab==='home')); }
  await goToMonth(key);
}

function catAlvoRapido(){
  const cat=categories[currentCatIdx]||categories[0];
  if(!cat) return null;
  if(cat.user_id!==currentUser.id&&sharePerm(cat.id)!=='edit') return null;
  return cat;
}
function nomeAgora(){
  const d=new Date();
  const p=n=>String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
let quickPos=null;
async function quickLocal(forcar){
  quickPos=null;
  const hint=document.getElementById('f-quick-local');
  if(!navigator.geolocation){ if(hint) hint.remove(); return; }
  if(!forcar&&!await podePedirLocal()){
    if(hint) hint.innerHTML='<button type="button" class="quick-hint-btn" onclick="quickLocal(true)"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Adicionar onde foi</button>';
    return;
  }
  if(hint) hint.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Procurando onde você está…';
  const c=await coordsAgora();
  if(!c){ const h=document.getElementById('f-quick-local'); if(h) h.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Sem localização — o gasto salva do mesmo jeito.'; return; }
  quickPos=c;
  const h1=document.getElementById('f-quick-local');
  if(h1) h1.innerHTML='<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Descobrindo o endereço…';
  c.place=await enderecoDe(c.lat,c.lng);
  const h2=document.getElementById('f-quick-local');
  if(h2) h2.innerHTML=`<i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${c.place?escapeHtml(c.place):'Localização capturada'}`;
}
function openQuickValue(){
  const cat=catAlvoRapido();
  if(!cat){ showToast(categories.length?'Esta categoria é somente leitura.':'Crie uma categoria primeiro.','error'); return; }
  vib(8);
  openSheet(`<div class="modal-title">Lançamento rápido</div>
    <input type="hidden" id="f-quick-cat" value="${cat.id}"/>
    <div class="pick-chips" id="f-quick-chips" style="margin-bottom:12px">${catChipsHtml(cat.id,'pickCatQuick')}</div>
    <div class="quick-val-wrap">
      <span class="quick-val-cur">R$</span>
      <input class="quick-val" id="f-quick-valor" type="text" inputmode="decimal" placeholder="0,00" autocomplete="off"
             oninput="moneyKey(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();saveQuickValue()}"/>
    </div>
    <div class="quick-hint" id="f-quick-hint"><i class="fa-regular fa-clock" aria-hidden="true"></i> ${nomeAgora()} · ${monthLabel(viewMonthKey)}</div>
    <div class="quick-hint" id="f-quick-local"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Procurando onde você está…</div>
    <p class="modal-note" style="margin:0 0 14px">A hora vira a descrição. Dá para editar depois, com calma.</p>
    <button class="btn-primary" id="btn-quick" onclick="saveQuickValue()">Salvar</button>
    <button class="btn-secondary" onclick="closeSheet()">Cancelar</button>`);
  marcarChip('f-quick-chips',cat.id);
  const qv=document.getElementById('f-quick-valor'); if(qv) try{ qv.focus({preventScroll:true}); }catch{ qv.focus(); }
  quickLocal();
}
function pickCatQuick(id){
  const h=document.getElementById('f-quick-cat'); if(!h) return;
  h.value=id; vib(5); marcarChip('f-quick-chips',id);
}
async function saveQuickValue(catId){
  catId=document.getElementById('f-quick-cat')?.value||catId;
  if(!catId){ showToast('Escolha a categoria.','error'); return; }
  const valor=parseNum(document.getElementById('f-quick-valor')?.value||'');
  if(isNaN(valor)||valor<=0){ showToast('Informe um valor.','error'); return; }
  const hoje=todayLocal();
  if(!isPro()&&expenses.filter(e=>!e.previsto&&e.date===hoje).length>=CONFIG.FREE_DAILY_LAUNCHES){ closeSheet(); openPaywall('Limite diário de lançamentos atingido'); return; }
  const btn=document.getElementById('btn-quick'); btn.disabled=true; btn.textContent='Salvando...';
  const nome=nomeAgora();
  try{
    const pos=quickPos;
    await ensureMonthsExist(viewMonthKey,viewMonthKey);
    await api.insertExpense({id:uid(),cat_id:catId,month_key:viewMonthKey,name:nome,value:valor,date:hoje,recurring:false,lat:pos?pos.lat:null,lng:pos?pos.lng:null,place:pos&&pos.place?pos.place:null});
    logActivity(catId,'create',nome,valor);
    expenses=await api.getExpenses(viewMonthKey);
    refreshMonthIndex(); saveCache(); vib(15);
    closeSheet(); render();
    showToast(pos&&pos.place?`${brl(valor)} · ${pos.place}`:`${brl(valor)} lançado.`,'success');
  }catch(err){
    const msg=String(err?.message||'');
    showToast(/\blat\b|\blng\b|\bplace\b/i.test(msg)?'Rode o SQL: ALTER TABLE expenses ADD COLUMN lat numeric, ADD COLUMN lng numeric, ADD COLUMN place text':`Erro ao salvar: ${msg.slice(0,80)}`,'error');
    btn.disabled=false; btn.textContent='Salvar';
  }
}

function onFab(){
  vib();
  if(currentTab==='categorias'){ openAddCategory(); return; }
  if(!categories.length){ showToast('Crie uma categoria primeiro.','error'); return; }
  const cat=(webDetalhe&&categories.find(c=>c.id===webDetalhe))||(telaWeb()?catsLancaveis()[0]:null)||categories[currentCatIdx]||categories[0];
  if(!cat){ showToast('Crie uma categoria primeiro.','error'); return; }
  if(cat.user_id!==currentUser.id&&sharePerm(cat.id)!=='edit'){ showToast('Esta categoria é somente leitura.','error'); return; }
  openAddExpense(cat.id);
}

async function switchTab(tab){
  vib(5);
  currentTab=tab; currentCatIdx=0; webDetalhe=null; webOrganizar=false;
  document.querySelectorAll('.nav-item').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab||((tab==='relatorios'||tab==='mapa')&&!telaWeb()&&t.dataset.tab==='historico')));
  if(!months.find(m=>m.key===viewMonthKey)&&viewMonthKey<currentMonthKey) viewMonthKey=currentMonthKey;
  syncProjected();
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
  const v=document.getElementById('f-value');
  if(v&&!v.value){
    const t=valorTipico(n,document.getElementById('f-catId')?.value);
    if(t!=null){ v.value=t.toFixed(2).replace('.',','); onExpenseValueInput(); }
  }
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
  if(semTeto(cat)){ showToast('Esta categoria é sem teto — não tem orçamento para ajustar.','error'); return; }
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
      <span class="field-hint">Só este mês passa a usar este valor. <strong>Zero</strong> vale: a categoria fica sem limite neste mês e qualquer gasto já conta como estouro. ${ov?'Dá para voltar ao padrão a qualquer momento.':''}</span></div>
    <button class="btn-primary" id="btn-ov" onclick="saveMonthOverride('${catId}')">Salvar só para ${monthLabel(currentMonthKey)}</button>
    ${ov?`<button class="btn-secondary" onclick="revertMonthOverride('${catId}')">Voltar ao padrão (${brl(cat.budget)}/mês)</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`);
}

async function saveMonthOverride(catId){
  const v=parseNum(document.getElementById('f-ovbudget').value);
  if(isNaN(v)||v<0){ showToast('Informe um valor válido.','error'); return; }
  const btn=document.getElementById('btn-ov'); btn.disabled=true; btn.textContent='Salvando...';
  try{
    await setMonthBudget(catId, currentMonthKey, v);
    saveCache(); vib(15);
    _closeModal(); render();
    showToast(v===0?`${monthLabel(currentMonthKey)} ficou sem orçamento nesta categoria.`:'Orçamento do mês ajustado!','success');
  }catch(e){
    btn.disabled=false; btn.textContent='Salvar ajuste do mês';
    showToast('Erro — rode o SQL: ALTER TABLE categories ADD COLUMN month_budgets jsonb','error');
  }
}

async function revertMonthOverride(catId){
  try{
    await setMonthBudget(catId, currentMonthKey, null);
    saveCache(); vib(10);
    _closeModal(); render(); showToast('Voltou ao orçamento padrão.','success');
  }catch{ showToast('Erro ao reverter.','error'); }
}

const LOAN_MAX_PARCELAS=6;
function loanParcelas(){ const el=document.getElementById('f-loan-n'); return el?Math.max(1,Math.min(LOAN_MAX_PARCELAS,parseInt(el.value,10)||1)):1; }
function stepLoan(d){
  const el=document.getElementById('f-loan-n'); if(!el) return;
  const antes=loanParcelas();
  el.value=Math.max(1,Math.min(LOAN_MAX_PARCELAS,antes+d));
  if(loanParcelas()!==antes) vib(6);
  const disp=document.getElementById('f-loan-n-val'); if(disp) disp.textContent=loanParcelas();
  syncLoanResumo();
}
function loanPlano(valor,n){
  const cada=Math.floor((valor/n)*100)/100;
  const parcelas=[];
  let k=currentMonthKey, somado=0;
  for(let i=1;i<=n;i++){
    k=nextMonthKey(k);
    const v=i===n?Math.round((valor-somado)*100)/100:cada;
    somado=Math.round((somado+v)*100)/100;
    parcelas.push({month_key:k,valor:v});
  }
  return parcelas;
}
function syncLoanResumo(){
  const box=document.getElementById('f-loan-resumo'); if(!box) return;
  const valor=parseNum(document.getElementById('f-loan-valor')?.value||'');
  const n=loanParcelas();
  if(isNaN(valor)||valor<=0){ box.innerHTML='<div class="inst-sum-txt">Informe quanto você quer adiantar.</div>'; return; }
  const plano=loanPlano(valor,n);
  const meses=plano.map(p=>monthLabel(p.month_key)).join(', ');
  box.innerHTML=`<div class="inst-sum-txt"><strong>${monthLabel(currentMonthKey)}</strong> ganha <strong>${brl(valor)}</strong> de limite agora.</div>
    <div class="inst-sum-money">${n===1?`${meses} devolve ${brl(plano[0].valor)}`:`${n}× de ${brl(plano[0].valor)} — ${meses}`}</div>`;
}
function openLoanMonth(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return;
  if(semTeto(cat)){ showToast('Categoria sem teto não tem limite para adiantar.','error'); return; }
  const ativos=loanGroupsOfCat(catId);
  const jaNesteMes=ativos.some(g=>g.mes===currentMonthKey);
  openModal(`<div class="modal-title">Adiantar limite · ${escapeHtml(cat.name)}</div>
    <p class="modal-note">Tira um pedaço do limite dos meses à frente e põe em <strong>${monthLabel(currentMonthKey)}</strong>. O orçamento padrão da categoria não muda, e dá para desfazer quando quiser.</p>
    ${jaNesteMes?`<div class="fut-note" style="margin:0 0 14px"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Já existe um adiantamento neste mês para esta categoria. Desfaça o atual antes de criar outro.</div>
    <button class="btn-secondary" onclick="openLoansList('${catId}')"><i class="fa-solid fa-list" aria-hidden="true"></i> Ver adiantamentos</button>
    <button class="btn-secondary" onclick="_closeModal()">Fechar</button>`
    :`<div class="form-group"><label class="form-label">Quanto adiantar (R$)</label>
      <input class="form-input" id="f-loan-valor" type="text" inputmode="decimal" placeholder="0,00" oninput="moneyKey(this);syncLoanResumo()"/></div>
    <div class="form-group"><label class="form-label">Devolver em quantos meses</label>
      <input type="hidden" id="f-loan-n" value="1"/>
      <div class="stepper" style="max-width:220px">
        <div class="stepper-ctl">
          <button type="button" class="stepper-btn" onclick="stepLoan(-1)" aria-label="Menos meses"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
          <span class="stepper-val" id="f-loan-n-val">1</span>
          <button type="button" class="stepper-btn" onclick="stepLoan(1)" aria-label="Mais meses"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
        </div>
      </div>
      <span class="field-hint">Em 1 mês, o mês seguinte devolve tudo. Em mais de um, a devolução é dividida.</span></div>
    <div class="inst-sum" id="f-loan-resumo"></div>
    <button class="btn-primary" id="btn-loan" onclick="saveLoanMonth('${catId}')">Adiantar</button>
    ${ativos.length?`<button class="btn-secondary" onclick="openLoansList('${catId}')"><i class="fa-solid fa-list" aria-hidden="true"></i> Ver adiantamentos (${ativos.length})</button>`:''}
    <button class="btn-secondary" onclick="_closeModal()">Cancelar</button>`}`);
  syncLoanResumo();
}
async function saveLoanMonth(catId){
  const valor=parseNum(document.getElementById('f-loan-valor').value);
  const n=loanParcelas();
  if(isNaN(valor)||valor<=0){ showToast('Informe um valor válido.','error'); return; }
  const cat=categories.find(c=>c.id===catId);
  const plano=loanPlano(valor,n);
  const menorTeto=Math.min(...plano.map(p=>baseBudget(cat,p.month_key)+loanAmount(catId,p.month_key)));
  if(plano.some(p=>p.valor>baseBudget(cat,p.month_key)+loanAmount(catId,p.month_key))){
    showToast(`A parcela não cabe: o limite de um dos meses é ${brl(menorTeto)}. Divida em mais meses.`,'error'); return;
  }
  const btn=document.getElementById('btn-loan'); btn.disabled=true; btn.textContent='Adiantando...';
  const grupo=uid();
  try{
    const rows=[{cat_id:catId,loan_group:grupo,month_key:currentMonthKey,amount:valor}]
      .concat(plano.map(p=>({cat_id:catId,loan_group:grupo,month_key:p.month_key,amount:-p.valor})));
    await api.insertLoans(rows);
    loans=await api.getLoans().catch(()=>loans);
    saveCache(); vib(15);
    _closeModal(); render();
    showToast(`${brl(valor)} adiantados para ${monthLabel(currentMonthKey)}.`,'success');
  }catch(err){
    const msg=String(err?.message||'');
    showToast(/budget_loans/i.test(msg)?'Falta criar a tabela budget_loans no Supabase.':`Erro: ${msg.slice(0,80)}`,'error');
    btn.disabled=false; btn.textContent='Adiantar';
  }
}
function openLoansList(catId){
  const cat=categories.find(c=>c.id===catId);
  const grupos=loanGroupsOfCat(catId);
  openModal(`<div class="modal-title">Adiantamentos · ${escapeHtml(cat?cat.name:'')}</div>
    ${grupos.length?grupos.map(g=>`<div class="fut-item" style="padding:13px 14px">
      <div class="fut-group-head" style="margin-bottom:6px">
        <span class="fut-group-name">${brl(g.valor)} em ${monthLabel(g.mes)}</span>
        <span class="fut-group-num">${g.parcelas}× <em>de devolução</em></span>
      </div>
      <div class="fut-line"><span class="fut-line-name">Ainda a devolver</span><span class="fut-line-val ${g.aPagar>0?'neg':'pos'}">${brl(g.aPagar)}</span></div>
      <button class="fut-open" onclick="reverterLoan('${g.group}','${catId}')"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Desfazer este adiantamento</button>
    </div>`).join('')
    :'<div class="fut-empty">Nenhum adiantamento nesta categoria.</div>'}
    <button class="btn-secondary" style="margin-top:14px" onclick="openLoanMonth('${catId}')">Voltar</button>`);
}
async function reverterLoan(grupo,catId){
  if(!await confirmar('É um conjunto: some o limite extra deste mês e também as devoluções dos meses seguintes.',{titulo:'Desfazer adiantamento?',botao:'Desfazer',perigo:true,icone:'fa-rotate-left'})) return;
  try{
    await api.deleteLoanGroup(grupo);
    loans=loans.filter(l=>l.loan_group!==grupo);
    saveCache(); vib(12);
    _closeModal(); render();
    showToast('Adiantamento desfeito.','success');
  }catch{ showToast('Erro ao desfazer.','error'); }
}

function transferAvailable(catId){
  const cat=categories.find(c=>c.id===catId); if(!cat) return 0;
  const gasto=[...expenses,...projectedExpenses].filter(e=>e.cat_id===catId).reduce((s,e)=>s+parseFloat(e.value||0),0);
  return Math.round((effBudget(cat,viewMonthKey)-gasto)*100)/100;
}
function mesEditavel(){ return !currentMonthKey||viewMonthKey>=currentMonthKey; }
function openTransferBudget(catId){
  if(!mesEditavel()){ showToast('Mês já passou — não dá para mexer no orçamento dele.','error'); return; }
  const owned=categories.filter(c=>c.user_id===currentUser.id&&!semTeto(c));
  if(owned.length<2){ showToast('Você precisa de ao menos 2 categorias com orçamento para transferir.','error'); return; }
  const fromId=catId&&owned.some(c=>c.id===catId)?catId:owned[0].id;
  openModal(transferBudgetHtml(fromId));
}
function transferBudgetHtml(fromId){
  const owned=categories.filter(c=>c.user_id===currentUser.id&&!semTeto(c));
  const toOptions=owned.filter(c=>c.id!==fromId);
  const avail=transferAvailable(fromId);
  const futuro=viewMonthKey>currentMonthKey;
  return `<div class="modal-title">Transferir limite entre categorias</div>
    <p class="modal-note">Mova uma parte do orçamento de uma categoria para outra. Vale só para <strong>${monthLabel(viewMonthKey)}</strong> — o orçamento padrão de cada categoria não muda.${futuro?' Como é um mês à frente, dá para deixar tudo arrumado antes de ele começar.':''}</p>
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
    <button class="btn-primary" id="btn-transfer" onclick="saveTransferBudget()">Transferir em ${monthLabel(viewMonthKey)}</button>
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
  const mk=viewMonthKey;
  const fromId=document.getElementById('f-transfer-from').value;
  const toId=document.getElementById('f-transfer-to').value;
  const amount=parseNum(document.getElementById('f-transfer-amount').value);
  if(!toId||fromId===toId){ showToast('Escolha duas categorias diferentes.','error'); return; }
  if(isNaN(amount)||amount<=0){ showToast('Informe um valor válido.','error'); return; }
  const avail=transferAvailable(fromId);
  if(amount>avail+0.005){ showToast(`Só há ${brl(avail)} disponível nessa categoria.`,'error'); return; }
  const fromCat=categories.find(c=>c.id===fromId), toCat=categories.find(c=>c.id===toId);
  const newFromBudget=Math.round((baseBudget(fromCat,mk)-amount)*100)/100;
  const newToBudget=Math.round((baseBudget(toCat,mk)+amount)*100)/100;
  const btn=document.getElementById('btn-transfer'); btn.disabled=true; btn.textContent='Transferindo...';
  try{
    await ensureMonthsExist(mk,mk);
    await setMonthBudget(fromId, mk, newFromBudget);
    await setMonthBudget(toId, mk, newToBudget);
    try{
      const row=await api.insertBudgetTransfer({month_key:mk,from_cat_id:fromId,to_cat_id:toId,amount});
      budgetTransfers.unshift(row?.[0]||{id:uid(),month_key:mk,from_cat_id:fromId,to_cat_id:toId,amount,created_at:new Date().toISOString()});
    }catch{}
    saveCache(); vib(15);
    _closeModal(); render();
    showToast(`${brl(amount)} de ${fromCat.name} para ${toCat.name} em ${monthLabel(mk)}.`,'success');
  }catch{
    btn.disabled=false; btn.textContent='Transferir';
    showToast('Erro — confira se a coluna "budgets" existe no Supabase.','error');
  }
}

function perguntar({titulo='',texto='',opcoes=[]}){
  return new Promise(resolve=>{
    document.getElementById('gc-ask')?.remove();
    const ov=document.createElement('div');
    ov.id='gc-ask'; ov.className='ask-overlay';
    const paras=String(texto||'').split(/\n\n+/).filter(Boolean).map(p=>`<p>${escapeHtml(p).replace(/\n/g,'<br>')}</p>`).join('');
    ov.innerHTML=`<div class="ask-panel" role="alertdialog" aria-modal="true">
      ${titulo?`<div class="ask-title">${escapeHtml(titulo)}</div>`:''}
      ${paras?`<div class="ask-text">${paras}</div>`:''}
      <div class="ask-btns">${opcoes.map((o,i)=>`<button type="button" class="ask-btn ${o.tipo||'ghost'}" data-i="${i}">${o.icone?`<i class="fa-solid ${o.icone}" aria-hidden="true"></i>`:''}<span>${escapeHtml(o.label)}</span></button>`).join('')}</div>
    </div>`;
    let feito=false;
    const fechar=v=>{
      if(feito) return; feito=true;
      document.removeEventListener('keydown',tecla);
      ov.classList.remove('open');
      setTimeout(()=>ov.remove(),200);
      resolve(v);
    };
    const tecla=e=>{ if(e.key==='Escape') fechar(null); };
    ov.addEventListener('click',e=>{
      if(e.target===ov){ fechar(null); return; }
      const b=e.target.closest('.ask-btn'); if(b) fechar(opcoes[+b.dataset.i].valor);
    });
    document.addEventListener('keydown',tecla);
    document.body.appendChild(ov);
    fitViewport();
    requestAnimationFrame(()=>ov.classList.add('open'));
    vib(6);
  });
}
async function confirmar(texto,{titulo='',botao='Confirmar',perigo=false,cancelar='Cancelar',icone=''}={}){
  const v=await perguntar({titulo,texto,opcoes:[
    {label:botao,valor:true,tipo:perigo?'danger':'primary',icone:icone||(perigo?'fa-trash':'')},
    {label:cancelar,valor:false,tipo:'ghost'}
  ]});
  return v===true;
}

function showToast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),2500);
}

function monthBalance(cat,monthKey,exps,rolls){
  const spent=exps.filter(e=>e.cat_id===cat.id).reduce((s,e)=>s+parseFloat(e.value||0),0);
  const roll=(rolls||[]).filter(r=>r.cat_id===cat.id&&r.to_month===monthKey).reduce((s,r)=>s+parseFloat(r.amount||0),0);
  return Math.round((baseBudget(cat,monthKey)+roll+reliefAmount(cat.id,monthKey)-spent)*100)/100;
}
async function applyAutoRollover(){
  const flagged=categories.filter(c=>c.user_id===currentUser.id
    &&!semTeto(c)
    &&(c.rollover_positive||c.rollover_negative)
    &&(!c.rollover_from||currentMonthKey>=c.rollover_from));
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
function cardById(id){ return allCards.find(x=>x.id===id)||cards.find(x=>x.id===id)||null; }
function cardLabel(id){ const c=cardById(id); return c?c.name:null; }
function cardDatesLabel(c){ return c?`Fecha dia ${c.closing_day}${c.due_day?` · vence dia ${c.due_day}`:''}`:''; }
function cardIsMine(c){ return !!c&&c.user_id===currentUser.id; }
function cardOwnerLabel(c){ return userTag(c&&c.user_id)||'outra pessoa'; }
async function loadCards(){
  let rows=null;
  try{ rows=await api.getVisibleCards(); }catch{}
  if(!rows){ try{ rows=await api.getCards(); }catch{ rows=[]; } }
  allCards=rows||[];
  cards=allCards.filter(cardIsMine);
}
function findExpense(id){
  return expenses.find(e=>e.id===id)||projectedExpenses.find(e=>e.id===id)||futureExpenses.find(e=>e.id===id)||null;
}
function openCardInfo(expId){
  const e=findExpense(expId); if(!e||!e.card_id) return;
  const c=cardById(e.card_id);
  if(!c){ showToast('Não consegui carregar os dados deste cartão.','error'); return; }
  vib(6);
  const meu=cardIsMine(c);
  const fatura=cardInvoiceMonth(c,e.date);
  openSheet(`<div class="modal-title">Cartão</div>
    <div class="pick-row on locked">
      <span class="pick-ico"><i class="fa-solid fa-credit-card" aria-hidden="true"></i></span>
      <span class="pick-body"><span class="pick-name">${escapeHtml(c.name)}</span><span class="pick-sub">${meu?'Seu cartão':`Cartão de ${escapeHtml(cardOwnerLabel(c))}`}</span></span>
    </div>
    <div class="cinfo">
      <div class="cinfo-row"><span>Fecha dia</span><strong>${c.closing_day}</strong></div>
      ${c.due_day?`<div class="cinfo-row"><span>Vence dia</span><strong>${c.due_day}</strong></div>`:''}
      <div class="cinfo-row"><span>Compra em</span><strong>${new Date(e.date+'T12:00').toLocaleDateString('pt-BR')}</strong></div>
      ${fatura?`<div class="cinfo-row"><span>Entra na fatura de</span><strong>${monthLabel(fatura)}</strong></div>`:''}
      ${e.installment_total>1?`<div class="cinfo-row"><span>Parcela</span><strong>${e.installment_no} de ${e.installment_total}</strong></div>`:''}
    </div>
    ${meu?'':`<div class="fut-note" style="margin-top:12px"><i class="fa-solid fa-lock" aria-hidden="true"></i> Cartão de ${escapeHtml(cardOwnerLabel(c))}. Você vê os dados, mas só quem cadastrou pode alterar.</div>`}
    <button class="btn-secondary" style="margin-top:14px" onclick="closeSheet()">Fechar</button>`);
}





async function openCards(){
  openModal(`<div class="modal-title">Meus cartões</div><div class="loading"><div class="spinner"></div></div>`);
  await loadCards();
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
    await loadCards();
    vib(12); renderCardsModal(); showToast('Cartão adicionado!','success');
  }catch{ showToast('Erro ao salvar. Confira se a tabela cards existe no Supabase.','error'); btn.disabled=false; btn.textContent='Adicionar cartão'; }
}
async function removeCard(id){
  if(!await confirmar('Os lançamentos continuam, só sem o cartão vinculado.',{titulo:'Remover cartão?',botao:'Remover',perigo:true,icone:'fa-credit-card'})) return;
  try{ await api.deleteCard(id); cards=cards.filter(c=>c.id!==id); allCards=allCards.filter(c=>c.id!==id); renderCardsModal(); showToast('Cartão removido.','success'); }
  catch{ showToast('Erro ao remover.','error'); }
}

let quickAdd=null;
function parseQuickLink(){
  const h=location.hash||'';
  if(h.indexOf('#add')!==0) return null;
  const p=new URLSearchParams(h.slice(4).replace(/^\?/,''));
  return {
    valor:(p.get('v')||p.get('valor')||'').replace(/[^\d.,-]/g,''),
    nome:(p.get('n')||p.get('nome')||'').trim().slice(0,60),
    cat:(p.get('cat')||p.get('c')||'').trim(),
    cartao:(p.get('card')||p.get('cartao')||'').trim(),
    parcelas:parseInt(p.get('p')||p.get('parcelas'),10)||0,
    data:(p.get('d')||p.get('data')||'').trim()
  };
}
function normNome(s){ return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }
function endQuickSplash(){ document.documentElement.classList.remove('gc-quick'); }
function runQuickAdd(){
  const q=quickAdd; quickAdd=null;
  endQuickSplash();
  if(!q) return;
  const minhas=categories.filter(c=>c.user_id===currentUser.id||sharePerm(c.id)==='edit');
  if(!minhas.length){ showToast('Crie uma categoria antes de usar o lançamento rápido.','error'); return; }
  const alvo=q.cat?minhas.find(c=>normNome(c.name)===normNome(q.cat)):null;
  openAddExpense((alvo||minhas[0]).id);
  if(!document.getElementById('f-value')) return;
  const titulo=document.querySelector('#modal-content .modal-title');
  if(titulo) titulo.innerHTML='Lançamento rápido <span class="quick-tag"><i class="fa-solid fa-bolt" aria-hidden="true"></i> atalho</span>';
  if(q.nome) document.getElementById('f-name').value=q.nome;
  if(q.valor){ const el=document.getElementById('f-value'); el.value=q.valor; moneyKey(el); }
  if(/^\d{4}-\d{2}-\d{2}$/.test(q.data)) document.getElementById('f-date').value=q.data;
  const cartao=q.cartao?cards.find(c=>normNome(c.name)===normNome(q.cartao)):null;
  if(cartao||q.parcelas>0){
    const wrap=document.getElementById('f-installment-wrap');
    if(cartao){ document.getElementById('f-card').value=cartao.id; if(wrap) wrap.dataset.asked='1'; }
    document.querySelector('#f-repeat-seg .dm-seg-btn[data-v="installment"]')?.click();
    if(q.parcelas>1) instSet('total',q.parcelas);
  }
  onExpenseValueInput();
  vib(12);
}
function onQuickHash(){
  const q=parseQuickLink();
  if(!q) return;
  try{ history.replaceState(null,'',location.pathname+location.search); }catch{}
  if(!session?.access_token){
    const nota=document.getElementById('quick-auth-note');
    if(nota) nota.hidden=false;
    return;
  }
  quickAdd=q;
  if(currentUser&&document.getElementById('app').style.display!=='none') runQuickAdd();
}
window.addEventListener('hashchange',onQuickHash);
function quickBaseUrl(){ return location.origin+location.pathname.replace(/index\.html$/,''); }
function openQuickGuide(){
  const base=quickBaseUrl();
  const exemplo=`${base}#add?v=45,90&n=Padaria&cat=Mercado`;
  openModal(`<div class="modal-title">Lançamento rápido</div>
    <p class="modal-note"><span class="quick-tag"><i class="fa-brands fa-apple" aria-hidden="true"></i> iOS</span> Um atalho do iPhone abre o GastoPensado já no formulário, com valor e descrição preenchidos. Você só escolhe a categoria e salva — nada é gravado sozinho.</p>
    <div class="quick-link" onclick="copyQuickLink('${base}#add')">
      <div class="quick-link-body"><span class="quick-link-lbl">Link do atalho</span><code id="quick-url">${escapeHtml(base)}#add</code></div>
      <i class="fa-regular fa-copy" aria-hidden="true"></i>
    </div>
    <div class="quick-steps">
      <div class="quick-step"><span class="quick-step-n">1</span><div>Abra o app <strong>Atalhos</strong> e toque em <strong>+</strong> para criar um atalho novo.</div></div>
      <div class="quick-step"><span class="quick-step-n">2</span><div>Adicione a ação <strong>Pedir Entrada</strong>, tipo <em>Número</em>, pergunta "Quanto foi?". Pule esta se o valor vier de outro lugar.</div></div>
      <div class="quick-step"><span class="quick-step-n">3</span><div>Adicione <strong>Codificar Texto para URL</strong> com o resultado da pergunta.</div></div>
      <div class="quick-step"><span class="quick-step-n">4</span><div>Adicione <strong>Abrir URL</strong> e monte: o link acima, depois <code>?v=</code> e o texto codificado.</div></div>
      <div class="quick-step"><span class="quick-step-n">5</span><div>Salve como "Novo gasto". Rode pelo <strong>Botão de Ação</strong>, pela <strong>Tela Bloqueada</strong>, pelo widget de Atalhos ou por <strong>Toque nas Costas</strong>.</div></div>
      <div class="quick-step"><span class="quick-step-n">6</span><div>Para disparar sozinho na compra: <strong>Automação › Transação</strong>, escolha o cartão na Carteira e marque <em>Executar imediatamente</em>.</div></div>
    </div>
    <div class="quick-params">
      <div class="quick-param"><code>v</code><span>valor — aceita vírgula (<em>45,90</em>)</span></div>
      <div class="quick-param"><code>n</code><span>descrição (<em>Padaria</em>)</span></div>
      <div class="quick-param"><code>cat</code><span>nome da categoria (<em>Mercado</em>)</span></div>
      <div class="quick-param"><code>card</code><span>nome do cartão — já entra em modo Cartão</span></div>
      <div class="quick-param"><code>p</code><span>total de parcelas</span></div>
      <div class="quick-param"><code>d</code><span>data no formato <em>2026-08-19</em></span></div>
    </div>
    <div class="quick-link" onclick="copyQuickLink('${exemplo}')">
      <div class="quick-link-body"><span class="quick-link-lbl">Exemplo completo</span><code>${escapeHtml(exemplo)}</code></div>
      <i class="fa-regular fa-copy" aria-hidden="true"></i>
    </div>
    <p class="modal-note" style="margin-top:16px"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> O atalho abre o app no navegador, então faça login uma vez por lá. Sem sessão, o formulário não abre.</p>
    <button class="btn-secondary" onclick="openAccountModal()">Voltar</button>`);
}
async function copyQuickLink(url){
  try{ await navigator.clipboard.writeText(url); vib(10); showToast('Link copiado!','success'); }
  catch{ showToast('Copie o link manualmente.','error'); }
}

const TUTORIAL_KEY = 'gc-tutorial-v2';
const tutNav=(tab)=>document.querySelector(`.nav-item[data-tab="${tab}"]`);
const tutGo=(tab)=>{ const t=tutNav(tab); if(t) t.click(); };
const TUTORIAL_STEPS = [
  {
    title: 'Bem-vindo ao GastoPensado!',
    body: 'Gasto bom é gasto pensado. Em poucos passos você conhece o app — e descobre quanto ainda cabe no seu mês.',
    target: null,
  },
  {
    title: 'Quanto cabe por dia',
    body: 'Cada categoria mostra o disponível e, logo abaixo, <strong>quanto dá para gastar por dia</strong> até o fim do mês — e se o seu ritmo atual cabe no teto. Deslize para o lado para trocar de categoria.',
    target: ()=>tutNav('home'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Lançar em segundos',
    body: 'O <strong>+</strong> abre o lançamento: digite o valor, toque na categoria e pronto. Os gastos que você repete aparecem em <strong>Seus de sempre</strong> — um toque preenche nome e valor.',
    target: ()=>document.getElementById('fab'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Ainda mais rápido',
    body: 'O <strong>raio</strong> é o lançamento de um campo só: só o valor. A hora vira a descrição e o app guarda onde você está. Arruma depois, com calma.',
    target: ()=>document.getElementById('fab-quick'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Tudo da categoria num lugar',
    body: 'No <strong>⋯</strong> do card ficam ajustar o orçamento do mês, transferir limite, adiantar do mês seguinte, compartilhar com alguém e exportar. O <strong>olho</strong> esconde os valores quando tiver gente olhando.',
    target: ()=>tutNav('home'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Categorias',
    body: 'Crie categorias com teto mensal e escolha um ícone para cada uma. Dá para cadastrar tipos dentro dela — em Comida: Preparos, Delivery, Restaurante — e marcar "sem teto" para só acompanhar.',
    target: ()=>tutNav('categorias'),
    action: ()=>tutGo('categorias'),
  },
  {
    title: 'Histórico',
    body: 'Média por dia, projeção do mês, comparação com o mês anterior e para onde o dinheiro foi. Pelo seletor de mês você ainda vê o que já está comprometido nos meses à frente.',
    target: ()=>tutNav('historico'),
    action: ()=>tutGo('historico'),
  },
  {
    title: 'Amigos e divisão',
    body: 'Adicione pessoas por @usuário e divida gastos no chat, 50/50 ou do seu jeito. Para três ou mais, use a aba Divisão: o app calcula quem deve quanto para quem.',
    target: ()=>tutNav('amigos'),
    action: ()=>tutGo('amigos'),
  },
  {
    title: 'Sua conta',
    body: 'No ícone de perfil ficam sua foto, seu @usuário, tema claro ou escuro, notificações, seus cartões e o atalho de lançamento para o iPhone.',
    target: ()=>document.getElementById('account-btn'),
    action: ()=>tutGo('home'),
  },
  {
    title: 'Tudo pronto!',
    body: 'Comece criando uma categoria e lançando um gasto. Para rever este tour, é só abrir sua conta.',
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
