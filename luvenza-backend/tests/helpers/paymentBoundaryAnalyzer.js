const fs = require('node:fs');
const path = require('node:path');

const approved = new Map([
    ['repositories/paymentRepository.js', ['payment']],
    ['repositories/paymentWebhookEventRepository.js', ['paymentWebhookEvent']],
    ['repositories/paymentWebhookEventCompletion.js', ['paymentWebhookEvent']],
    ['repositories/paymentIndexReadinessRepository.js', ['payment', 'paymentWebhookEvent']]
]);
const modelFiles = new Set(['models/payment.js', 'models/paymentWebhookEvent.js']);
const repos = new Set([...approved.keys()].filter(file => file.startsWith('repositories/')));
const testSeamProviders = new Set([
    'repositories/paymentRepository.js',
    'repositories/paymentWebhookEventRepository.js',
    'repositories/paymentWebhookEventCompletion.js',
    'utils/paymentWebhookProcessing.js'
]);
const readOnlyModules = new Set([
    'config/db.js', 'config/paymentIndexReadiness.js',
    'repositories/paymentIndexReadinessRepository.js', 'server.js'
]);
const repositoryMethods = new Map([
    ['repositories/paymentRepository.js', new Set(['findOne', 'findOneAndUpdate'])],
    ['repositories/paymentWebhookEventRepository.js', new Set(['findOne', 'findOneAndUpdate'])],
    ['repositories/paymentWebhookEventCompletion.js', new Set(['findOneAndUpdate'])],
    ['repositories/paymentIndexReadinessRepository.js', new Set(['listIndexes', 'toArray'])]
]);
const writeMethods = new Set([
    'save', 'create', 'insertOne', 'insertMany', 'updateOne', 'updateMany',
    'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'bulkWrite',
    'deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove',
    'createIndex', 'createIndexes', 'dropIndex', 'dropIndexes', 'syncIndexes', 'ensureIndexes'
]);
const nativeWriteMethods = new Set([
    'insertOne', 'insertMany', 'updateOne', 'updateMany', 'replaceOne',
    'findOneAndUpdate', 'findOneAndReplace', 'deleteOne', 'deleteMany',
    'findOneAndDelete', 'bulkWrite', 'createIndex', 'createIndexes', 'dropIndex', 'dropIndexes'
]);

const tokenize = source => {
    const tokens = [];
    for (let i = 0; i < source.length;) {
        if (/\s/.test(source[i])) { i++; continue; }
        if (source[i] === '/' && source[i + 1] === '/') {
            i = source.indexOf('\n', i + 2); if (i < 0) break; continue;
        }
        if (source[i] === '/' && source[i + 1] === '*') {
            const end = source.indexOf('*/', i + 2); i = end < 0 ? source.length : end + 2; continue;
        }
        if (["'", '"', '`'].includes(source[i])) {
            const quote = source[i++]; let value = '';
            while (i < source.length && source[i] !== quote) {
                if (source[i] === '\\' && i + 1 < source.length) value += source[++i];
                else value += source[i];
                i++;
            }
            i++; tokens.push({ type: 'string', value }); continue;
        }
        const id = source.slice(i).match(/^[A-Za-z_$][\w$]*/);
        if (id) { tokens.push({ type: 'id', value: id[0] }); i += id[0].length; continue; }
        tokens.push({ type: 'p', value: source[i++] });
    }
    return tokens;
};

const collectProductionFiles = root => {
    const output = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        if (['node_modules', '.git', 'tests', 'docs', 'coverage'].includes(entry.name)) return;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.isFile() && /\.(js|cjs|mjs)$/.test(entry.name)) output.push(file);
    });
    walk(root); return output;
};

const imports = tokens => {
    const found = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].value === 'require' && tokens[i + 1]?.value === '(' && tokens[i + 2]?.type === 'string') found.push(tokens[i + 2].value);
        if (tokens[i].value === 'import' || tokens[i].value === 'export') {
            for (let j = i + 1; j < Math.min(tokens.length, i + 40); j++) {
                if (tokens[j].value === ';' || (j > i + 1 && ['import', 'export'].includes(tokens[j].value))) break;
                if (tokens[j].value === '(' && tokens[i].value === 'import' && tokens[j + 1]?.type === 'string') { found.push(tokens[j + 1].value); break; }
                if (tokens[j].value === 'from' && tokens[j + 1]?.type === 'string') { found.push(tokens[j + 1].value); break; }
                if (tokens[j].type === 'string' && tokens[i].value === 'import') { found.push(tokens[j].value); break; }
            }
        }
    }
    return found;
};

