import { describe, it, expect } from 'vitest';
import { buildZodSchemaFromDataSchema } from '../../src/domain/data-schema-validator.js';

describe('buildZodSchemaFromDataSchema', () => {
  it('validates required string fields', () => {
    const schema = buildZodSchemaFromDataSchema(
      { basePath: { type: 'string' } },
      ['basePath']
    );
    expect(schema.safeParse({ basePath: '/api' }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('allows optional fields to be absent', () => {
    const schema = buildZodSchemaFromDataSchema(
      { port: { type: 'number' } },
      []
    );
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ port: 5432 }).success).toBe(true);
  });

  it('validates enum fields', () => {
    const schema = buildZodSchemaFromDataSchema(
      { auth: { type: 'string', enum: ['none', 'jwt', 'oauth2'] } },
      ['auth']
    );
    expect(schema.safeParse({ auth: 'jwt' }).success).toBe(true);
    expect(schema.safeParse({ auth: 'invalid' }).success).toBe(false);
  });

  it('validates array fields with item type', () => {
    const schema = buildZodSchemaFromDataSchema(
      {
        methods: {
          type: 'array',
          items: { type: 'string', enum: ['GET', 'POST', 'DELETE'] },
        },
      },
      ['methods']
    );
    expect(schema.safeParse({ methods: ['GET', 'POST'] }).success).toBe(true);
    expect(schema.safeParse({ methods: ['INVALID'] }).success).toBe(false);
  });

  it('passes through extra fields (passthrough)', () => {
    const schema = buildZodSchemaFromDataSchema({ host: { type: 'string' } }, ['host']);
    expect(schema.safeParse({ host: 'localhost', extra: true }).success).toBe(true);
  });
});
