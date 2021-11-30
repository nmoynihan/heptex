#!/usr/bin/env node

// This package is a node knockoff of filltex (python, https://github.com/dgerosa/filltex). It essentially performs the same job, but in node.js.
// Author: Nathan Moynihan, nathantmoynihan@gmail.com. Please feel free to email me with bugs or praise.
// Level 1: Minimal debug. Level 2: Maximal debug. Level 0: Nothing.
const debug = 1;
// Requirements
const yargs = require("yargs");
const axios = require("axios");
const fs = require('fs');
const lineReader = require('line-reader');
const ch = require('cheerio');

// Options
const options = yargs
 .usage("Usage: -t <texfile> -b <bibfile>")
 .option("t", { alias: "texfile", describe: "Input TeX file.", type: "string", demandOption: true })
 .option("b", { alias: "bibfile", describe: "Input BibTeX file.", type: "string", demandOption: true })
 .argv;

const input = `TeX File: ${options.texfile}, BiB: ${options.bibfile}`;

if (debug == 1) { console.log(input); }

// Get a single citation from inspirehep.net
function getInspireCitation(citeRef)
{
    var url = "https://inspirehep.net/api/literature?q=" + citeRef;
    return new Promise((resolve, reject) => {
        axios.get(url, { headers: { Accept: "application/json" } })
        .then(res => {
                if (res.data.hits.total == 1)
                {
                    // If there is only 1 hit, continue getting the citation
                    axios.get(res.data.hits.hits[0].links.bibtex).then(res2 => {
                        bibtex = res2.data;
                        resolve(bibtex);
                    });
                }
                else
                {
                    // If more than one, do nothing.
                    reject(`Found ${res.data.hits.total} results for key ${citeRef}. Require exactly 1 result!`);
                }
            });
    });
}

// Get a single ADS citation
function getADSCitation(citeRef)
{
    var ADSurl = "https://ui.adsabs.harvard.edu/abs/" + citeRef + "/exportcitation";
    return new Promise((resolve, reject) => {
        axios.get(ADSurl, { headers: { Accept: "application/json" } })
        .then(res => {
                const ADSPage = res.data;
                // Deal with the HTML using cheerio
                const $ = ch.load(ADSPage);
                // The citation is in a HTML element with class export-textarea
                const bibtex = $('.export-textarea').text().trim();
                if (bibtex.toString().charAt(0) == '@') // Check the bibtex begins with an @
                {
                    resolve(bibtex);
                }
                else
                {
                    reject(`Found ${bibtex} from ADS query, expected different.`);
                }
            });
    });
}

// Read all lines of the .aux file and download all missing citations from inspire and ADS.
function getCitations()
{
    texname = options.texfile.split('.tex')[0];
    auxfile = texname + '.aux'; // Get Auxfile name
    const regex = '\\citation\{(.*)\}'; // Regex to get the cite key
    try {

        var keys = []; // Array for the keys found in the aux
        var bibkeys = []; // Array for the keys found in the bib file. We only care about the difference.

        lineReader.eachLine(auxfile, function(line, last) { 
            var auxCite = line.toString().match(/\\citation\{(.*?)\}/g); // Read each line of the aux file that matches a citation
            if (auxCite != null)
            {
                var key = auxCite.toString().match(/{(.*?)}/)[1]; // Extract the key from the line
                keyArray = key.split(",");
                if (keyArray.length > 1)
                {
                    for(var i=0; i<keyArray.length; i++){
                        if (debug == 2) { console.log("Found a citation with key " + keyArray[i]); }
                        keys.push(keyArray[i]);
                    }
                }
                else
                {
                    if (debug == 2) { console.log("Found a citation with key " + key); }
                    keys.push(key); // Add to the aux key array. Split in case it's a multi-citation.
                }
            }
            if (last) // Reached the end of the aux file
            {
                if (debug == 1 || debug == 2) { console.log("Found " + keys.length + " citations in the aux file.")}
                lineReader.eachLine(options.bibfile, function(line, last) { // Read each line of the bib file that matches a citation
                    var bibCite = line.toString().match(/@.*?\{(.*)/g); // Regex to match @ at the begining 
                    if (bibCite != null)
                    {
                        var bibkey = bibCite.toString().match(/{(.*?),/);  // Extract the key from the line
                        if (bibkey != null)
                        {
                            if (debug == 2) { console.log("Found a key in the .bib: " + bibkey[1])}
                            bibkeys.push(bibkey[1]); // Add to the bib key array
                        }
                    }
                    if (last)
                    {
                        if (debug == 1 || debug == 2) { console.log("Found " + bibkeys.length + " keys in the .bib file.")}
                        let keysDifference = keys
                                            .filter(x => !bibkeys.includes(x))
                                            .concat(bibkeys.filter(x => !keys.includes(x))); // Get the difference between the two arrays - these are the missing keys we need to get!
                        if (keysDifference.length > 0)
                        {
                            if (debug == 2) { console.log(`Found missing keys: ${keysDifference.toString()}`); }
                            if (debug == 1 || debug == 2) { console.log("Found " + keysDifference.length + " missing keys in total."); }
                        }
                        else
                        {
                            console.log(`No missing keys found. Doing nothing!`);
                        }
                        for (var i = 0; i < keysDifference.length; i++) { // Go through the array and download all the bibtex
                            var bibStream = fs.createWriteStream(options.bibfile, {flags:'a'}); // open the bibfile for writing
                            if (i == 0){ bibStream.write("\n"); }
                            keyName = keysDifference[i];
                            if (debug == 2) { console.log(`Saveing bibtex for key ${keyName} to ${options.bibfile}.`); }
                            if (isNaN(keyName.charAt(0)) == true) // If the first character of the key is NOT a number, it's probably an Inspire key. If it is a number, likely ADS.
                            {
                                    //getInspireCitation(keysDifference[i]).then((message) => fs.appendFile(options.bibfile, message, function (err) { // It's an inspite citation, so download it and write to the bib file.
                                    getInspireCitation(keysDifference[i]).then((message) => bibStream.write(message, function (err) { // It's an inspite citation, so download it and write to the bib file.
                                        if (err) throw err;
                                    })).catch((error) => console.log(error));
                            }
                            else
                            {
                                getADSCitation(keysDifference[i]).then((message) => fs.appendFile(options.bibfile, message, function (err) { // It's an ADS citation, so download it and write to the bib file.
                                    if (err) throw err;
                                })).catch((error) => console.log(error));
                            }

                        }
                    }
                });
            }
        });
      } catch (err) {
        console.error(err)
      }
}
getCitations();
//bibStream.end(); // Close the bib file
// For debug. Uncomment to see it in action. Last one should return nothing.
//getADSCitation("2016PhRvL.116f1102A").then((message) => console.log(message)).catch((error) => console.log(error));
//getADSCitation("PhysRevLett.22.666").then((message) => console.log(message)).catch((error) => console.log(error));
//getInspireCitation("Emond:2020lwi").then((message) => console.log(message)).catch((error) => console.log(error));
//getInspireCitation("34oiufho34ih").then((message) => console.log(message)).catch((error) => console.log(error));
