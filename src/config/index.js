import dotenv from 'dotenv'
dotenv.config()

export default{
  authService: Object.freeze({
    authRequestCallbackPath: "/auth-transaction-callback/",
    baseUrl: process.env.AUTH_BASE_URL,
    createAuthRequestPath: '/sapi/auth/challenge/create',
    getAuthRequestPath: '/sapi/auth/challenge/consume'
  }),
  tranzak: Object.freeze({
    token: '',
    sandboxToken: '',
    appId: process.env.TRANZAK_APP_ID,
    appKey: process.env.TRANZAK_APP_KEY,
    sandBoxAppId: process.env.TRANZAK_SANDBOX_APP_ID,
    sandBoxAppKey: process.env.TRANZAK_SANDBOX_APP_KEY,
    BASE_URL: "http://dsapi.tranzak.me",
    SANDBOX_BASE_URL: "http://sandbox.dsapi.tranzak.me",
    CREATE_REQUEST: '/request/create-mobile-wallet-charge',
    GET_REQUEST: '/request/details'
  }),
  walletUrls: Object.freeze({
    BASE_URL: 'http://localhost:5001/v1',
    DEBIT_USER: '/services/transaction/debit',
    REFUND_USER: '/services/transaction/refund'
  }),
  camtelUrls: Object.freeze({
    BASE_URL: 'http://localhost:5000/v1',
    BUY_BUNDLE: '/users/purchase'
  }),
  server: {
    port: process.env.PORT || 4050,
    baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 4050}`
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '1m',
  },
  bcrypt: {
    saltRounds: 10,
  },
  accountTypes: {
    PRIMARY: 'primary',
  },
  systemUser: {
    userId: "system_user",
    accountId: "system_account"
  },
  userConfig: Object.freeze({
    defaultAirtimeUserId: 'BB-00001'
  }),
  db: {
    url: process.env.MONGO_URI,
    user: process.env.MONGO_USERNAME,
    pass: process.env.MONGO_PASS
  }
};
