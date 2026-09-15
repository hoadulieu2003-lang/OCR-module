import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { reportOcrRoutes } from './routes/report-ocr.routes.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  await app.register(cors, {
    origin: true
  });

  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024 // 100 MB limit
    }
  });

  // 1. Cấu hình Swagger OpenAPI v3.0
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'KGLVS - Executive Report OCR & Extraction API',
        description: 'RESTful API Bóc tách dữ liệu báo cáo hành chính, KPI, điểm nghẽn và tổng hợp điều hành cho lãnh đạo (Không Gian Làm Việc Số - KGLVS)',
        version: '2.0.0'
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Local Development Server'
        }
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
            description: 'Khóa xác thực API (Mặc định dev: kglvs-secret-key-2026 hoặc cấu hình trong .env)'
          },
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'API-Key',
            description: 'Khóa xác thực Bearer token'
          }
        }
      },
      security: [
        { apiKeyAuth: [] },
        { bearerAuth: [] }
      ],
      tags: [
        { name: 'Reports Extraction', description: 'Endpoints bóc tách và phân tích báo cáo hành chính' },
        { name: 'System', description: 'Trạng thái và kiểm tra sức khỏe hệ thống' }
      ]
    }
  });

  // 2. Cấu hình Swagger UI trực quan tại /docs
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // 3. Phục vụ giao diện Demo trực quan trên trang chủ
  app.get('/', async (req, reply) => {
    const htmlPath = path.resolve(__dirname, '../public/index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf-8');
      return reply.type('text/html').send(html);
    }
    return reply.redirect('/docs');
  });

  // 4. API Key Authentication Hook (Tùy chọn bảo mật cho các hệ thống bên ngoài)
  app.addHook('preHandler', async (request, reply) => {
    const configuredApiKey = process.env.API_KEY || 'kglvs-secret-key-2026';
    const isEnforceAuth = process.env.ENFORCE_API_KEY === 'true';

    // Bỏ qua kiểm tra auth đối với trang chủ, tài liệu /docs, healthcheck và file mẫu
    const cleanUrl = request.url.split('?')[0];
    const publicPaths = ['/', '/docs', '/docs/', '/api/v1/health', '/api/v1/reports/samples'];
    if (publicPaths.includes(request.routeOptions.url || cleanUrl) || cleanUrl.startsWith('/docs')) {
      return;
    }

    if (isEnforceAuth) {
      const apiKeyHeader = request.headers['x-api-key'];
      const authHeader = request.headers['authorization'];
      const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

      const providedKey = apiKeyHeader || bearerToken;

      if (!providedKey || providedKey !== configuredApiKey) {
        return reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Khóa API không hợp lệ hoặc bị thiếu. Vui lòng truyền header x-api-key hoặc Authorization: Bearer <API_KEY>.'
        });
      }
    }
  });

  // 5. Đăng ký các Routes của OCR Engine
  await app.register(reportOcrRoutes, { prefix: '/api/v1' });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const PORT = parseInt(process.env.PORT || '3001', 10);
  const HOST = process.env.HOST || '0.0.0.0';

  buildApp().then(app => {
    app.listen({ port: PORT, host: HOST }, (err, address) => {
      if (err) {
        app.log.error(err);
        process.exit(1);
      }
      app.log.info(`🚀 KGLVS Report OCR Engine is running on ${address}`);
      app.log.info(`📖 Interactive Swagger Documentation: ${address}/docs`);
    });
  });
}
