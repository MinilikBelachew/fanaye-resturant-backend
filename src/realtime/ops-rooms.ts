export function staffRoom(membershipId: string): string {
  return `staff:${membershipId}`;
}

export function branchRoom(branchId: string): string {
  return `branch:${branchId}`;
}

export function cashierRoom(branchId: string): string {
  return `branch:${branchId}:cashier`;
}

export function managerRoom(branchId: string): string {
  return `branch:${branchId}:manager`;
}

export function stationRoom(stationId: string): string {
  return `station:${stationId}`;
}
