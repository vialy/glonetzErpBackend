import 'dotenv/config';

const env = (key, fallback = undefined) => {
  const v = process.env[key];
  if (v === undefined || v === null || v === '') return fallback;
  return v;
};

/**
 * Supported environments.
 *
 *   - development : local dev. Real gateways are NEVER called; the in-process
 *                   simulator is used so the team can ship features without
 *                   incurring real charges.
 *   - staging     : same as development w.r.t. gateways (so QA is free), but
 *                   may run against a hosted DB / SMTP.
 *   - production  : real gateway calls.
 *
 * The boolean `gatewayEnabled` derived below is what code paths actually key
 * off — every gateway call should check it first.
 */
const SUPPORTED_ENVS = ['development', 'staging', 'production'];
const rawEnv = env('NODE_ENV', 'development');
const resolvedEnv = SUPPORTED_ENVS.includes(rawEnv) ? rawEnv : 'development';
if (rawEnv !== resolvedEnv) {
  // eslint-disable-next-line no-console
  console.warn(`[config] NODE_ENV="${rawEnv}" not recognized, falling back to "development"`);
}
export const ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
});

export const STAFF_ROLES = Object.freeze({
  ADMIN: 1000,
  MANAGER: 600,
  AUDITOR: 500,
  SUPPORT: 200,
});

export const STAFF_ROLE_NAMES = Object.freeze({
  1000: 'admin',
  600: 'manager',
  500: 'auditor',
  200: 'support',
});

export const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
});

export const PAYMENT_METHODS = Object.freeze({
  ONLINE: 'online',     // through a gateway
  MANUAL: 'manual',     // recorded manually by staff (cash, etc.)
});

export const PAYMENT_PROVIDERS = Object.freeze({
  NEERO: 'neero',
  MANUAL: 'manual',
  NONE: 'none',
});

export const CLAIM_STATUSES = Object.freeze({
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
});

export const TRANSACTION_TYPES = Object.freeze({
  CREDIT: 'credit',
  DEBIT: 'debit',
});

export const TRANSACTION_SOURCES = Object.freeze({
  PAYMENT: 'payment',
  TRANSFER: 'transfer',
  WITHDRAWAL: 'withdrawal',
  ADJUSTMENT: 'adjustment',
});

export const WITHDRAWAL_STATUSES = Object.freeze({
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
});

export const WITHDRAWAL_ACCOUNT_PROVIDERS = Object.freeze({
  MTN: 'mtn',
  ORANGE: 'orange',
});

export const NETWORK_OPERATORS = Object.freeze({
  MTN: 'mtn',
  ORANGE: 'orange',
  NONE: 'none',
});

export const NOTIFICATION_EVENTS = Object.freeze({
  CLAIM_REPORTED: 'claim_reported',
  PAYMENT_RECEIVED: 'payment_received',
  GATEWAY_ERROR: 'gateway_error',
  WITHDRAWAL_FAILED: 'withdrawal_failed',
});

// Error codes — the frontend keys off these (HTTP status is always 200)
export const ERROR_CODES = Object.freeze({
  OK: 0,
  GENERIC: 1,
  VALIDATION: 1001,
  UNAUTHORIZED: 1002,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  CONFLICT: 1005,
  RATE_LIMITED: 1006,
  INVALID_CREDENTIALS: 2001,
  PASSWORD_CHANGE_REQUIRED: 2002,
  INVALID_TOKEN: 2003,
  EXPIRED_TOKEN: 2004,
  ACCOUNT_DISABLED: 2005,
  GATEWAY_UNAVAILABLE: 3001,
  GATEWAY_ERROR: 3002,
  INSUFFICIENT_FUNDS: 3003,
  PAYMENT_NOT_FOUND: 3004,
  CLAIM_NOT_FOUND: 3005,
  OTP_INVALID: 4001,
  OTP_EXPIRED: 4002,
});

// User-friendly ID prefixes (used by utils/idGenerator)
export const ID_PREFIXES = Object.freeze({
  user: 'USR',
  staff: 'STF',
  class: 'CLS',
  payment: 'PAY',
  claim: 'CLM',
  transfer: 'TRF',
  transaction: 'TXN',
  account: 'ACC',
  withdrawal: 'WDR',
  withdrawalAccount: 'WDA',
});

