#!/usr/bin/env node

const buildArtifacts = require('../src/build-artifacts');
const buildDocs = require('../src/build-docs');
const buildMetaData = require('../src/build-metadata');

const args = require('minimist')(process.argv.slice(3));
const mode = process.argv[2];

if (mode == 'build-artifacts') return buildArtifacts(args);

if (mode == 'build-docs') return buildDocs(args);

if (mode == 'build-metadata') return buildMetaData(args);

throw Error('Invalid Mode');
