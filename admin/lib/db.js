import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULTS = {
  'products.json': [],
  'categories.json': [],
  'settings.json': {
    title: '',
    description: '',
    seo: {
      metaTitle: '',
      metaDescription: '',
      ogImage: '',
    },
    contact: [],
    social: [],
  },
};

export function makeDb(dataDir) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  function filePath(name) {
    return path.join(dataDir, name);
  }

  function read(name) {
    const file = filePath(name);
    if (!fs.existsSync(file)) {
      return structuredClone(DEFAULTS[name]);
    }
    const raw = fs.readFileSync(file, 'utf-8').trim();
    if (!raw) {
      return structuredClone(DEFAULTS[name]);
    }
    return JSON.parse(raw);
  }

  function write(name, data) {
    fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2) + '\n');
  }

  return {
    getProducts: () => read('products.json'),
    saveProducts: (products) => write('products.json', products),
    getCategories: () => read('categories.json'),
    saveCategories: (categories) => write('categories.json', categories),
    getSettings: () => read('settings.json'),
    saveSettings: (settings) => write('settings.json', settings),
  };
}
