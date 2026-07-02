# Glonez Backend

Express.js backend for a language training centre. Manages users, classes, payments (Neero), claims, and company fund accounts.

## Highlights

- **ESM** project (`"type": "module"`) — every source file uses `import` / `export`.
- Two separate identity stores: **Staff** (admin, manager, auditor, support) and **User** (regular users — created only by staff).
- Numeric roles (`1000` admin, `600` manager, `500` auditor, `200` support) with a role-guard helper.
- JWTs are visually distinguished by prefix (`STF.` vs `USR.`) and signed with **different secrets**; two middlewares enforce the separation.
- Every record has a Mongo `_id` **plus** a user-friendly id (`USR-…`, `PAY-…`, `CLM-…`, `TRF-…`, etc.).
- Force-change-password on first login via the `hsCp` boolean.
- Single response envelope (`{ success, data, errorMsg, errorCode }`), HTTP status is **always 200**.
- **Every controller is wrapped in try/catch via `asyncHandler`** — thrown errors are logged server-side and rendered as `{ success: false, errorMsg, errorCode }`. The client never sees a crash or a stack trace.
- **Pagination** on every list endpoint via [`mongoose-paginate-v2`](https://github.com/aravindnc/mongoose-paginate-v2). Frontend sends `?pageNum=` (default 1) and `?pageSize=` (default 10, capped at 100).
- Translation via a tiny in-process middleware exposing `req.$t('key')`, dictionaries in `src/locales/{en,fr}.json`, language read from the `x-language` header.
- **Three environments — `development | staging | production`.** Real Neero calls are made **only in production**; outside production a built-in simulator is used (see "Dev gateway simulator" below).
- Active gateway is configurable at runtime (Setting singleton) and can be `none`.
- Atomic credit/debit using Mongo sessions/transactions (with graceful fallback for non-replica-set Mongo).
- Notification emails for `claim_reported`, `payment_received`, `gateway_error`, `withdrawal_failed`.
- **Postman config bundled** under `postman/` — collection + one environment per env, with login scripts that auto-save the JWT.

## Dev gateway simulator

Set `NODE_ENV=development` (or `staging`) and `DEV_TEST_PHONE=+237670000001`. All payment / withdrawal initiations are routed to an in-process simulator that returns the same response shape the real adapters return — no network calls are made. To force a particular outcome, send the header:

```
x-simulate-outcome: success   # default
x-simulate-outcome: failed
```

With `NODE_ENV=production` the simulator is bypassed entirely and the real Neero adapter (selected via Settings) is called regardless of the phone number.

## Pagination

Every list endpoint accepts:

| Query param | Default | Notes                                          |
| ----------- | ------- | ---------------------------------------------- |
| `pageNum`   | 1       | 1-based page index. Alias: `page`.             |
| `pageSize`  | 10      | Max 100 (capped via `MAX_PAGE_SIZE`). Alias: `limit`. |

Response includes `docs`, `page`, `limit`, `totalPages`, `totalDocs`, `hasNextPage`, `hasPrevPage` — straight from `mongoose-paginate-v2`.

## Project layout

```
src/
  app.js              Express app builder (middlewares, routes, error handler)
  index.js            Boot entry — connects to Mongo, seeds defaults, listens
  config/             Constants, env reading, enums
  db/                 Mongoose connect helper
  locales/            en.json, fr.json
  middlewares/        i18n, staffAuth, userAuth, roleGuard, upload, errorHandler
  models/             Staff, User, Class, Payment, Claim, Account,
                      Transaction, Withdrawal, WithdrawalAccount, Setting
  controllers/
    staff/            auth, users, classes, payments, claims, accounts,
                      withdrawals, staff (management), settings
    user/             auth, profile, payments, claims
    public/           callbacks (Neero webhook)
  routes/             index, staff.routes, user.routes, public.routes
  services/
    gateways/         index (active selector), neero, simulator
    email.service     Nodemailer (SMTP)
    sms.service       Stub provider (logs)
    notification.service  Notifies the configured staff emails
    accounting.service    Transactional credit/debit + transfer
    seed.service          Default admin + default company account on boot
  utils/              response, idGenerator, password, token
```

## Running locally

```bash
cp .env.example .env       # fill in MONGO_URI, JWT secrets, gateway keys, SMTP
npm install
npm run dev                # nodemon
# or
npm start
```

On first boot the server creates:
- a default **admin** (email/password from `.env`),
- a default **company account** (the "main account"),
- a settings document with `activeGateway` defaulting to `ACTIVE_GATEWAY` from `.env` (or `none`).

The default admin id and account id are cached on `config.defaults.*` so admin-initiated transfers always use them, per the spec.

## Authentication

```
Authorization: Bearer STF.<jwt>     # for /api/staff/*
Authorization: Bearer USR.<jwt>     # for /api/users/*
```

Staff tokens are signed with `JWT_STAFF_SECRET`, user tokens with `JWT_USER_SECRET`. The prefixes are stripped server-side before verification — a staff token will **never** validate against the user secret (and vice-versa).

## Response envelope

Every API response uses the same shape, and the HTTP status is always 200:

```json
{ "success": true,  "data": { ... }, "errorMsg": "",                 "errorCode": 0 }
{ "success": false, "data": null,    "errorMsg": "invalid_credentials", "errorCode": 2001 }
```

See `src/config/index.js` for the full `ERROR_CODES` enum.

## i18n

Set `x-language: en` or `x-language: fr` on any request. Controllers call `req.$t('key')` to look up the matching string.

## API surface (summary)

### Public

| Method | Path                          | Description                       |
| ------ | ----------------------------- | --------------------------------- |
| GET    | `/api/public/health`          | Health probe                      |
| POST   | `/api/public/callbacks/neero`   | Neero webhook                   |

### Staff (`/api/staff`)

| Method | Path                                                | Auth          | Notes                                                  |
| ------ | --------------------------------------------------- | ------------- | ------------------------------------------------------ |
| POST   | `/auth/login`                                       | —             | Returns `STF.` token + `requiresPasswordChange`        |
| GET    | `/auth/me`                                          | Staff         |                                                        |
| POST   | `/auth/change-password`                             | Staff         |                                                        |
| POST   | `/users`                                            | Manager+      | Creates user, emails or SMSs random password           |
| GET    | `/users`                                            | Staff         | `?q&classId&page&limit`                                |
| GET    | `/users/:userId`                                    | Staff         | friendly id                                            |
| PATCH  | `/users/:userId`                                    | Manager+      |                                                        |
| POST   | `/users/batch-assign-class`                         | Manager+      | `{ userIds: [...], classId }`                          |
| POST   | `/classes`                                          | Manager+      | `{ title, description?, startDate, endDate, fee, currencyCode? }` |
| GET    | `/classes` / `/classes/:classId`                    | Staff         |                                                        |
| PATCH  | `/classes/:classId`                                 | Manager+      |                                                        |
| GET    | `/payments`                                         | Staff         | `?status&method&userId&classId`                        |
| GET    | `/payments/:paymentId`                              | Staff         |                                                        |
| POST   | `/payments/manual`                                  | Manager+      | Records a cash/manual payment                          |
| GET    | `/claims` / `/claims/:claimId`                      | Staff         |                                                        |
| POST   | `/claims/:claimId/resolve`                          | Manager+      | `{ status: successful\|failed, paymentId, resolutionNote? }` (also updates the linked payment) |
| GET    | `/accounts/me`                                      | Staff         | Admin sees default company account; everyone else sees their own |
| GET    | `/accounts/statement`                               | Staff         | `?from&to`                                             |
| GET    | `/accounts`                                         | Admin         | All accounts                                           |
| POST   | `/accounts/transfer`                                | Staff         | `{ beneficiaryStaffId, amount, fee?, description? }` — admin transfers from the main account |
| GET    | `/withdrawal-accounts`                              | Non-admin     |                                                        |
| POST   | `/withdrawal-accounts`                              | Non-admin     | `{ provider: mtn\|orange, phoneNumber, holderName? }` — OTP is SMS'd |
| POST   | `/withdrawal-accounts/:id/verify`                   | Non-admin     | `{ otp }`                                              |
| POST   | `/withdrawal-accounts/:id/resend-otp`               | Non-admin     |                                                        |
| POST   | `/withdrawals`                                      | Non-admin     | `{ withdrawalAccountId, amount }` — debits first, calls active gateway, refunds on failure |
| POST   | `/staff`                                            | Admin         | Creates staff, emails credentials                      |
| GET    | `/staff` / `/staff/:staffId`                        | Admin         |                                                        |
| PATCH  | `/staff/:staffId`                                   | Admin         |                                                        |
| GET    | `/settings`                                         | Admin         | `{ activeGateway, notificationEmails }`                |
| PATCH  | `/settings`                                         | Admin         | Set `activeGateway` to `neero` or `none`               |

### User (`/api/users`)

| Method | Path                                | Auth | Notes                                                  |
| ------ | ----------------------------------- | ---- | ------------------------------------------------------ |
| POST   | `/auth/login`                       | —    | Returns `USR.` token + `requiresPasswordChange`        |
| POST   | `/auth/change-password`             | User | Reachable even when `hsCp = false` (forces first-login change) |
| GET    | `/me`                               | User | Profile + assigned class                               |
| GET    | `/my-class`                         | User |                                                        |
| GET    | `/payments`                         | User | `?status`                                              |
| GET    | `/payments/pending`                 | User |                                                        |
| POST   | `/payments/initiate`                | User | `{ classId?, phoneNumber, provider, returnUrl? }` — amount is pulled from the class |
| GET    | `/claims`                           | User |                                                        |
| POST   | `/claims`                           | User | `multipart/form-data`: `proof` file + `amount`, `currencyCode?`, `description?`, `paymentDate` |

> User endpoints other than `change-password` short-circuit with `errorCode = 2002` (`PASSWORD_CHANGE_REQUIRED`) until the user has changed their initial password.

## Payment gateways

The active gateway is stored in the `Setting` singleton and editable by the admin via `PATCH /api/staff/settings`. Allowed values: `neero`, `none`.

- If active = `none`, payment/withdrawal endpoints return `errorCode = 3001` (`gateway_unavailable`).
- On gateway errors during initiation, the notification emails configured in `Setting.notificationEmails` are emailed with the raw error.
- Callbacks are matched by either our friendly id (sent as `mchTransactionRef` / `externalReference`) or the gateway's own reference. Both Payment and Withdrawal flows are idempotent.

### Neero
Implemented from the Neero Postman collection:
- HTTP Basic auth — secret key as the username, password is empty.
- `POST /api/v1/payment-methods` to create a MoMo (MTN / Orange) `MOBILE_MONEY` payment method per phone number. The merchant `NEERO_MERCHANT` payment method id is created once in the dashboard and stored in `NEERO_MERCHANT_PM_ID`.
- `POST /api/v1/transaction-intents/cash-in` to collect (paymentType `MERCHANT_COLLECTION`).
- `POST /api/v1/transaction-intents/cash-out` to pay out (`MTN_MONEY_TRANSFER`, `ORANGE_MONEY_TRANSFER`, or `TRANSFER_TO_NEERO_PERSON` for personal Neero accounts).
- Both intents are created with `confirm: true` and `externalTransactionId` set to our internal reference.
- `GET  /api/v1/transaction-intents/:id` to verify.

## Accounting

Every credit/debit is wrapped in a Mongo session — when the deployment is a replica set, the operation is atomic. On a single-node deployment the code degrades to a non-transactional path so dev works out of the box.

A transfer between two accounts produces **two** `Transaction` rows (payer debit + beneficiary credit) sharing the same `transferId`, each with `openingBalance`/`closingBalance` snapshots. Account balance updates use `Account.applyDelta(_id, delta, session?)`, which atomically rejects debits that would overdraw.

## Environment variables

See `.env.example` — covers Mongo, two JWT secrets + prefixes, SMTP, SMS provider, the default admin/account, and gateway credentials.

## Notes for the frontend team

- The HTTP status will always be `200`. Trigger your error UI from `success === false` + `errorMsg`/`errorCode`.
- `requiresPasswordChange` is returned by both `auth/login` responses — gate the rest of the app behind it.
- `errorCode = 2002` (returned from any user endpoint except `change-password`) means the same thing and the user must complete the password change before continuing.
- Use the friendly ids (e.g. `USR-…`, `PAY-…`) in URL paths; never the Mongo `_id`.
