import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// JSON imports — using createRequire keeps us portable across Node versions
// without needing `with { type: 'json' }` import attributes.
const en = require('../locales/en.json');
const fr = require('../locales/fr.json');

const DICTS = { en, fr };
const DEFAULT_LANG = 'en';

/**
 * i18n middleware.
 *
 * Reads `x-language` from the request header (en | fr; defaults to `en`) and
 * attaches:
 *   - req.lang  : the resolved language code
 *   - req.$t(key, vars?) : translator
 *
 * The translator falls back to:
 *   1. the current dictionary,
 *   2. the English dictionary,
 *   3. the raw key (so error messages are never empty).
 *
 * Optional `vars` are interpolated into the resolved string with the form
 * `{name}`, e.g.  req.$t('hello_user', { name: 'Ada' })
 */
export default function i18nMiddleware(req, _res, next) {
  const headerVal = (req.headers['x-language'] || '').toString().toLowerCase();
  const lang = DICTS[headerVal] ? headerVal : DEFAULT_LANG;
  req.lang = lang;

  req.$t = function $t(key, vars) {
    if (!key) return '';
    const primary = DICTS[lang] || DICTS[DEFAULT_LANG];
    let template = primary[key];
    if (template === undefined) template = DICTS[DEFAULT_LANG][key];
    if (template === undefined) return key;

    if (vars && typeof vars === 'object') {
      return template.replace(/\{(\w+)\}/g, (_, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`
      );
    }
    return template;
  };

  next();
}
