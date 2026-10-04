## What and why

<!-- One or two sentences: what changed, and why. -->

## Security checklist

Complete this section if the diff touches **auth, payments, blockchain, or PII**.
Delete it otherwise.

- [ ] **Ownership checks.** Every route/server action taking a resource id verifies the
      caller owns it (not just that it exists), including every link in a nested
      resource chain (e.g. booking → invoice; artwork → certificate → mint voucher).
- [ ] **No secrets logged.** No API key, password, token, or signed URL appears in a
      `console.log`/`console.error` call or an error message sent to the client.
- [ ] **No raw errors to clients.** Stack traces and SQL error text are never returned
      in a response body; errors are caught and mapped to a safe message.
- [ ] **Audit log.** A new admin or security-relevant action (role grant, refund,
      approve/reject, erasure, mint/voucher issue) writes to the append-only audit log
      with actor, target, and timestamp.
- [ ] **Input validation.** Request bodies, form data, and query params are validated
      (zod or equivalent) before use — never trusted by shape alone.
- [ ] **Signed webhooks.** Any new webhook endpoint verifies a signature over the raw
      body and rejects replays (event id + timestamp window).
- [ ] **PII handling.** New personal data is covered by the DPDP export/erasure paths,
      or there's a documented reason it isn't yet.

## Test plan

<!-- How you verified this: commands run, manual steps, screenshots. -->
