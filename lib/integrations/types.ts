export type IntegrationEvent = { companyId: string; eventId: string; occurredAt: string };
export type StockrReceipt = IntegrationEvent & { purchaseOrderId: string; warehouseId?: string; items: { sku: string; quantity: number; unitCost: number }[] };
export type BuildrCostUpdate = IntegrationEvent & { projectId: string; purchaseOrderId: string; amount: number; status: string };
export interface IntegrationAdapter<T> { push(payload: T): Promise<{ externalId?: string }>; }
