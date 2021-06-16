const fs = require('fs');
const assert = require('assert');
const path = require('path');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

const args = require('minimist')(process.argv.slice(2));
assert(isSet(args['in']), 'Build Input File (--in).');
assert(isSet(args['out']), 'Artifacts Output Directory (--out).');

const { contracts } = require(path.join(process.cwd(), args['in']));

const ignorePaths = ['/test/', '/external-interfaces/', 'lib/', 'module/'];
const pathIgnored = (path) => ignorePaths.reduce((ignore, ignorePath) => path.includes(ignorePath) || ignore, false);

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

const updateMetadataAbi = (metadata, abi) => {
    if (!metadata) return metadata;

    const currentMetadata = JSON.parse(metadata);
    Object.assign(currentMetadata.output, { abi });
    return JSON.stringify(currentMetadata, null, '');
};

const merge = (contractPair) => {
    const { contract = {}, interface = {} } = contractPair;
    const { abi: contractAbi = [], devdoc: contractDevdoc = {}, metadata: contractMetadata } = contract;
    const { abi: interfaceAbi = [], devdoc: interfaceDevdoc = {}, metadata: interfaceMetadata } = interface;

    const mergedABi = contractAbi
        .concat(interfaceAbi)
        .filter(({ name: a }, index, array) => array.findIndex(({ name: b }) => a === b) === index);

    const enrichedAbi = mergedABi.map((abiUnit) =>
        getDetailedAbiUnit(
            getDetailedAbiUnit(abiUnit, findDevdocUnit(abiUnit, contractDevdoc), findStateVariableUnit(abiUnit, contractDevdoc)),
            findDevdocUnit(abiUnit, interfaceDevdoc),
            findStateVariableUnit(abiUnit, interfaceDevdoc)
        )
    );

    return contractAbi.length
        ? Object.assign({}, contractPair.contract, {
              abi: enrichedAbi,
              metadata: updateMetadataAbi(contractMetadata, enrichedAbi),
          })
        : Object.assign({}, contractPair.interface, {
              abi: enrichedAbi,
              metadata: updateMetadataAbi(interfaceMetadata, enrichedAbi),
          });
};

const contractPaths = Object.keys(contracts).filter((path) => !pathIgnored(path));

const contractPairs = contractPaths.sort().reduce((contractPairs, path) => {
    const name = Object.keys(contracts[path])[0];

    const isInterface = name.startsWith('I');
    const contractName = isInterface ? name.slice(1) : name;

    if (!contractPairs[contractName]) {
        contractPairs[contractName] = {};
    }

    isInterface
        ? (contractPairs[contractName].interface = contracts[path][name])
        : (contractPairs[contractName].contract = contracts[path][name]);

    return contractPairs;
}, {});

Object.keys(contractPairs).forEach((contractName) => {
    const mergedArtifact = merge(contractPairs[contractName]);

    fs.writeFileSync(
        path.join(process.cwd(), args['out'], `${contractName}.json`),
        JSON.stringify(mergedArtifact, null, '  ').concat('\n')
    );
});
