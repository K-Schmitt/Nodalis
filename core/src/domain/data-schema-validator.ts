import { z } from 'zod';

type JsonSchemaField = {
  type?: string;
  enum?: string[];
  items?: JsonSchemaField;
  properties?: Record<string, JsonSchemaField>;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
};

function buildFieldZodType(field: JsonSchemaField): z.ZodTypeAny {
  if (field.enum && field.enum.length > 0) {
    const enums = field.enum as [string, ...string[]];
    return z.enum(enums);
  }

  switch (field.type) {
    case 'string': {
      let s = z.string();
      if (field.minLength !== undefined) s = s.min(field.minLength);
      if (field.maxLength !== undefined) s = s.max(field.maxLength);
      if (field.pattern) s = s.regex(new RegExp(field.pattern));
      return s;
    }
    case 'integer': {
      let n = z.number().int();
      if (field.minimum !== undefined) n = n.min(field.minimum);
      if (field.maximum !== undefined) n = n.max(field.maximum);
      return n;
    }
    case 'number': {
      let n = z.number();
      if (field.minimum !== undefined) n = n.min(field.minimum);
      if (field.maximum !== undefined) n = n.max(field.maximum);
      return n;
    }
    case 'boolean':
      return z.boolean();
    case 'array': {
      const itemSchema = field.items ? buildFieldZodType(field.items) : z.unknown();
      return z.array(itemSchema);
    }
    case 'object':
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

/**
 * Converts a definition's dataSchema (JSON Schema-like) into a Zod validator.
 * Required fields (from constraints.requiredFields) are non-optional.
 */
export function buildZodSchemaFromDataSchema(
  dataSchema: Record<string, unknown>,
  requiredFields: string[] = []
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, rawField] of Object.entries(dataSchema)) {
    const field = rawField as JsonSchemaField;
    let fieldSchema = buildFieldZodType(field);

    if (!requiredFields.includes(key)) {
      fieldSchema = fieldSchema.optional() as z.ZodTypeAny;
    }

    shape[key] = fieldSchema;
  }

  return z.object(shape).passthrough();
}

export type { JsonSchemaField };
