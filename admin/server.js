import express from 'express';
import multer from 'multer';
import sanitizeHtml from 'sanitize-html';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { makeDb } from './lib/db.js';

// Matches the Quill toolbar configured in the product editor. Descriptions
// are rendered as raw HTML on the public 11ty site, so this is sanitized
// server-side rather than trusting the editor's HTML export directly (see
// https://github.com/advisories/GHSA-v3m3-f69x-jf25 - unpatched XSS in
// Quill's HTML export as of 2.0.3).
function sanitizeDescription(html) {
  return sanitizeHtml(html || '', {
    allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ol', 'ul', 'li', 'a'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, '_data');
const imgProductDir = path.join(rootDir, 'img-product');
const imgDir = path.join(rootDir, 'img');

const db = makeDb(dataDir);
const app = express();
const PORT = process.env.PORT || 4321;

app.use(express.json({ limit: '5mb' }));

// ---- static assets ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/quill', express.static(path.join(__dirname, 'node_modules/quill/dist')));
app.use('/vendor/sortablejs', express.static(path.join(__dirname, 'node_modules/sortablejs')));
app.use('/img-product', express.static(imgProductDir));
app.use('/img', express.static(imgDir));
app.use('/assets/css', express.static(path.join(rootDir, 'css')));

function extOf(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext || '.jpg';
}

function productImageStorage() {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(imgProductDir, req.params.id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      cb(null, `${randomUUID()}${extOf(file.originalname)}`);
    },
  });
}
const uploadProductImage = multer({ storage: productImageStorage() });

const siteImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(imgDir, 'site');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${randomUUID()}${extOf(file.originalname)}`);
  },
});
const uploadSiteImage = multer({ storage: siteImageStorage });

// ---- products ----

app.get('/api/products', (req, res) => {
  const products = db.getProducts().sort((a, b) => a.order - b.order);
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const product = db.getProducts().find((p) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'not found' });
  res.json(product);
});

app.put('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const products = db.getProducts();
  const existing = products.find((p) => p.id === id);
  const now = new Date().toISOString();

  const body = req.body || {};
  const product = {
    id,
    title: body.title || '',
    description: sanitizeDescription(body.description),
    images: Array.isArray(body.images) ? body.images : [],
    mainImageId: body.mainImageId || null,
    featured: !!body.featured,
    categories: Array.isArray(body.categories) ? body.categories : [],
    externalLink: {
      label: body.externalLink?.label || '',
      url: body.externalLink?.url || '',
    },
    order: existing ? existing.order : products.length,
    createdAt: existing ? existing.createdAt : now,
    updatedAt: now,
  };

  if (existing) {
    Object.assign(existing, product);
  } else {
    products.push(product);
  }
  db.saveProducts(products);
  res.json(product);
});

app.delete('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const products = db.getProducts().filter((p) => p.id !== id);
  db.saveProducts(products);

  const dir = path.join(imgProductDir, id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  res.json({ ok: true });
});

app.post('/api/products/reorder', (req, res) => {
  const { order } = req.body || {};
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of ids' });

  const products = db.getProducts();
  order.forEach((id, index) => {
    const product = products.find((p) => p.id === id);
    if (product) product.order = index;
  });
  db.saveProducts(products);
  res.json(products.sort((a, b) => a.order - b.order));
});

// ---- product images ----

app.post('/api/products/:id/images', uploadProductImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image uploaded' });
  const image = {
    id: path.parse(req.file.filename).name,
    filename: req.file.filename,
    url: `/img-product/${req.params.id}/${req.file.filename}`,
  };
  res.json(image);
});

app.delete('/api/products/:id/images/:imageId', (req, res) => {
  const dir = path.join(imgProductDir, req.params.id);
  if (fs.existsSync(dir)) {
    for (const filename of fs.readdirSync(dir)) {
      if (path.parse(filename).name === req.params.imageId) {
        fs.unlinkSync(path.join(dir, filename));
      }
    }
  }
  res.json({ ok: true });
});

// ---- categories ----

app.get('/api/categories', (req, res) => {
  res.json(db.getCategories());
});

app.post('/api/categories', (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'name is required' });
  const categories = db.getCategories();
  if (!categories.includes(name)) {
    categories.push(name);
    db.saveCategories(categories);
  }
  res.json(categories);
});

app.delete('/api/categories/:name', (req, res) => {
  const categories = db.getCategories().filter((c) => c !== req.params.name);
  db.saveCategories(categories);
  res.json(categories);
});

// ---- settings ----

app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', (req, res) => {
  const body = req.body || {};
  const settings = {
    title: body.title || '',
    description: body.description || '',
    seo: {
      metaTitle: body.seo?.metaTitle || '',
      metaDescription: body.seo?.metaDescription || '',
      ogImage: body.seo?.ogImage || '',
    },
    contact: Array.isArray(body.contact) ? body.contact : [],
    social: Array.isArray(body.social) ? body.social : [],
  };
  db.saveSettings(settings);
  res.json(settings);
});

app.post('/api/settings/image', uploadSiteImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no image uploaded' });
  res.json({ url: `/img/site/${req.file.filename}` });
});

app.listen(PORT, () => {
  console.log(`Admin app running at http://localhost:${PORT}`);
});
