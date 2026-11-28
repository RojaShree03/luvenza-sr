# Payment indexes and startup readiness

`models/payment.js` is the source of truth for these indexes. `config/paymentIndexReadiness.js` creates the declared indexes during startup and then compares MongoDB's actual index metadata to the required key pattern, uniqueness, sparse option, and partial filter. The server does not begin listening if index creation or verification fails.

| Name | Key | Options | Purpose |
| --- | --- | --- | --- |
| `uniq_active_payment_per_order` | `{ activeOrderKey: 1 }` | `unique: true`, `partialFilterExpression: { activeOrderKey: { $type: "string" } }` | Allows at most one active attempt per Order; terminal attempts unset `activeOrderKey`. |
| `uniq_payment_attempt_number` | `{ orderId: 1, attemptNumber: 1 }` | `unique: true` | Prevents duplicate allocated attempt numbers for an Order. |
| `uniq_payment_idempotency_key` | `{ orderId: 1, idempotencyKey: 1 }` | `unique: true` | Makes replay and key-conflict checks durable across backend instances. |
| `uniq_razorpay_order_id` | `{ razorpayOrderId: 1 }` | `unique: true`, `sparse: true` | Prevents one provider Order from being attached to multiple local attempts. |

The active index intentionally uses a string-typed partial filter. `activeOrderKey` is stored as the string form of the local Order ObjectId while the reservation is live; it is unset when that attempt becomes paid, cancelled, or definitively failed. `initiating`, `ambiguous`, and `created` attempts retain the reservation. A lease can be reclaimed only for the same idempotency key after expiry; recovery queries Razorpay by the stable receipt before attempting another create.

Startup index creation will fail if existing data violates a unique index. Resolve duplicate records before deploying this version. The readiness matcher checks the exact index name, ordered key document, `unique`, `sparse`, and partial filter. It intentionally ignores server-generated metadata such as `v` and `ns`.

The partial unique index is a database safeguard, not a substitute for application reservation logic. Reservation creation handles duplicate-key races by reading the winning attempt and returning a conflict/replay response.
