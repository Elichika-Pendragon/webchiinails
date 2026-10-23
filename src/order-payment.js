// Only an estimate is imported. Existing payment widgets and validation own the
// final editable amount; a customer-entered payment is never silently replaced.
export function estimatePayment(order, current) {
  const total = order?.estimate?.min;
  if (!Number.isSafeInteger(total) || total < 1 || total > 10000000) return null;
  return { total: String(total), deposit: current.paymentMode === 'full' || total <= 20000 ? String(total) : current.deposit === '' ? '20000' : current.deposit };
}
