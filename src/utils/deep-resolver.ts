async function deepResolvePromises(input: any): Promise<any> {
  if (input instanceof Promise) {
    return await input;
  }

  if (Array.isArray(input)) {
    const resolvedArray = await Promise.all(input.map(deepResolvePromises));
    return resolvedArray;
  }

  if (input instanceof Date) {
    return input;
  }

  // Handle Prisma Decimal or Decimal.js objects so class-transformer doesn't mangle them into { s, e, d }
  if (
    input !== null &&
    typeof input === 'object' &&
    ((typeof (input as any).isDecimal === 'function' &&
      (input as any).isDecimal()) ||
      (typeof (input as any).toFixed === 'function' &&
        Array.isArray((input as any).d) &&
        typeof (input as any).s === 'number' &&
        typeof (input as any).e === 'number'))
  ) {
    return (input as any).toString();
  }

  if (typeof input === 'object' && input !== null) {
    const keys = Object.keys(input);
    const resolvedObject: Record<string, any> = {};

    for (const key of keys) {
      const resolvedValue = await deepResolvePromises(input[key]);
      resolvedObject[key] = resolvedValue;
    }

    return resolvedObject;
  }

  return input;
}

export default deepResolvePromises;
