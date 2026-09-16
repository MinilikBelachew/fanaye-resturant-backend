/**
 * Helper function to generate clear, human-readable descriptions for restaurant audit events
 */
export function generateAuditDescription(payload: {
  action: string;
  entity: string;
  entityId?: string | null;
  details?: any;
  path?: string;
}): string {
  const { action, entity, entityId, details } = payload;

  const entityName = formatEntityName(entity);
  const entityIdentifier = entityId ? ` (ID: ${entityId.slice(0, 8)}…)` : '';

  // Specialized restaurant action formatting
  switch (action) {
    case 'CONFIRM_ORDER':
    case 'CREATE_ORDER':
      return generateOrderDescription(
        'Created order',
        details,
        entityIdentifier,
      );

    case 'CONFIRM_CASH_PAYMENT':
      return generatePaymentDescription('Cash payment confirmed', details);

    case 'CONFIRM_TRANSFER_PAYMENT':
      return generatePaymentDescription(
        'Transfer payment (Telebirr/CBE) confirmed',
        details,
      );

    case 'CONFIRM_CASH_DROP_RECEIPT':
      return generateCashDropDescription(
        'Cash drop accepted at cashier register',
        details,
      );

    case 'SUBMIT_CASH_DROP':
      return generateCashDropDescription('Waiter submitted cash drop', details);

    case 'MARK_ITEM_READY':
      return generateStationDescription(
        'Dish marked ready for pickup',
        details,
      );

    case 'START_PREPARATION':
      return generateStationDescription(
        'Started preparation at station',
        details,
      );

    case 'ASSIGN_TABLE_COVERAGE':
      return generateCoverageDescription(details);

    case 'REQUEST_BILL':
      return generateBillDescription(details);

    case 'GENERATE_DAILY_CLOSE':
    case 'APPROVE_DAILY_CLOSE':
      return generateDailyCloseDescription(action, details);

    case 'LOGIN':
      return 'Staff logged in to POS terminal';

    case 'LOGOUT':
      return 'Staff logged out from terminal';

    case 'CREATE':
      return generateCreateDescription(entityName, entityIdentifier, details);

    case 'UPDATE':
      return generateUpdateDescription(entityName, entityIdentifier, details);

    case 'DELETE':
      return generateDeleteDescription(entityName, entityIdentifier, details);

    default:
      return `Performed ${action.toLowerCase().replace(/_/g, ' ')} on ${entityName}${entityIdentifier}`;
  }
}

function formatEntityName(entity: string): string {
  let name = entity.toLowerCase().replace(/[-_]/g, ' ');
  if (name.endsWith('ies')) {
    name = name.slice(0, -3) + 'y';
  } else if (name.endsWith('es') && !name.endsWith('ss')) {
    name = name.slice(0, -2);
  } else if (name.endsWith('s') && !name.endsWith('ss')) {
    name = name.slice(0, -1);
  }
  return name.trim();
}

function generateOrderDescription(
  prefix: string,
  details: any,
  entityIdentifier: string,
): string {
  if (!details || typeof details !== 'object')
    return `${prefix}${entityIdentifier}`;
  const parts: string[] = [];
  if (details.tableDisplayName || details.tableNumber) {
    parts.push(`Table ${details.tableDisplayName || details.tableNumber}`);
  }
  if (details.totalAmount || details.amount) {
    parts.push(
      `ETB ${(details.totalAmount || details.amount).toLocaleString()}`,
    );
  }
  if (Array.isArray(details.items)) {
    parts.push(`${details.items.length} item(s)`);
  }
  return parts.length
    ? `${prefix} for ${parts.join(' · ')}`
    : `${prefix}${entityIdentifier}`;
}

function generatePaymentDescription(prefix: string, details: any): string {
  if (!details || typeof details !== 'object') return prefix;
  const parts: string[] = [];
  if (details.amount)
    parts.push(`ETB ${Number(details.amount).toLocaleString()}`);
  if (details.tableDisplayName) parts.push(`Table ${details.tableDisplayName}`);
  if (details.paymentMethod)
    parts.push(String(details.paymentMethod).toUpperCase());
  return parts.length ? `${prefix} - ${parts.join(' · ')}` : prefix;
}

