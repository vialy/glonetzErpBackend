import { ExpenseCategory } from '../models/index.js';
import { BUILTIN_EXPENSE_CATEGORIES } from '../config/expenseCategoryMetadata.js';

/**
 * Seeds built-in manager expense categories (idempotent).
 */
export async function seedDefaultExpenseCategories() {
  let created = 0;

  for (const item of BUILTIN_EXPENSE_CATEGORIES) {
    const exists = await ExpenseCategory.findOne({ categoryKey: item.categoryKey });
    if (exists) continue;
    await ExpenseCategory.create({
      categoryKey: item.categoryKey,
      label: item.label,
      icon: item.icon,
      isBuiltin: true,
      isActive: true,
      sortOrder: item.sortOrder,
    });
    created += 1;
  }

  if (created > 0) {
    // eslint-disable-next-line no-console
    console.log(`[seed:expense-categories] ${created} built-in categor${created > 1 ? 'ies' : 'y'} created`);
  } else {
    // eslint-disable-next-line no-console
    console.log('[seed:expense-categories] built-in categories already present');
  }
}

export default seedDefaultExpenseCategories;