const analyzeSource = ({ file, source }) => {
    const name = file.replace(/\\/g, '/'); const ts = tokenize(source); const bad = [];
    const allowed = approved.get(name) || [];
    const modelDef = modelFiles.has(name); const repo = repos.has(name);
    const modelNameStrings = ts.filter(token => token.type === 'string').map(token => token.value);
    const hasPaymentModelName = modelNameStrings.some(value => ['Payment', 'PaymentWebhookEvent'].includes(value));
    const collectionHandles = new Set();
    const modelReceivers = new Set(['Payment', 'PaymentWebhookEvent', 'PaymentModel', 'EventModel']);
    for (let i = 0; i < ts.length - 2; i++) {
        if (modelReceivers.has(ts[i + 2]?.value) && ts[i + 1]?.value === '=') modelReceivers.add(ts[i].value);
    }
    for (const spec of imports(ts)) {
        const s = spec.toLowerCase().replace(/\\/g, '/');
        const parts = s.split('/');
        const containsModelAlias = parts.includes('models') || /models?/i.test(s);
        if (containsModelAlias && /paymentwebhookevent/i.test(s)) {
            if (!allowed.some(value => value.toLowerCase() === 'paymentwebhookevent')) bad.push('direct PaymentWebhookEvent import');
        } else if (containsModelAlias && /payment/i.test(s)
            && !allowed.some(value => value.toLowerCase() === 'payment')) bad.push('direct Payment import');
        if (s.includes('paymentwebhookeventcompletion') && name !== 'utils/paymentWebhookProcessing.js') bad.push('completion import outside processor');
    }
    if (!modelDef) for (const modelName of ['Payment', 'PaymentWebhookEvent']) {
        const capability = modelName === 'Payment' ? 'payment' : 'paymentWebhookEvent';
        if (!allowed.includes(capability) && ts.some(t => t.type === 'id' && t.value === modelName)) bad.push(`payment model identifier ${modelName} outside boundary`);
    }
    for (let i = 0; i < ts.length; i++) {
        const t = ts[i];
        if (readOnlyModules.has(name) && t.type === 'id'
            && (writeMethods.has(t.value) || nativeWriteMethods.has(t.value))) {
            bad.push(`write operation ${t.value} is forbidden in read-only startup/readiness code`);
        }
        if (!modelDef && hasPaymentModelName
            && ((t.type === 'id' && t.value === 'model')
                || (t.type === 'string' && t.value === 'model' && ts[i - 1]?.value === '['))) {
            bad.push('Mongoose model registry access for a payment model');
        }

        // Record simple local handles acquired from literal payment collections.
        if (t.type === 'id' && ts[i + 1]?.value === '=') {
            for (let j = i + 2; j < Math.min(ts.length, i + 30) && ts[j].value !== ';'; j++) {
                if (ts[j].value === 'collection' && ts[j + 1]?.value === '('
                    && ts[j + 2]?.type === 'string'
                    && ['payments', 'paymentwebhookevents'].includes(ts[j + 2].value.toLowerCase())) {
                    collectionHandles.add(t.value);
                    break;
                }
                if (modelReceivers.has(ts[j].value)
                    && ts[j + 1]?.value === '.' && ts[j + 2]?.value === 'collection') {
                    collectionHandles.add(t.value);
                    break;
                }
            }
        }

        if (t.value === 'collection' && ts[i + 1]?.value === '(' && ts[i + 2]?.type === 'string'
            && ['payments', 'paymentwebhookevents'].includes(ts[i + 2].value.toLowerCase())) {
            for (let j = i + 3; j < Math.min(ts.length, i + 15); j++) {
                if (ts[j].value === '.' && nativeWriteMethods.has(ts[j + 1]?.value)) bad.push('native payment collection write');
                if (ts[j].value === ';') break;
            }
        }
        if (collectionHandles.has(t.value)
            && (ts[i + 1]?.value === '.' || ts[i + 1]?.value === '[')) {
            const method = ts[i + 1]?.value === '.' ? ts[i + 2]?.value : ts[i + 2]?.value;
            if (nativeWriteMethods.has(method)) bad.push('stored native payment collection handle is used to write');
        }
        if (!modelDef && modelReceivers.has(t.value)
            && ts[i + 1]?.value === '.' && ts[i + 2]?.value === 'collection'
            && ts[i + 3]?.value === '.' && nativeWriteMethods.has(ts[i + 4]?.value)) {
            bad.push('native model collection write');
        }
        if (t.value === 'command' && ts[i + 1]?.value === '(') {
            const end = Math.min(ts.length, i + 40);
            const commandMentionsPaymentCollection = ts.slice(i + 2, end).some(part =>
                part.type === 'string' && ['payments', 'paymentwebhookevents'].includes(part.value.toLowerCase())
            );
            if (commandMentionsPaymentCollection) bad.push('native database command references a payment collection');
        }
        if (t.value === 'middleware' && ts[i + 1]?.value === ':' && ts[i + 2]?.value === 'false') bad.push('middleware skip option');
        if (t.value === 'middleware' && ts[i + 1]?.value === ':' && ts[i + 2]?.value === '{') {
            for (let j = i + 3; j < Math.min(ts.length, i + 12); j++) if (ts[j].value === 'pre' && ts[j + 1]?.value === ':' && ts[j + 2]?.value === 'false') bad.push('middleware skip option');
        }
        if (t.value === '[' && ts[i + 1]?.type === 'string' && ts[i + 1]?.value === 'middleware'
            && ts[i + 2]?.value === ']' && ts[i + 3]?.value === ':'
            && (ts[i + 4]?.value === 'false' || (ts[i + 4]?.value === '{'
                && ts.slice(i + 5, i + 14).some((part, offset, slice) =>
                    part.value === 'pre' && slice[offset + 1]?.value === ':' && slice[offset + 2]?.value === 'false')))) {
            bad.push('computed middleware skip option');
        }
        if ((t.value === '__testOnly'
            || ['createPaymentRepository', 'createPaymentWebhookEventRepository', 'createClaimCompletion', 'createWebhookProcessor'].includes(t.value))
            && !testSeamProviders.has(name)) bad.push('test seam reference');
        if (t.value === 'completeClaimedWebhookEvent' && !['utils/paymentWebhookProcessing.js', 'repositories/paymentWebhookEventCompletion.js'].includes(name)) bad.push('completion used outside workflow');
        if (repo && t.type === 'id' && modelReceivers.has(t.value)
            && ts[i + 1]?.value === '.' && writeMethods.has(ts[i + 2]?.value)
            && !repositoryMethods.get(name)?.has(ts[i + 2].value)) {
            bad.push(`unapproved model write ${ts[i + 2].value}`);
        }
        if (!modelDef && t.type === 'id' && modelReceivers.has(t.value)
            && ts[i + 1]?.value === '.' && writeMethods.has(ts[i + 2]?.value)
            && !repositoryMethods.get(name)?.has(ts[i + 2].value)) {
            bad.push(`unapproved model write ${ts[i + 2].value}`);
        }
        if (!modelDef && t.type === 'id' && modelReceivers.has(t.value)
            && ts[i + 1]?.value === '[' && ts[i + 2]?.type === 'string'
            && writeMethods.has(ts[i + 2].value)
            && !repositoryMethods.get(name)?.has(ts[i + 2].value)) {
            bad.push(`unapproved computed model write ${ts[i + 2].value}`);
        }
        if (repo && t.type === 'id' && modelReceivers.has(t.value)
            && ts[i + 1]?.value === '[' && ts[i + 2]?.type === 'string'
            && writeMethods.has(ts[i + 2].value)
            && !repositoryMethods.get(name)?.has(ts[i + 2].value)) {
            bad.push(`unapproved computed model write ${ts[i + 2].value}`);
        }
        if (repo && t.type === 'id' && modelReceivers.has(t.value)
            && ts[i + 1]?.value === '.' && ts[i + 2]?.value === 'collection'
            && ts[i + 3]?.value === '.' && nativeWriteMethods.has(ts[i + 4]?.value)) {
            bad.push('native payment model collection write');
        }
    }
    return [...new Set(bad)];
};

const analyzeTree = root => collectProductionFiles(root).flatMap(absolute => {
    const file = path.relative(root, absolute).split(path.sep).join('/');
    return analyzeSource({ file, source: fs.readFileSync(absolute, 'utf8') }).map(message => ({ file, message }));
});

module.exports = { tokenize, imports, collectProductionFiles, analyzeSource, analyzeTree };
