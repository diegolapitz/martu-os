import "server-only";

import { query } from "@/server/data";

import type { PushSubscriptionInput, PushSubscriptionRepository, StoredPushSubscription } from "./types";

type Row = Record<string, unknown>;

export class MartuPushSubscriptionRepository implements PushSubscriptionRepository {
  async upsert(subscription: PushSubscriptionInput): Promise<StoredPushSubscription> {
    const rows = await query<Row>(`insert into public.push_subscriptions
      (user_id, endpoint, p256dh, auth, user_agent, status, failure_count)
      values ($1,$2,$3,$4,$5,'active',0)
      on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, status = 'active', failure_count = 0
      returning *`, [await martuUserId(), subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, subscription.userAgent ?? null]);
    return mapSubscription(rows[0]);
  }

  async deleteByEndpoint(endpoint: string): Promise<boolean> {
    const rows = await query<Row>("delete from public.push_subscriptions where endpoint = $1 and user_id = $2 returning id", [endpoint, await martuUserId()]);
    return rows.length > 0;
  }

  async listActive(): Promise<StoredPushSubscription[]> {
    const rows = await query<Row>(`select * from public.push_subscriptions where user_id = $1 and status = 'active'
      order by updated_at desc`, [await martuUserId()]);
    return rows.map(mapSubscription);
  }

  async markUsed(id: string, at: Date): Promise<void> {
    await query(`update public.push_subscriptions set last_used_at = $2, failure_count = 0 where id = $1 and user_id = $3`, [id, at.toISOString(), await martuUserId()]);
  }

  async markFailed(id: string, at: Date): Promise<void> {
    await query(`update public.push_subscriptions set last_used_at = $2,
      failure_count = failure_count + 1,
      status = case when failure_count + 1 >= 3 then 'expired' else status end
      where id = $1 and user_id = $3 and status = 'active'`, [id, at.toISOString(), await martuUserId()]);
  }
}

async function martuUserId(): Promise<string> {
  const rows = await query<Row>("select id from public.users where slug = 'martu' limit 1");
  if (!rows[0]) throw new Error("La usuaria demo Martu no está inicializada.");
  return String(rows[0].id);
}

function mapSubscription(row: Row): StoredPushSubscription {
  return {
    id: String(row.id), endpoint: String(row.endpoint), p256dh: String(row.p256dh), auth: String(row.auth),
    userAgent: row.user_agent == null ? null : String(row.user_agent), expirationTime: null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}
