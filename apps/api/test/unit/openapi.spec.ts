import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { applyOpenApi } from '../../src/openapi';

const app = {} as INestApplication;

describe('applyOpenApi', () => {
  beforeEach(() => {
    vi.spyOn(SwaggerModule, 'createDocument').mockReturnValue({
      openapi: '3.0.0',
      info: { title: 'Resto API', version: '0.0.0' },
      paths: {},
    });
    vi.spyOn(SwaggerModule, 'setup').mockImplementation(() => undefined);
  });

  it('mounts /docs in development', () => {
    applyOpenApi(app, { NODE_ENV: 'development' });
    expect(SwaggerModule.setup).toHaveBeenCalledWith('docs', app, expect.any(Object));
  });

  it('mounts /docs in test', () => {
    applyOpenApi(app, { NODE_ENV: 'test' });
    expect(SwaggerModule.setup).toHaveBeenCalledWith('docs', app, expect.any(Object));
  });

  it('does not mount /docs in staging', () => {
    applyOpenApi(app, { NODE_ENV: 'staging' });
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
  });

  it('does not mount /docs in production', () => {
    applyOpenApi(app, { NODE_ENV: 'production' });
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
    expect(SwaggerModule.createDocument).not.toHaveBeenCalled();
  });
});
