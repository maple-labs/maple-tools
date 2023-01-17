const fs = require('fs');
const fsExtra = require('fs-extra');
const assert = require('assert');
const path = require('path');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

module.exports = (args) => {
    assert(isSet(args['in']), 'Contracts directory (--in).');
    assert(isSet(args['out']), 'Standard Input JSON output directory (--out).');
    assert(isSet(args['config']), 'Config JSON (--config).');

    const base = require(path.join(process.cwd(), args['config']));

    const contractDirectory = path.join(process.cwd(), args['in']);

    fs.readdirSync(contractDirectory).forEach((contractFileName) => {
        const contactPath = path.join(contractDirectory, contractFileName);
        const sourceCode = fs.readFileSync(contactPath, { encoding: 'utf8' });

        base.sources = {};
        base.sources[contractFileName] = { content: sourceCode.replace(/\n/g, '\n') };

        fs.writeFileSync(
            path.join(process.cwd(), args['out'], `${contractFileName.split('.')[0]}.json`),
            JSON.stringify(base, null, '    ').concat('\n')
        );
    });
};
