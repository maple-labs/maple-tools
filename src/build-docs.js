const fs = require('fs');
const fsExtra = require('fs-extra');
const assert = require('assert');
const path = require('path');
const handlebars = require('handlebars');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

const extractTitle = (metadata) => (metadata ? JSON.parse(metadata)?.output?.devdoc?.title : undefined);

module.exports = (args) => {
    assert(isSet(args['in']), 'Artifacts Input Directory (--in).');
    assert(isSet(args['out']), 'Docs Output Directory (--out).');

    const templatePath = isSet(args['templates'])
        ? path.join(process.cwd(), args['templates'], 'contract.hbs')
        : './templates/contract.hbs';

    const contractTemplate = fs.readFileSync(templatePath, { encoding: 'utf8' });

    const buildContractDoc = handlebars.compile(contractTemplate);

    const fileNames = fs.readdirSync(path.join(process.cwd(), args['in']));

    const outputDirectory = path.join(process.cwd(), args['out']);

    fsExtra.emptyDirSync(outputDirectory);

    fileNames.forEach((fileName) => {
        if (!fileName.endsWith('.json')) return;

        const { abi, title: description } = require(path.join(process.cwd(), args['in'], fileName));

        if (!Array.isArray(abi)) return;

        const events = abi.filter(({ type }) => type === 'event');
        const functions = abi.filter(({ type }) => type === 'function');
        const constructor = abi.find(({ type }) => type === 'constructor');
        const contractName = fileName.slice(0, -5);

        const markdown = buildContractDoc({ contractName, description, constructor, functions, events });

        fs.writeFileSync(path.join(outputDirectory, `${contractName}.md`), markdown);
    });
};
