/**
 * Built-in manager expense categories seeded at boot.
 * `categoryKey` is stored on Expense.categoryId.
 */
export const BUILTIN_EXPENSE_CATEGORIES = Object.freeze([
  { categoryKey: 'supplies', label: 'Fournitures & bureau', icon: 'Package', sortOrder: 10 },
  { categoryKey: 'electricity', label: 'Électricité', icon: 'Zap', sortOrder: 20 },
  { categoryKey: 'water', label: 'Eau', icon: 'Droplets', sortOrder: 30 },
  { categoryKey: 'internet', label: 'Internet & télécom', icon: 'Wifi', sortOrder: 40 },
  { categoryKey: 'maintenance', label: 'Entretien & réparations', icon: 'Wrench', sortOrder: 50 },
  { categoryKey: 'logistics', label: 'Transport & livraison', icon: 'Truck', sortOrder: 60 },
  { categoryKey: 'training', label: 'Formation & pédagogique', icon: 'GraduationCap', sortOrder: 70 },
  { categoryKey: 'manager_allocation', label: 'Allocation manager', icon: 'HandCoins', sortOrder: 80 },
]);

export const EXPENSE_CATEGORY_ICONS = Object.freeze([
  'Package',
  'Zap',
  'Droplets',
  'Wifi',
  'Wrench',
  'Truck',
  'GraduationCap',
  'HandCoins',
  'MoreHorizontal',
]);
