#!/usr/bin/env node

// This package is a node knockoff of filltex (python, https://github.com/dgerosa/filltex). It essentially performs the same job, but in node.js.
// Author: Nathan Moynihan, nathantmoynihan@gmail.com. Please feel free to email me with bugs or praise.


// Requirements
const yargs = require("yargs");
const lineReader = require('line-reader');

var argv = require('yargs')(process.argv.slice(1))
    .demandCommand(1)
    .argv;

const texfile = argv[0];
console.dir(argv);
console.log(texfile);