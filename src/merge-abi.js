/*
 * This tool merges the abis and devdocs of several output artifacts into a single artifact where the resulting abi is not only the superset
 * of all merged abis, but all contains all the devdoc descriptions as child properties to all relevant abi elements. The abi is valid,
 * even if it contains additional non-standard properties. It does not yet supper custom error definitions.
 */

const fs = require('fs');
const fsExtra = require('fs-extra');
const assert = require('assert');
const path = require('path');
const _ = require('lodash');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

// Get a detailed abi unit by merging the abi unit with the devdoc unit info, such that the devdoc info appears as `description` properties
// to every respective abi property.
const getDetailedAbiUnit = (abiUnit, devdocUnit = {}) => {
    // Start building a new abi unit, starting with the type.
    const enrichedAbiUnit = { type: abiUnit.type };

    // If the abi unit has a name, then copy it over.
    if (abiUnit.name) {
        Object.assign(enrichedAbiUnit, { name: abiUnit.name });
    }

    // If the abi unit has a `stateMutability`, then copy it over.
    // NOTE: This `stateMutability` property was probably non-standard, and no longer seems to exist in forge output
    //       (compared to dapp-tools output).
    if (abiUnit.stateMutability) {
        Object.assign(enrichedAbiUnit, { stateMutability: abiUnit.stateMutability });
    }

    // For each of the abi unit's inputs (if it even has any), copy over their description form the devdoc, if one even exists.
    const inputs = abiUnit.inputs?.map((input) =>
        // If he abi unit's input already has a description, or of the devdoc does not have a corresponding one, return the abi unit.
        input.description || !devdocUnit.params?.[input.name]
            ? input
            : Object.assign({}, input, { description: devdocUnit.params?.[input.name] })
    );

    // If there are inputs for this abi unit, copy them over.
    if (inputs) {
        Object.assign(enrichedAbiUnit, { inputs });
    }

    // For each of the abi unit's outputs (if it even has any), copy over their description form the devdoc, if one even exists.
    const outputs = abiUnit.outputs?.map((output, i) => {
        // The output may hav a name, but if not, it is addressed by its index (e.g. `_2` for the 3rd output).
        const outputName = output.name === '' ? `_${i}` : output.name;

        // If he abi unit's output already has a description, or of the devdoc does not have a corresponding one, return the abi unit.
        return output.description || !devdocUnit.returns?.[outputName]
            ? output
            : Object.assign({}, output, { description: devdocUnit.returns?.[outputName] });
    });

    // If there are outputs for this abi unit, copy them over.
    if (outputs) {
        Object.assign(enrichedAbiUnit, { outputs });
    }

    // If there is a description for the abi unit itself, either from the abi or devdoc, copy it over.
    // NOTE: This code ensures that the devdoc unit details supersede the abi unit description.
    if (abiUnit.description || devdocUnit.details) {
        Object.assign(enrichedAbiUnit, { description: devdocUnit.details ?? abiUnit.description });
    }

    return enrichedAbiUnit;
};

// Find the devdoc unit in `devdoc` given the specified abi unit.
const findDevdocUnit = (abiUnit, devdoc = {}) => {
    // If the abiUnit is a constructor, then simply return the constructor devdoc unit.
    if (abiUnit.type === 'constructor') return devdoc.methods?.['constructor'];

    // Use the correct devdoc child (events or methods) depending on the type of the abi unit.
    const devdocSection = (abiUnit.type === 'event' ? devdoc.events : devdoc.methods) ?? {};

    // Find the name of the devdoc unit where the first term after '(' in the devdoc's key matches the abi unit's name.
    const name = Object.keys(devdocSection).find((signature) => signature.split('(')[0] === abiUnit.name);

    // Return the devdoc unit with that key.
    return devdocSection[name];
};

// Get a "detailed abi" by finding the devdoc unit for each abi unit, and using both to build a detailed abi unit.
const getDetailedAbi = (abi, devdoc) => abi.map((abiUnit) => getDetailedAbiUnit(abiUnit, findDevdocUnit(abiUnit, devdoc)));

module.exports = (args) => {
    assert(isSet(args['name']), 'Contract Name (--name).');
    assert(isSet(args['in']), 'Build Input Directory (--in).');
    assert(isSet(args['out']), 'Artifacts Output Directory (--out).');

    // This is the name of the main contract which inherits all others.
    // NOTE: This contract _still_ needs to be included in the filter.
    const contractName = args['name'];

    const outputDirectory = path.join(process.cwd(), args['out']);
    fsExtra.ensureDirSync(outputDirectory);

    // The following will create a new devdoc object where the child events and methods object are the result of merging all the events and
    // methods devdocs from the files specified in the filter.
    const devdoc = [].concat(args['filter'] ?? []).reduce(
        (devdoc, name) => {
            // Extract the raw metadata string from a file included in the filter.
            const { rawMetadata } = require(path.join(process.cwd(), args['in'], `${name}.sol/${name}.json`));

            // Parse the raw metadata string as a JSON, and extract the events and methods devdoc information.
            const { events = {}, methods = {} } = JSON.parse(rawMetadata).output.devdoc;

            // For each extracted event devdoc unit, merge it into the corresponding unit in the devdoc accumulator, creating the unit if
            // it does not already exist.
            Object.keys(events).forEach((event) => {
                devdoc.events[event] = _.merge(devdoc.events[event] ?? {}, events[event]);
            });

            // For each extracted method devdoc unit, merge it into the corresponding unit in the devdoc accumulator, creating the unit if
            // it does not already exist.
            Object.keys(methods).forEach((method) => {
                devdoc.methods[method] = _.merge(devdoc.methods[method] ?? {}, methods[method]);
            });

            return devdoc;
        },
        { events: {}, methods: {} } // The devdoc accumulator starts as with an empty events and methods object.
    );

    // Extract the abi array and raw metadata string from the main contract.
    const { abi, rawMetadata } = require(path.join(process.cwd(), args['in'], `${contractName}.sol/${contractName}.json`));

    // Get the "detailed abi", which is the abi of the main contract, where all devdoc info form all filtered contracts are inserted.
    const detailedAbi = getDetailedAbi(abi, devdoc).filter(({ type }) => type !== 'fallback');

    // Sort the detailed abi alphabetically, in the order of: constructor, event, then function.
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

    // Build a new artifact just consisting of the abi and title, which is all that's needed to `build-docs`. The title is taken fro,
    // the main contracts title in its devdoc in its rawMetadata.
    const artifact = {
        abi: detailedAbi,
        title: JSON.parse(rawMetadata).output.devdoc.title,
    };

    const outputPath = path.join(outputDirectory, `${args['outName'] ?? contractName}.json`);

    // Write the new artifact, using 4 spaces for indentation, and ending with a new line.
    fs.writeFileSync(outputPath, JSON.stringify(artifact, null, '    ').concat('\n'));
};
