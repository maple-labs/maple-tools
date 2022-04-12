const fs = require('fs');
const fsExtra = require('fs-extra');
const assert = require('assert');
const path = require('path');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

const getDetailedAbiUnit = (abiUnit, devdocUnit = {}, stateVariableUnit) => {
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

    if (abiUnit.isStateVariable || stateVariableUnit) {
        Object.assign(enrichedAbiUnit, {
            isStateVariable: true,
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

    if (abiUnit.description || devdocUnit.details || stateVariableUnit?.details) {
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

const findStateVariableUnit = (abiUnit, devdoc = {}) => {
    if (['constructor', 'event'].includes(abiUnit.type)) return;

    return devdoc?.stateVariables?.[abiUnit.name];
};

const merge = (artifact, contractGroup) => {
    const { contract = {}, interface = {} } = contractGroup;
    const { abi: contractAbi = [], devdoc: contractDevdoc = {} } = contract;
    const { abi: interfaceAbi = [], devdoc: interfaceDevdoc = {} } = interface;

    artifact.abi = artifact.abi
        .concat(interfaceAbi)
        .concat(contractAbi)
        .filter(({ name: a }, index, array) => array.findIndex(({ name: b }) => a === b) === index)
        .map((abiUnit) =>
            getDetailedAbiUnit(
                getDetailedAbiUnit(abiUnit, findDevdocUnit(abiUnit, interfaceDevdoc), findStateVariableUnit(abiUnit, interfaceDevdoc)),
                findDevdocUnit(abiUnit, contractDevdoc),
                findStateVariableUnit(abiUnit, contractDevdoc)
            )
        );
};

module.exports = (args) => {
    assert(isSet(args['name']), 'Contract Name (--name).');
    assert(isSet(args['in']), 'Build Input File (--in).');
    assert(isSet(args['out']), 'Artifacts Output Directory (--out).');

    const outputName = args['name'];

    const { contracts } = require(path.join(process.cwd(), args['in']));

    const contractNameFilter = [].concat(args['filter'] ?? []);

    const contractGroups = {};

    Object.keys(contracts).forEach((path, index, paths) => {
        const name = Object.keys(contracts[path])[0];

        contractGroups[name] = {
            contract: contracts[path][name],
            interface: contracts[paths.find(path => Object.keys(contracts[path])[0] === `I${name}`)]?.[`I${name}`]
        };

        return contractGroups;
    }, {});

    const outputDirectory = path.join(process.cwd(), args['out']);

    fsExtra.ensureDirSync(outputDirectory);

    const mergedArtifact = {
        abi: []
    };

    Object.keys(contractGroups).forEach((contractName) => {
        if (contractNameFilter.length > 0 && !contractNameFilter.includes(contractName)) return;

        merge(mergedArtifact, contractGroups[contractName]);
    });

    mergedArtifact.abi = mergedArtifact.abi.filter(({ type }) => type !== 'fallback');

    mergedArtifact.abi.sort((a, b) => {
        const aType = a.type;
        const aName = a.name;
        const aIsStateVariable = a.isStateVariable;

        const bType = b.type;
        const bName = b.name;
        const bIsStateVariable = b.isStateVariable;

        if (aType === 'constructor' && bType !== 'constructor') return -1;

        if (aType !== 'constructor' && bType === 'constructor') return 1;

        if (aType === 'event' && bType !== 'event') return -1;

        if (aType !== 'event' && bType === 'event') return 1;

        if (aType === 'event' && bType !== 'event') return -1;

        if (aType !== 'event' && bType === 'event') return 1;

        if (aName.toUpperCase() === aName && bName.toUpperCase() !== bName) return -1;

        if (aName.toUpperCase() !== aName && bName.toUpperCase() === bName) return 1;

        if (aIsStateVariable && !bIsStateVariable) return -1;

        if (!aIsStateVariable && bIsStateVariable) return 1;

        return aName.toUpperCase() < bName.toUpperCase() ? -1 : 1;
    });

    fs.writeFileSync(path.join(outputDirectory, `${outputName}.json`), JSON.stringify(mergedArtifact, null, '    ').concat('\n'));
};
