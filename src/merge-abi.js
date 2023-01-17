const fs = require('fs');
const fsExtra = require('fs-extra');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

const getDetailedAbiUnit = (abiUnit, devdocUnit = {}) => {
    const enrichedAbiUnit = {
        type: abiUnit.type,
    };

    if (abiUnit.name) {
        Object.assign(enrichedAbiUnit, { name: abiUnit.name });
    }

    if (abiUnit.stateMutability) {
        Object.assign(enrichedAbiUnit, {
            stateMutability: abiUnit.stateMutability,
        });
    }

    const inputs = abiUnit.inputs?.map((input) => {
        if (input.description || !devdocUnit.params?.[input.name]) return input;

        return Object.assign({}, input, {
            description: devdocUnit.params?.[input.name],
        });
    });

    if (inputs) {
        Object.assign(enrichedAbiUnit, { inputs });
    }

    const outputs = abiUnit.outputs?.map((output, i) => {
        const outputName = output.name === '' ? `_${i}` : output.name;

        if (output.description || !devdocUnit.returns?.[outputName]) return output;

        return Object.assign({}, output, {
            description: devdocUnit.returns?.[outputName],
        });
    });

    if (outputs) {
        Object.assign(enrichedAbiUnit, { outputs });
    }

    if (abiUnit.description || devdocUnit.details) {
        Object.assign(enrichedAbiUnit, {
            description: devdocUnit.details ?? abiUnit.description,
        });
    }

    return enrichedAbiUnit;
};

const findDevdocUnit = (abiUnit, devdoc = {}) => {
    if (abiUnit.type === 'constructor') return devdoc.methods?.['constructor'];

    const devdocSection = (abiUnit.type === 'event' ? devdoc.events : devdoc.methods) ?? {};

    const name = Object.keys(devdocSection).find((signature) => signature.split('(')[0] === abiUnit.name);

    return devdocSection[name];
};

const getDetailedAbi = (abi, devdoc) => abi.map((abiUnit) => getDetailedAbiUnit(abiUnit, findDevdocUnit(abiUnit, devdoc)));

module.exports = (args) => {
    assert(isSet(args['name']), 'Contract Name (--name).');
    assert(isSet(args['in']), 'Build Input Directory (--in).');
    assert(isSet(args['out']), 'Artifacts Output Directory (--out).');

    const contractName = args['name'];
    const outputDirectory = path.join(process.cwd(), args['out']);
    fsExtra.ensureDirSync(outputDirectory);

    const devdoc = [].concat(args['filter'] ?? []).reduce(
        (devdoc, name) => {
            const { rawMetadata } = require(path.join(process.cwd(), args['in'], `${name}.sol/${name}.json`));
            const { events = {}, methods = {} } = JSON.parse(rawMetadata).output.devdoc;

            Object.keys(events).forEach((event) => {
                devdoc.events[event] = _.merge(devdoc.events[event] ?? {}, events[event]);
            });

            Object.keys(methods).forEach((method) => {
                devdoc.methods[method] = _.merge(devdoc.methods[method] ?? {}, methods[method]);
            });

            return devdoc;
        },
        { events: {}, methods: {} }
    );

    const { abi, rawMetadata } = require(path.join(process.cwd(), args['in'], `${contractName}.sol/${contractName}.json`));

    const detailedAbi = getDetailedAbi(abi, devdoc).filter(({ type }) => type !== 'fallback');

    detailedAbi.sort((a, b) => {
        const aType = a.type;
        const aName = a.name;

        const bType = b.type;
        const bName = b.name;

        if (aType === 'constructor' && bType !== 'constructor') return -1;

        if (aType !== 'constructor' && bType === 'constructor') return 1;

        if (aType === 'event' && bType !== 'event') return -1;

        if (aType !== 'event' && bType === 'event') return 1;

        if (aType === 'event' && bType !== 'event') return -1;

        if (aType !== 'event' && bType === 'event') return 1;

        if (aName.toUpperCase() === aName && bName.toUpperCase() !== bName) return -1;

        if (aName.toUpperCase() !== aName && bName.toUpperCase() === bName) return 1;

        return aName.toUpperCase() < bName.toUpperCase() ? -1 : 1;
    });

    const artifact = {
        abi: detailedAbi,
        title: JSON.parse(rawMetadata).output.devdoc.title,
    };

    fs.writeFileSync(path.join(outputDirectory, `${contractName}.json`), JSON.stringify(artifact, null, '    ').concat('\n'));
};
