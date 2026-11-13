import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  buildSepayWebhookUrls,
  extractOrderCodeFromSepayPayload,
  isIncomingSepayTransfer,
  isSepaySecretAuthorized,
} from '../src/modules/order/sepay.helpers.js';

const { insertedTxns } = vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test_db';
  process.env.INTERNAL_API_KEY ??= 'test_internal_api_key_123456';
  process.env.JWT_ACCESS_SECRET ??= 'test_jwt_access_secret_key_must_be_at_least_32_chars';
  process.env.JWT_REFRESH_SECRET ??= 'test_jwt_refresh_secret_key_must_be_at_least_32_chars';
  process.env.PUBLIC_API_URL = 'https://guided-wallaby-measured.ngrok-free.app/';
  process.env.SEPAY_WEBHOOK_SECRET = '';

  return {
    insertedTxns: [] as Array<Record<string, unknown>>,
  };
});

vi.mock('../src/db/index.js', () => {
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: async () => [],
  };

  const dbMock = {
    select: () => selectChain,
    insert: () => ({
      values: async (row: Record<string, unknown>) => {
        insertedTxns.push(row);
        return [row];
      },
    }),
    transaction: async (fn: (tx: typeof dbMock) => Promise<unknown>) => fn(dbMock),
  };

  return {
    pool: { end: async () => undefined },
    db: dbMock,
  };
});

vi.mock('../src/config/redis.js', () => ({
  redis: { quit: async () => 'OK' },
}));

describe('sepay helpers', () => {
  it('builds primary and backup webhook URLs from ngrok URL without trailing slash issues', () => {
    const urls = buildSepayWebhookUrls('https://guided-wallaby-measured.ngrok-free.app///');

    expect(urls.publicBaseUrl).toBe('https://guided-wallaby-measured.ngrok-free.app');
    expect(urls.primaryWebhookUrl).toBe(
      'https://guided-wallaby-measured.ngrok-free.app/api/v1/webhooks/sepay'
    );
    expect(urls.backupWebhookUrl).toBe(
      'https://guided-wallaby-measured.ngrok-free.app/api/v1/webhooks/sepay/backup'
    );
    expect(urls.fallbackWebhookUrls).toContain(
      'https://guided-wallaby-measured.ngrok-free.app/webhooks/sepay'
    );
    expect(urls.fallbackWebhookUrls).toContain(
      'https://guided-wallaby-measured.ngrok-free.app/webhooks/sepay/backup'
    );
    expect(urls.fallbackWebhookUrls).toContain(
      'https://guided-wallaby-measured.ngrok-free.app/api/webhooks/sepay'
    );
  });

  it('extracts order codes accurately without false positives on bank names', () => {
    expect(
      extractOrderCodeFromSepayPayload({
        content: 'MBVCB.3278907687.3T17100001.CT tu NGUYEN VAN AN',
      })
    ).toBe('3T17100001');

    expect(
      extractOrderCodeFromSepayPayload({
        code: 'ORD3T-2026-001',
        content: 'Chuyen khoan VIETCOMBANK',
      })
    ).toBe('ORD3T-2026-001');

    expect(
      extractOrderCodeFromSepayPayload({
        content: 'VIETCOMBANK CHUYEN KHOAN VIETQR KHONG CO MA DON',
      })
    ).toBeNull();
  });

  it('allows incoming transfers and ignores outgoing transfers', () => {
    expect(isIncomingSepayTransfer({ transferType: 'in' })).toBe(true);
    expect(isIncomingSepayTransfer({})).toBe(true);
    expect(isIncomingSepayTransfer({ transferType: 'out' })).toBe(false);
  });

  it('validates SePay webhook secret when configured and allows when unset', () => {
    expect(isSepaySecretAuthorized({}, undefined)).toBe(true);
    expect(isSepaySecretAuthorized({}, '')).toBe(true);
    expect(
      isSepaySecretAuthorized({ authorization: 'Apikey my_secret_123' }, 'my_secret_123')
    ).toBe(true);
    expect(
      isSepaySecretAuthorized({ authorization: 'Bearer my_secret_123' }, 'my_secret_123')
    ).toBe(true);
    expect(
      isSepaySecretAuthorized({ 'x-sepay-secret': 'my_secret_123' }, 'my_secret_123')
    ).toBe(true);
    expect(
      isSepaySecretAuthorized({ authorization: 'Apikey wrong_secret' }, 'my_secret_123')
    ).toBe(false);
  });
});

describe('SePay primary and backup Express endpoints', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = await import('../src/app.js');
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      throw new Error('Failed to bind ephemeral test port');
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('exposes configured ngrok SePay webhook URLs on GET /api/v1 and GET health endpoints', async () => {
    const welcomeRes = await fetch(`${baseUrl}/api/v1`);
    expect(welcomeRes.status).toBe(200);
    const welcomeJson = (await welcomeRes.json()) as {
      sepayWebhook: { primaryWebhookUrl: string; backupWebhookUrl: string };
    };
    expect(welcomeJson.sepayWebhook.primaryWebhookUrl).toBe(
      'https://guided-wallaby-measured.ngrok-free.app/api/v1/webhooks/sepay'
    );
    expect(welcomeJson.sepayWebhook.backupWebhookUrl).toBe(
      'https://guided-wallaby-measured.ngrok-free.app/api/v1/webhooks/sepay/backup'
    );

    for (const path of [
      '/api/v1/webhooks/sepay',
      '/api/v1/webhooks/sepay/backup',
      '/api/webhooks/sepay',
      '/webhooks/sepay',
      '/webhooks/sepay/backup',
    ]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string; primaryWebhookUrl: string };
      expect(body.status).toBe('READY');
      expect(body.primaryWebhookUrl).toBe(
        'https://guided-wallaby-measured.ngrok-free.app/api/v1/webhooks/sepay'
      );
    }
  });

  it('handles POST SePay webhooks across primary and all backup paths', async () => {
    const paths = [
      '/api/v1/webhooks/sepay',
      '/api/v1/webhooks/sepay/backup',
      '/api/webhooks/sepay',
      '/api/webhooks/sepay/backup',
      '/webhooks/sepay',
      '/webhooks/sepay/backup',
      '/sepay/webhook',
    ];

    for (const [idx, path] of paths.entries()) {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 9000 + idx,
          transferType: 'in',
          transferAmount: 5000000,
          content: `Thanh toan 3T9999000${idx}`,
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        success: boolean;
        gateway: string;
        orderCode: string;
      };
      expect(body.success).toBe(true);
      expect(body.gateway).toBe('SEPAY_VIETQR');
      expect(body.orderCode).toBe(`3T9999000${idx}`);
    }

    const outgoingRes = await fetch(`${baseUrl}/webhooks/sepay/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 9999,
        transferType: 'out',
        transferAmount: 100000,
        content: 'Rut tien 3T99990001',
      }),
    });
    expect(outgoingRes.status).toBe(200);
    const outgoingJson = (await outgoingRes.json()) as { ignored: boolean; reason: string };
    expect(outgoingJson.ignored).toBe(true);
    expect(outgoingJson.reason).toBe('OUTGOING_TRANSFER');
  });
});
