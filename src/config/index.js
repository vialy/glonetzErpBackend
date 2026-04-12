import dotenv from 'dotenv'
dotenv.config()

export default{
  authService: Object.freeze({
    authRequestCallbackPath: "/auth-transaction-callback/",
    baseUrl: process.env.AUTH_BASE_URL,
    createAuthRequestPath: '/sapi/auth/challenge/create',
    getAuthRequestPath: '/sapi/auth/challenge/consume'
  }),
  tranzak: (() => {
    const baseUrl = process.env.TRANZAK_BASE_URL || "http://dsapi.tranzak.me";
    return Object.freeze({
      token: '',
      appId: process.env.TRANZAK_APP_ID,
      appKey: process.env.TRANZAK_APP_KEY,
      BASE_URL: baseUrl,
      CREATE_REQUEST: '/xp021/request/create-mobile-wallet-charge',
      GET_REQUEST: '/xp021/request/details?requestId=',
      GENERATE_TOKEN: '/auth/token'
    })
  })(),
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
    platformPayment: "platform_payment",
    accountId: "system_account",
  },
  userConfig: Object.freeze({

  }),
  db: {
    url: process.env.MONGO_URI,
    user: process.env.MONGO_USERNAME,
    pass: process.env.MONGO_PASS
  }
};
