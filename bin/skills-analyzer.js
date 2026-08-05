'use strict';

const { parseArgs, run } = require('../src/cli');

const options = parseArgs(process.argv);
const exitCode = run(options, { out: process.stdout, err: process.stderr });
process.exitCode = exitCode;