function generateCashDropDescription(prefix: string, details: any): string {
  if (!details || typeof details !== 'object') return prefix;
  const parts: string[] = [];
  if (details.amount)
    parts.push(`ETB ${Number(details.amount).toLocaleString()}`);
  if (details.waiterName || details.staffName) {
    parts.push(`Waiter: ${details.waiterName || details.staffName}`);
  }
  if (details.slipNumber) parts.push(`Slip #${details.slipNumber}`);
  return parts.length ? `${prefix} (${parts.join(' · ')})` : prefix;
}

function generateStationDescription(prefix: string, details: any): string {
  if (!details || typeof details !== 'object') return prefix;
  const parts: string[] = [];
  if (details.itemName) parts.push(`"${details.itemName}"`);
  if (details.stationName) parts.push(`at ${details.stationName}`);
  if (details.tableDisplayName) parts.push(`Table ${details.tableDisplayName}`);
  return parts.length ? `${prefix}: ${parts.join(' ')}` : prefix;
}

function generateCoverageDescription(details: any): string {
  if (!details || typeof details !== 'object')
    return 'Updated waiter table coverage allocation';
  const parts: string[] = [];
  if (details.staffName || details.waiterName) {
    parts.push(`for ${details.staffName || details.waiterName}`);
  }
  if (Array.isArray(details.tableIds) || Array.isArray(details.tables)) {
    const count = (details.tableIds || details.tables).length;
    parts.push(`(${count} assigned table${count === 1 ? '' : 's'})`);
  }
  return `Updated table coverage ${parts.join(' ')}`.trim();
}

function generateBillDescription(details: any): string {
  if (!details || typeof details !== 'object')
    return 'Bill requested for table';
  if (details.tableDisplayName)
    return `Bill requested for Table ${details.tableDisplayName}`;
  return 'Bill requested for table';
}

function generateDailyCloseDescription(action: string, details: any): string {
  const isApprove = action.includes('APPROVE');
  const label = isApprove
    ? 'Approved operational daily close'
    : 'Generated operational daily close';
  if (details && typeof details === 'object' && details.totalRevenue) {
    return `${label} - Total ETB ${Number(details.totalRevenue).toLocaleString()}`;
  }
  return label;
}

function generateCreateDescription(
  entityName: string,
  entityIdentifier: string,
  details: any,
): string {
  const name = extractNameFromDetails(details);
  if (name) {
    return `Created new ${entityName} "${name}"${entityIdentifier}`;
  }
  return `Created new ${entityName}${entityIdentifier}`;
}

function generateUpdateDescription(
  entityName: string,
  entityIdentifier: string,
  details: any,
): string {
  const name = extractNameFromDetails(details);
  const changedFields = extractChangedFields(details);
  let description = `Updated ${entityName}`;
  if (name) description += ` "${name}"`;
  description += entityIdentifier;
  if (changedFields.length > 0) {
    description += ` - Changed: ${changedFields.join(', ')}`;
  }
  return description;
}

function generateDeleteDescription(
  entityName: string,
  entityIdentifier: string,
  details: any,
): string {
  const name = extractNameFromDetails(details);
  if (name) {
    return `Deleted ${entityName} "${name}"${entityIdentifier}`;
  }
  return `Deleted ${entityName}${entityIdentifier}`;
}

function extractNameFromDetails(details: any): string | null {
  if (!details || typeof details !== 'object') return null;
  const nameFields = [
    'name',
    'employeeDisplayName',
    'displayName',
    'title',
    'tableNumber',
    'code',
    'itemName',
    'email',
  ];
  for (const field of nameFields) {
    if (details[field]) {
      return String(details[field]);
    }
  }
  return null;
}

function extractChangedFields(details: any): string[] {
  if (!details || typeof details !== 'object') return [];
  const excludeFields = [
    'password',
    'token',
    'refreshToken',
    'createdAt',
    'updatedAt',
    'id',
    'tenantId',
    'branchId',
  ];
  const fields: string[] = [];
  for (const key of Object.keys(details)) {
    if (
      !excludeFields.includes(key) &&
      details[key] !== undefined &&
      details[key] !== null
    ) {
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .toLowerCase();
      fields.push(formattedKey);
    }
  }
  return fields.slice(0, 5);
}
