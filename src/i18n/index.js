
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const en = JSON.parse(await fs.readFile(path.join(__dirname, 'en.json'), 'utf8'));
const fr = JSON.parse(await fs.readFile(path.join(__dirname, 'fr.json'), 'utf8'));


// import en from './en.json' assert { type: 'json' };
// import fr from './fr.json' assert { type: 'json' };
const supportedLanguages = ['en', 'fr'];
const defaultLanguage = 'en';

/**
 * Get the translation for a specific key and language from the request.
 * @param {*} req - The request object containing headers with language information.
 * @param {*} key - The translation key to look up.
 * @returns The translated string or the key itself if not found.
 */
export const getTranslation = (req, key) => {
  let lang = req.headers['x-language']?.split(',')[0] || defaultLanguage;
  if (!supportedLanguages.includes(lang)) {
    lang = defaultLanguage;
  }

  if(lang == 'fr') {
    return fr[key] || en[key] || key;
  }else{
    return en[key]  || key;
  }
};
