import { Account } from '../models/index.js';
import config from '../config/index.js';

/**
 * Seeds the default company account.
 *
 * Behaviour:
 *   - If a default `company` account already exists, it is reused (idempotent).
 *   - Otherwise a new one is created from `config.defaults.account` values
 *     (name + currency), with a starting balance of 0.
 *   - The default company account is the one shared by all admin staff. When
 *     a user makes a payment, this account is credited; when admins move money
 *     out, it is debited.
 *   - The resulting account's `_id` and friendly `accountId` are cached on
 *     `config.defaults` so transfers initiated by admins can target it without
 *     re-querying.
 *
 * @returns {Promise<{account: import('mongoose').Document, created: boolean}>}
 */
export async function seedDefaultAccount() {
  let account = await Account.findDefaultCompany();
  let created = false;

  if (!account) {
    account = await Account.create({
      type: 'company',
      name: config.defaults.account.name,
      currencyCode: config.defaults.account.currency,
      balance: 0,
      isDefault: true,
      isActive: true,
    });
    created = true;
    // eslint-disable-next-line no-console
    console.log(`[seed:account] default company account created: ${account.accountId}`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[seed:account] default company account already exists: ${account.accountId}`);
  }

  // Cache on config so admin-initiated transfers know which account is the
  // company default without re-querying.
  config.defaults.defaultAccountId = account._id;
  config.defaults.defaultAccountFriendlyId = account.accountId;

  return { account, created };
}

export default seedDefaultAccount;
