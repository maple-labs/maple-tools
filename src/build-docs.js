const fs = require('fs');
const assert = require('assert');
const path = require('path');
const handlebars = require('handlebars');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

const args = require('minimist')(process.argv.slice(2));
assert(isSet(args['in']), 'Artifacts Input Directory (--in).');
assert(isSet(args['out']), 'Docs Output Directory (--out).');
assert(isSet(args['templates']), 'Templates Directory (--templates).');

const contractTemplate = fs.readFileSync(path.join(process.cwd(), args['templates'], 'contract.hbs'), {
    encoding: 'utf8',
});

const buildContractDoc = handlebars.compile(contractTemplate);

const fileNames = fs.readdirSync(path.join(process.cwd(), args['in']));

const extractTitle = (metadata) => (metadata ? JSON.parse(metadata)?.output?.devdoc?.title : undefined);

fileNames.forEach((fileName) => {
    if (!fileName.endsWith('.json')) return;

    const { abi, metadata } = require(path.join(process.cwd(), args['in'], fileName));

    if (!Array.isArray(abi)) return;

    const events = abi.filter(({ type }) => type === 'event');
    const functions = abi.filter(({ type }) => type === 'function');
    const constructor = abi.find(({ type }) => type === 'constructor');
    const contractName = fileName.slice(0, -5);
    const description = extractTitle(metadata);

    const markdown = buildContractDoc({ contractName, description, constructor, functions, events });

    fs.writeFileSync(path.join(process.cwd(), args['out'], `${contractName}.md`), markdown);
});
