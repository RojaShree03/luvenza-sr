# Payment index deployment requirements

Payment and webhook models use `autoIndex: false`. The application does not
create, drop, or modify these indexes. `config/paymentIndexReadiness.js` checks
the live definitions during startup and the server exits before listening if a
required index is absent or does not match.

The Mongoose collection names are `payments` and `paymentwebhookevents`. Before
deploying this version, an operator must check whether each collection exists,
check for duplicate values that conflict with unique indexes, and provision the
following definitions through the approved database change process. Create a
collection only if it does not already exist. These commands are documentation
only; they were not run as part of Stage 5.2.

```javascript
db.payments.createIndex(
  { orderId: 1, attemptNumber: 1 },
  { unique: true }
)

db.payments.createIndex(
  { customerId: 1, orderId: 1, idempotencyKey: 1 },
  { unique: true }
)

db.payments.createIndex(
  { razorpayOrderId: 1 },
  { unique: true, partialFilterExpression: { razorpayOrderId: { $type: "string" } } }
)

db.payments.createIndex(
  { razorpayPaymentId: 1 },
  { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: "string" } } }
)

db.payments.createIndex(
  { customerId: 1, orderId: 1, attemptNumber: -1 }
)

db.paymentwebhookevents.createIndex(
  { eventId: 1 },
  { unique: true }
)

db.paymentwebhookevents.createIndex(
  { status: 1, receivedAt: 1 }
)

db.paymentwebhookevents.createIndex(
  { status: 1, processingLeaseExpiresAt: 1 }
)
```

The existing Stage 4 checkout index remains a separate required index and is
still checked by `config/checkoutIndexReadiness.js`.

Payment attempt numbers may contain gaps. A future payment service must
allocate the next attempt number safely under concurrent requests, using the
unique `{ orderId, attemptNumber }` index as the final duplicate guard and
retrying allocation after a duplicate-key conflict. The model does not reserve
or allocate attempt numbers itself.

Captured payment and webhook event deletion is blocked through supported
Mongoose model and document deletion methods. This is application-level
protection only: native MongoDB collection operations and direct database
access bypass Mongoose middleware. Production database credentials and
operator access must therefore remain restricted, and operational procedures
must not delete these audit records.

Webhook event identity, payload, signature-verification time, and received time
are immutable through both hydrated document saves and query updates. Processing
status, lease, retry, and processing timestamp changes remain limited to the
approved atomic repository operations.

Production payment writes are centralized in the payment repositories.
`paymentRepository.js` creates attempts idempotently and changes payment state
through compare-and-set. `paymentWebhookEventRepository.js` creates verified
pending events idempotently, claims/reclaims and fails/retries them. The
general event repository does not export completion. Completion is available
to `utils/paymentWebhookProcessing.js` through
`paymentWebhookEventCompletion.js`, after the business-effects handler
resolves. External side effects must be independently idempotent because a
lease cannot make an external effect and MongoDB completion atomic.

`config/db.js` imports no payment models. It calls only
`repositories/paymentIndexReadinessRepository.js`, whose public interface
exposes the index check and not the collections. Startup order remains Stage 4
checkout index verification, payment index verification, checkout recovery,
then server listening. `autoIndex` is disabled; readiness checks inspect
indexes but do not create or change them.

Webhook claims use one atomic `findOneAndUpdate` with the event/status/expiry
filter. MongoDB `$$NOW` is used both to compare an expired lease and to compute
the new lease expiry in an update pipeline; token, status and version checks
remain in place. Update pipelines and aggregation variable `NOW` require
MongoDB 4.2 or newer. This project does not pin or report the deployed server
version, so operators must verify the target cluster meets that minimum before
deployment. MongoDB documents update pipelines [here](https://www.mongodb.com/docs/manual/tutorial/update-documents-with-aggregation-pipeline/)
and the deployment-wide `NOW` variable [here](https://www.mongodb.com/docs/manual/reference/aggregation-variables/).

The source analyzer tokenizes production `.js`, `.cjs` and `.mjs` files and
checks direct model imports/re-exports, saved and bracketed model-registry
access, common literal native collection writes including stored handles,
middleware-skip options, test-seam references, completion access, and model
write methods outside the per-repository allowlist. Readiness modules and
startup files are treated as read-only. This is a static guard, not complete
JavaScript AST or runtime enforcement. Computed module paths, dynamically
constructed names/options, indirect driver handles, generated code, and direct
privileged database access can evade source inspection. Keep database roles
restricted and review new database access paths.

The repository's deterministic model factories are test-only. Production
processing tokens use Node's cryptographic `randomUUID()` and lease duration
and time are not caller-controlled. Payment attempt numbers may contain gaps;
Stage 5.3 must allocate them safely under concurrency and retry duplicate
`{ orderId, attemptNumber }` conflicts while preserving the stable
customer/order idempotency key.

Before production, use a disposable MongoDB deployment to test concurrent
payment creation and compare-and-set updates, webhook duplicate inserts,
concurrent claims and expired-lease reclamation, stale completion/failure,
server-time pipeline execution, actual unique-index enforcement, and startup
failure on missing/mismatched indexes. Stage 5.3 must load orders using the
authenticated customer identity, verify ownership and `Awaiting_Payment`, and
derive amount/currency from the saved order. Controllers, routes, Razorpay
calls, and payment verification remain outside Stage 5.2.
