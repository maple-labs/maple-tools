const fs = require('fs');
const crypto = require('crypto');
const assert = require('assert');
const path = require('path');

const isSet = (arg) => typeof arg === 'string' || typeof arg === 'number';

const spliceOut = (code, index, length) => code.slice(0, index) + code.slice(index + length);
const spliceOutSwarm = (code) => spliceOut(code, code.length - 86, 64);
const spliceOutAddress = (code) => spliceOut(code, 2, 40);

const normalizeDeployedBytecode = (code, hasHash) => {
    const addressRemovedByteCode = code.startsWith('73') ? spliceOutAddress(code) : code;
    return hasHash ? spliceOutSwarm(addressRemovedByteCode) : addressRemovedByteCode;
};

const stripLibRefs = (code, index = code.indexOf('__$')) => (index >= 0 ? stripLibRefs(spliceOut(code, index, 40)) : code);

const hash = (text) => '0x' + crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

module.exports = (args) => {
    assert(isSet(args['in']), 'Build Input File (--in).');
    assert(isSet(args['out']), 'Metadata Output File (--out).');

    const { contracts } = require(path.join(process.cwd(), args['in']));

    const contractNameFilter = [].concat(args['filter'] ?? []);
    const ignorePaths = [].concat(args['ignorePath'] ?? []);

    const pathIgnored = (path) => ignorePaths.reduce((ignore, ignorePath) => path.includes(ignorePath) || ignore, false);

    const contractPaths = Object.keys(contracts).filter((path) => !pathIgnored(path));

    const metadata = contractPaths
        .map((path) => {
            const contractName = Object.keys(contracts[path])[0];
            const metadata = JSON.parse(contracts[path][contractName]?.metadata);
            const hasBytecodeHash = metadata?.settings?.metadata?.bytecodeHash !== 'none';

            const { sources } = JSON.parse(contracts[path][contractName].metadata);
            const { keccak256: sourceHash } = sources[path];
            const { deployedBytecode } = contracts[path][contractName].evm;
            const contractSize = deployedBytecode.object.length / 2;
            const normalizedDeployedBytecode = normalizeDeployedBytecode(deployedBytecode.object, hasBytecodeHash);
            const bytecodeHashWithLibRefs = hash(normalizedDeployedBytecode);
            const bytecodeHashWithoutLibRefs = hash(stripLibRefs(normalizedDeployedBytecode));

            return {
                contractName,
                contractSize,
                sourceHash,
                bytecodeHashWithLibRefs,
                bytecodeHashWithoutLibRefs,
                rawBytecode: deployedBytecode.object,
            };
        })
        .filter(({ contractName }) => contractNameFilter.length === 0 || contractNameFilter.includes(contractName));

    metadata.sort(({ contractName: contractNameA }, { contractName: contractNameB }) => contractNameA.localeCompare(contractNameB));

    fs.writeFileSync(path.join(process.cwd(), args['out']), JSON.stringify(metadata, null, '    ').concat('\n'));
};
