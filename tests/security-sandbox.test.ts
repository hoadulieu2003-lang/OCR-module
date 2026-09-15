import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server.js';
import { isPathInsideAllowedRoots } from '../src/routes/report-ocr.routes.js';
import path from 'path';

describe('Security Sandbox & Path Traversal Prevention', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Must block path traversal and sibling prefix escape attempts with 403 FORBIDDEN_PATH_ACCESS', async () => {
    const maliciousPaths = [
      '../../../../../../Windows/System32/drivers/etc/hosts',
      '../../../../../../etc/passwd',
      'C:\\Windows\\win.ini',
      'C:\\autoexec.bat',
      path.resolve(__dirname, '../.env'),
      path.resolve(__dirname, '../package.json'),
      path.resolve(__dirname, '../uploads_malicious/leak.env'),
      path.resolve(__dirname, '../uploads-backup/secret.txt'),
      path.resolve(__dirname, '../dataset-50-real-reports_fake/test.pdf')
    ];

    for (const p of maliciousPaths) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/extract-by-path',
        payload: { filePath: p }
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe('FORBIDDEN_PATH_ACCESS');
    }
  });

  it('Must allow legitimate project sample paths', async () => {
    const safeSamplePath = path.resolve(__dirname, '../uploads');
    // Send a non-existent file inside allowed uploads dir -> should be 404 FILE_NOT_FOUND, not 403 FORBIDDEN
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/extract-by-path',
      payload: { filePath: path.join(safeSamplePath, 'non_existent_test_doc.pdf') }
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload);
    expect(body.error).toBe('FILE_NOT_FOUND');
  });

  it('Must support Warehouse list and sync via API endpoints', async () => {
    const syncRes = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/sync-to-warehouse',
      payload: {
        reportData: {
          metadata: {
            document_title: 'Báo cáo Kiểm thử Tích Hợp Sandbox',
            issuing_authority: 'UBND Thành Phố',
            primary_domain: 'Tài chính'
          },
          level2_details: {
            metrics: [],
            tables: []
          }
        }
      }
    });

    expect(syncRes.statusCode).toBe(200);
    const syncBody = JSON.parse(syncRes.payload);
    expect(syncBody.success).toBe(true);
    expect(syncBody.syncRecord.record_id).toBeDefined();

    // Query warehouse
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/warehouse?authority=UBND'
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.total).toBeGreaterThanOrEqual(1);
    expect(listBody.records.some((r: any) => r.record_id === syncBody.syncRecord.record_id)).toBe(true);
  });

  it('isPathInsideAllowedRoots helper must correctly validate nested paths and reject escapes', () => {
    const rootA = path.resolve('/var/app/uploads');
    const rootB = path.resolve('/var/app/dataset-50');
    const allowed = [rootA, rootB];

    expect(isPathInsideAllowedRoots(path.join(rootA, 'doc.pdf'), allowed)).toBe(true);
    expect(isPathInsideAllowedRoots(path.join(rootA, 'sub', 'deep.pdf'), allowed)).toBe(true);
    expect(isPathInsideAllowedRoots(path.join(rootB, 'report.docx'), allowed)).toBe(true);

    // Rejections
    expect(isPathInsideAllowedRoots(rootA + '_fake/test.pdf', allowed)).toBe(false);
    expect(isPathInsideAllowedRoots(rootA + '-leak/secret.env', allowed)).toBe(false);
    expect(isPathInsideAllowedRoots('/var/app/secret.env', allowed)).toBe(false);
    expect(isPathInsideAllowedRoots(path.join(rootA, '../.env'), allowed)).toBe(false);
  });
});
