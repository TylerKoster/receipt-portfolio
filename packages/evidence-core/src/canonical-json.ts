import { createHash } from 'node:crypto';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function unsupported(detail: string): never {
  throw new Error(`Unsupported canonical JSON value: ${detail}`);
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Canonical JSON numbers must be finite');
    }

    return JSON.stringify(value);
  }

  if (typeof value !== 'object') {
    return unsupported(typeof value);
  }

  if (ancestors.has(value)) {
    return unsupported('cyclic object graph');
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const entries: string[] = [];

      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error(
          'Canonical JSON array prototype must be Array.prototype',
        );
      }

      const expectedProperties = new Set<string>(['length']);

      for (let index = 0; index < value.length; index += 1) {
        expectedProperties.add(String(index));
      }

      const ownPropertyNames = Object.getOwnPropertyNames(value);

      if (
        ownPropertyNames.length !== expectedProperties.size ||
        ownPropertyNames.some((name) => !expectedProperties.has(name)) ||
        Object.getOwnPropertySymbols(value).length > 0
      ) {
        return unsupported(
          'array properties must be length and ordered numeric indices',
        );
      }

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(
          value,
          String(index),
        );

        if (!descriptor || !('value' in descriptor)) {
          return unsupported('array accessors');
        }

        entries.push(serialize(descriptor.value, ancestors));
      }

      return `[${entries.join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);

    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('Canonical JSON objects must be plain objects');
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
      return unsupported('symbol object keys');
    }

    const keys = Object.keys(value);

    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      return unsupported('non-enumerable object properties');
    }

    const semanticKeys = new Set<string>();

    for (const key of keys) {
      const semanticKey = key.normalize('NFC');

      if (semanticKeys.has(semanticKey)) {
        throw new Error(`Duplicate semantic key: ${semanticKey}`);
      }

      semanticKeys.add(semanticKey);
    }

    return `{${keys
      .sort()
      .map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);

        if (!descriptor || !('value' in descriptor)) {
          return unsupported('object accessors');
        }

        return `${JSON.stringify(key)}:${serialize(descriptor.value, ancestors)}`;
      })
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: JsonValue): string;
export function canonicalJson(value: object): string;
export function canonicalJson(value: JsonValue | object): string {
  return serialize(value, new Set<object>());
}
