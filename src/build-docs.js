/*
 * This tool builds a markdown document given an artifact file with a title and abi. If the abi is overspecified with devdoc info (i.e. the
 * output of the `merge-abi` tool) then that additional info is included in the document. This tool uses handlebars (a templating engine) to
 * do the heavy lifting in the conversion. See `./templates/contract.hbs` for the default used template.
 */

const fs = require('fs');
const fsExtra = require('fs-extra');
const assert = require('assert');
const path = require('path');
const handlebars = require('handlebars');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

// NOTE: This was the old way of getting the title, which has been superseded by fetching title from the artifact.
const extractTitle = (metadata) => (metadata ? JSON.parse(metadata)?.output?.devdoc?.title : undefined);

module.exports = (args) => {
    assert(isSet(args['in']), 'Artifacts Input Directory (--in).');
    assert(isSet(args['out']), 'Docs Output Directory (--out).');

    // Other templates can be used, but ther eis a default.
    const templatePath = isSet(args['templates'])
        ? path.join(process.cwd(), args['templates'], 'contract.hbs')
        : './templates/contract.hbs';

    const contractTemplate = fs.readFileSync(templatePath, { encoding: 'utf8' });

    const buildContractDoc = handlebars.compile(contractTemplate);

    const fileNames = fs.readdirSync(path.join(process.cwd(), args['in']));

    const outputDirectory = path.join(process.cwd(), args['out']);

    fsExtra.emptyDirSync(outputDirectory);

    // Perform the operation of building the doc file for every json file in the input directory.
    fileNames.forEach((fileName) => {
        if (!fileName.endsWith('.json')) return;

        // NOTE: We may want to specify a title for the docs, rather than use whatever is in the artifact, so perhaps `title` can be passed
        //       into this tool as an argument.
        const { abi, title: description } = require(path.join(process.cwd(), args['in'], fileName));

        if (!Array.isArray(abi)) return;

        // Extract/filter each of the abi units by type, so they can be individually ingested by the handlebars builder. It's much easier
        // to perform this filtering and grouping here and than in the handlebars script/template.
        const events = abi.filter(({ type }) => type === 'event');
        const functions = abi.filter(({ type }) => type === 'function');
        const constructor = abi.find(({ type }) => type === 'constructor');
        const contractName = fileName.slice(0, -5);

        // The `buildContractDoc` function takes each of the above derived strings and arrays individually.
        const markdown = buildContractDoc({ contractName, description, constructor, functions, events });

        fs.writeFileSync(path.join(outputDirectory, `${contractName}.md`), markdown);
    });
};
