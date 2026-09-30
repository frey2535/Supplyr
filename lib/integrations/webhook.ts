import { createHmac, randomUUID } from 'crypto';
import type { IntegrationAdapter } from './types';

export class SignedWebhookAdapter<T> implements IntegrationAdapter<T> {
  constructor(private url: string, private secret: string) {}
  async push(payload: T) {
    const body = JSON.stringify(payload); const signature = createHmac('sha256', this.secret).update(body).digest('hex');
    const response = await fetch(this.url, { method:'POST', headers:{'content-type':'application/json','x-currentflow-signature':signature,'x-idempotency-key':randomUUID()}, body });
    if (!response.ok) throw new Error(`Integration returned ${response.status}`);
    return response.status === 204 ? {} : await response.json();
  }
}
