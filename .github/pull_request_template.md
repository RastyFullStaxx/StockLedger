## Summary

<!-- Briefly describe what changed and why. -->

## Review Checklist

- [ ] I did not push directly to `main`.
- [ ] This change preserves immutable event history.
- [ ] This change does not store stock directly; stock remains derived from event replay.
- [ ] Tenant isolation was considered and preserved.
- [ ] Sync atomicity and idempotency were considered, if relevant.
- [ ] Offline/online behavior remains consistent, if relevant.
- [ ] No sensitive tenant, user, device, or credential data is exposed in logs, errors, or client storage.

## Testing

<!-- Note what was tested, or explain why testing was not needed for this change. -->
