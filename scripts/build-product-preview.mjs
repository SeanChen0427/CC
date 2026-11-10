import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const target = join(root, '.local/product-preview-build');
mkdirSync(target, {recursive:true});
const source = join(root, 'services/product-preview');
for (const name of ['api', 'public', 'package.json', 'vercel.json']) cpSync(join(source, name), join(target, name), {recursive:true});
writeFileSync(join(target, 'preview.mjs'), readFileSync(join(source, 'preview.mjs'), 'utf8').replace("'../../shared/product-link.js'", "'./product-link.js'"));
writeFileSync(join(target, 'api/product.js'), readFileSync(join(source, 'api/product.js'), 'utf8').replace("'../../../deployment.json'", "'../deployment.json'"));
cpSync(join(root, 'shared/product-link.js'), join(target, 'product-link.js'));
const {apiURL, publishableKey, customerURL, productPreviewURL} = JSON.parse(readFileSync(join(root, 'deployment.json'), 'utf8'));
if (!productPreviewURL?.startsWith('https://')) throw new Error('Missing product preview URL');
writeFileSync(join(target, 'deployment.json'), JSON.stringify({apiURL, publishableKey, customerURL, productPreviewURL}, null, 2) + '\n');
console.log('Built product preview service (curated public files only)');
