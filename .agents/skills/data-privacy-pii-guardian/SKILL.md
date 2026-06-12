---
name: data-privacy-pii-guardian
description: Personally Identifiable Information (PII) and sensitive data compliance patterns for multi-tenant business applications. Covers data classification, access control, audit trails, encryption, offline storage privacy, and common leak vectors.
origin: StockLedger — retooled from healthcare-phi-compliance
version: "1.0.0"
---

# Data Privacy & PII Compliance Patterns

Patterns for protecting staff PII, financial data, and business-sensitive information in multi-tenant inventory and supply chain applications.

## When to Use

- Building any feature that touches staff or user personal data
- Implementing access control or authentication for multi-tenant systems
- Designing database schemas that store financial or PII data
- Building APIs that return staff, financial, or business-sensitive data
- Implementing audit trails or logging
- Reviewing code for data exposure vulnerabilities
- Setting up Row-Level Security (RLS) for multi-tenant data isolation
- Designing offline storage for client applications (Electron, mobile)
- Implementing sync engines that transmit business data between client and server

## How It Works

Data protection in multi-tenant business systems operates on three layers: **classification** (what is sensitive), **access control** (who can see it), and **audit** (who did see it).

### Data Classification

**PII (Personally Identifiable Information)** — any data that can identify a natural person: staff/employee name, date of birth, address, phone, email, government IDs (SSN, passport, tax ID), bank account details, payroll/salary information, emergency contact information.

**Business-Sensitive Data** — information that, if exposed, could harm business operations: cost prices and margins, supplier contracts and rates, inventory valuation data, client/customer lists, trade secrets (recipes, formulas, proprietary processes), security credentials and API keys.

**Tenant-Isolated Data** — any data that belongs to a specific client and must not be accessible by other clients: event history, product catalog, pricing, location data, user accounts, device registrations.

### Access Control: Row-Level Security (RLS)

```sql
-- Enable RLS on tables containing PII or tenant-isolated data
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

-- Scope access by tenant (client_id)
CREATE POLICY "staff_read_own_tenant"
  ON staff FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT client_id FROM user_sessions
    WHERE user_id = auth.uid()
  ));

-- Restrict sensitive PII columns to CLIENT_ADMIN role
CREATE POLICY "staff_pii_admin_only"
  ON staff FOR SELECT TO authenticated
  USING (
    current_role IN ('GLOBAL_ADMIN', 'CLIENT_ADMIN')
  );
```

### Audit Trail

Every access to PII or sensitive financial data must be logged:

```typescript
interface AuditEntry {
  timestamp: string;
  user_id: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'export' | 'print';
  resource_type: string;     // 'staff', 'product', 'pricing', 'client'
  resource_id: string;
  tenant_id: string;         // which client's data was accessed
  changes?: { before: object; after: object };
  ip_address: string;
  device_id: string;
  session_id: string;
}
```

### Common Leak Vectors

**Error messages:** Never include PII or business-sensitive data in error messages thrown to the client. Log details server-side only.

**Console output:** Never log full user or financial objects. Use opaque internal record IDs (UUIDs) — not names, tax IDs, or account numbers.

**URL parameters:** Never put PII in query strings or path segments that could appear in logs or browser history. Use opaque UUIDs only.

**Client storage (Electron/mobile):** Never store PII in localStorage, IndexedDB, or SQLite unencrypted. Encrypt at rest. Minimize cached sensitive data.

**Sync transmission:** Sensitive data transmitted during sync must use HTTPS/TLS. Consider field-level encryption for highly sensitive fields (salary, bank details).

**Logs and monitoring:** Never log full PII records. Sanitize stack traces before sending to error tracking services.

**Tenant isolation leakage:** Ensure that error messages, cache keys, and log entries don't accidentally reveal data from other tenants.

### Database Schema Tagging

Mark PII/sensitive columns at the schema level:

```sql
COMMENT ON COLUMN staff.name IS 'PII: staff_name';
COMMENT ON COLUMN staff.salary IS 'FINANCIAL: sensitive';
COMMENT ON COLUMN staff.bank_account IS 'PII: financial';
COMMENT ON COLUMN products.cost_price IS 'BUSINESS: confidential';
```

### Offline Storage Security

For Electron and mobile clients with local databases:
- Local SQLite databases containing business data should be encrypted using SQLCipher or similar
- Authentication tokens stored locally must use secure storage (Electron safeStorage, Keychain, KeyStore)
- Sync queues must not contain PII in plaintext
- Local databases should be wiped on logout or tenant switch

### Deployment Checklist

Before every deployment:
- No PII in error messages or stack traces
- No PII in console.log/console.error
- No PII in URL parameters
- No PII in browser storage (unless encrypted)
- RLS enabled on all PII/financial tables
- Tenant isolation verified (no cross-tenant data leakage)
- Audit trail for all sensitive data modifications
- Session timeout configured
- API authentication on all sensitive endpoints
- Sync transmission over HTTPS verified
- Offline storage encryption confirmed

## Examples

### Example 1: Safe vs Unsafe Error Handling

```typescript
// BAD — leaks PII in error
throw new Error(`Staff member ${staff.name} with salary ${staff.salary} not found in tenant ${tenantId}`);

// GOOD — generic error, details logged server-side with opaque IDs only
logger.error('Staff lookup failed', { staffId: staff.id, tenantId });
throw new Error('Staff record not found');
```

### Example 2: RLS Policy for Multi-Tenant Isolation

```sql
-- Staff at Tenant A cannot see Tenant B's data
CREATE POLICY "tenant_isolation"
  ON events FOR SELECT TO authenticated
  USING (client_id IN (
    SELECT client_id FROM user_sessions WHERE user_id = auth.uid()
  ));

-- Test: login as staff-tenant-a, query tenant-b events
-- Expected: 0 rows returned
```

### Example 3: Safe Logging

```typescript
// BAD — logs identifiable staff data
console.log('Processing payroll for:', staffMember);

// GOOD — logs only opaque internal record ID
console.log('Processing payroll record:', staffMember.id);
```

### Example 4: Offline Storage Safety

```typescript
// BAD — caching PII in local storage unencrypted
localStorage.setItem('currentUser', JSON.stringify(staffMember));

// GOOD — storing only minimal, non-sensitive data
localStorage.setItem('session', JSON.stringify({
  userId: staffMember.id,
  clientId: staffMember.client_id,
  role: staffMember.role
}));
// Full staff data fetched on demand from secure API
```
