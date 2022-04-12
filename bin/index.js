#!/usr/bin/env node

const mergeAbi = require('../src/merge-abi');
const buildDocs = require('../src/build-docs');
const buildMetaData = require('../src/build-metadata');
const buildStandardJson = require('../src/build-standard-json');

const args = require('minimist')(process.argv.slice(3));
const mode = process.argv[2];

if (mode == 'merge-abi') return mergeAbi(args);

if (mode == 'build-docs') return buildDocs(args);

if (mode == 'build-metadata') return buildMetaData(args);

if (mode == 'build-standard-json') return buildStandardJson(args);

throw Error('Invalid Mode');