const config = {
  env: resolvedEnv,
  isProduction: resolvedEnv === ENVIRONMENTS.PRODUCTION,
  isStaging: resolvedEnv === ENVIRONMENTS.STAGING,
  isDevelopment: resolvedEnv === ENVIRONMENTS.DEVELOPMENT,
  // Real gateway calls are only made in production.
  gatewayEnabled: resolvedEnv === ENVIRONMENTS.PRODUCTION,
  // The dev test number — when used in payments/withdrawals outside production,
  // the call is routed through the simulator and never hits a real gateway.
  devTestPhone: env('DEV_TEST_PHONE', '+237670000001'),
  port: parseInt(env('PORT', '4000'), 10),
  appName: env('APP_NAME', 'Glonez'),
  appBaseUrl: env('APP_BASE_URL', 'http://localhost:4000'),

  mongo: {
    uri: env('MONGO_URI', 'mongodb://localhost:27017/glonez'),
  },

  jwt: {
    staffSecret: env('JWT_STAFF_SECRET', 'change-me-staff'),
    userSecret: env('JWT_USER_SECRET', 'change-me-user'),
    staffExpiresIn: env('JWT_STAFF_EXPIRES_IN', '12h'),
    userExpiresIn: env('JWT_USER_EXPIRES_IN', '7d'),
    prefixStaff: env('TOKEN_PREFIX_STAFF', 'STF'),
    prefixUser: env('TOKEN_PREFIX_USER', 'USR'),
  },

  defaults: {
    admin: {
      email: env('DEFAULT_ADMIN_EMAIL', 'admin@glonez.com'),
      password: env('DEFAULT_ADMIN_PASSWORD', 'ChangeMe123!'),
      name: env('DEFAULT_ADMIN_NAME', 'Default Admin'),
    },
    account: {
      name: env('DEFAULT_ACCOUNT_NAME', 'Main Company Account'),
      currency: env('DEFAULT_ACCOUNT_CURRENCY', 'XAF'),
    },
    // These are populated after seed runs and exposed at runtime so admin-driven
    // transfers can use the defaultAdmin id + default accountId.
    defaultAdminId: null,
    defaultAdminFriendlyId: null,
    defaultAccountId: null,
    defaultAccountFriendlyId: null,
  },

  smtp: {
    host: env('SMTP_HOST'),
    port: parseInt(env('SMTP_PORT', '587'), 10),
    secure: env('SMTP_SECURE', 'false') === 'true',
    user: env('SMTP_USER'),
    pass: env('SMTP_PASS'),
    from: env('SMTP_FROM', 'Glonez <no-reply@glonez.local>'),
  },

  sms: {
    provider: env('SMS_PROVIDER', 'stub'),
    from: env('SMS_FROM', 'Glonez'),
    twilio: {
      accountSid: env('TWILIO_ACCOUNT_SID'),
      authToken: env('TWILIO_AUTH_TOKEN'),
      from: env('TWILIO_FROM'),
      messagingServiceSid: env('TWILIO_MESSAGING_SERVICE_SID'),
    },
  },

  gateways: {
    activeDefault: env('ACTIVE_GATEWAY', PAYMENT_PROVIDERS.NONE),
    neero: {
      baseUrl: env('NEERO_BASE_URL', 'https://api.neero.tech/payment-gateway'),
      secretKey: env('NEERO_SECRET_KEY'),
      merchantPmId: env('NEERO_MERCHANT_PM_ID'),
      webhookSecret: env('NEERO_WEBHOOK_SECRET'),
    },
  },

  uploads: {
    dir: env('UPLOAD_DIR', 'uploads'),
    maxSizeMb: parseInt(env('MAX_UPLOAD_SIZE_MB', '10'), 10),
  },

  pagination: {
    defaultPageNum: parseInt(env('DEFAULT_PAGE_NUM', '1'), 10),
    defaultPageSize: parseInt(env('DEFAULT_PAGE_SIZE', '10'), 10),
    maxPageSize: parseInt(env('MAX_PAGE_SIZE', '100'), 10),
  },

  currency: {
    default: 'XAF',
  },

  // Locked enums / constants — also re-exported below as named exports so
  // callers can pick the form they prefer.
  STAFF_ROLES,
  STAFF_ROLE_NAMES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_PROVIDERS,
  CLAIM_STATUSES,
  TRANSACTION_TYPES,
  TRANSACTION_SOURCES,
  WITHDRAWAL_STATUSES,
  WITHDRAWAL_ACCOUNT_PROVIDERS,
  NOTIFICATION_EVENTS,
  ERROR_CODES,
  ID_PREFIXES,
};

export default config;
