import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SB_URL') ?? Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SB_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:2rafab@gmail.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const rest = async (path: string) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
};

const brl = (v: number) =>
  `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

const actorName = async (userId: string) => {
  if (!userId) return 'Alguém';
  const rows = await rest(`profiles?id=eq.${userId}&select=username,email`).catch(() => []);
  const p = rows?.[0];
  if (p?.username) return `@${p.username}`;
  if (p?.email) return String(p.email).split('@')[0];
  return 'Alguém';
};

const recipientsFor = async (catId: string, actorId: string) => {
  const cats = await rest(`categories?id=eq.${catId}&select=id,name,user_id`);
  const cat = cats?.[0];
  if (!cat) return { cat: null, ids: [] as string[] };

  const shares = await rest(
    `category_shares?category_id=eq.${catId}&status=eq.accepted&select=shared_with_user_id`,
  ).catch(() => []);

  const ids = new Set<string>();
  if (cat.user_id) ids.add(cat.user_id);
  for (const s of shares ?? []) if (s.shared_with_user_id) ids.add(s.shared_with_user_id);
  ids.delete(actorId);
  return { cat, ids: [...ids] };
};

const sendTo = async (ids: string[], payload: Record<string, unknown>) => {
  if (!ids.length) return { sent: 0, gone: 0 };
  const subs = await rest(
    `push_subscriptions?user_id=in.(${ids.join(',')})&select=id,endpoint,p256dh,auth`,
  );
  if (!subs?.length) return { sent: 0, gone: 0 };

  const body = JSON.stringify(payload);
  const stale: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 86400, urgency: 'normal' },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) stale.push(s.id);
        else console.error('push falhou', code, String(err).slice(0, 200));
      }
    }),
  );

  if (stale.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${stale.join(',')})`, {
      method: 'DELETE',
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'return=minimal' },
    }).catch(() => {});
  }

  return { sent, gone: stale.length };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  let hook: { type?: string; table?: string; record?: Record<string, unknown> };
  try {
    hook = await req.json();
  } catch {
    return new Response('json inválido', { status: 400 });
  }

  if (hook.type !== 'INSERT' || hook.table !== 'expenses') {
    return Response.json({ skipped: 'evento ignorado' });
  }

  const exp = hook.record ?? {};
  const actorId = String(exp.user_id ?? '');
  const catId = String(exp.cat_id ?? '');
  if (!catId) return Response.json({ skipped: 'sem categoria' });

  const instNo = Number(exp.installment_no ?? 0);
  if (instNo > 1) return Response.json({ skipped: 'parcela seguinte' });

  const { cat, ids } = await recipientsFor(catId, actorId);
  if (!cat) return Response.json({ skipped: 'categoria não encontrada' });
  if (!ids.length) return Response.json({ skipped: 'ninguém para avisar' });

  const quem = await actorName(actorId);
  const total = Number(exp.installment_total ?? 0);
  const sufixo = total > 1 ? ` · ${total}x` : '';

  const result = await sendTo(ids, {
    title: `${cat.name} · ${quem}`,
    body: `${exp.name} — ${brl(Number(exp.value ?? 0))}${sufixo}`,
    tag: `gc-cat-${catId}`,
    url: './',
  });

  return Response.json({ ...result, recipients: ids.length });
});
