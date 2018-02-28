#!/usr/bin/env node
//Asset Packager
var fs = require('fs')
var path = require('path')
var coffee = require('coffee-script')
var sass = require('sass')
var less = require('less-sync')
var eco = require('eco')
var UglifyJS = require("uglify-js")
var uglifycss = require('uglifycss')


var ecoEncounter = false


function processFile(file) {
  var args = file
  var endings = [".js", ".js.coffee", ".css", ".css.less", ".jst.eco", ".css.scss"]
  var pfad = path.dirname(args)
  var newEnding = ""
  //console.log(pfad)

  //Datei kann mit oder ohne Endung eingegeben werden

  if (fs.existsSync(args)) {
    newEnding = ""
  } else {

    for (var i = 0; i < endings.length; i++) {
      if (fs.existsSync(args + endings[i])) {
        newEnding = endings[i]
        break
      }
    }
  }

  var trueEnding = path.extname(args + newEnding)
  var fileName = path.basename(args, '.jst.eco')


  try {
    var datei = fs.readFileSync(args + newEnding, { encoding: "utf8" })
    var datei2 = datei
  }
  catch (err) {
    console.log(args + " nicht vorhanden")
    process.exit(-1)
  }

  switch (trueEnding) {
    case ".less":
      datei = transformLess(datei, pfad)
      break;
    case ".coffee":
      datei = transformCoffee(datei)
      break;
    case ".scss":
      datei = transformScss(datei)
      break;
    case ".eco":
      var ecoPfad = path.relative(startPfad, pfad)

      if (!ecoEncounter) {
        ecoEncounter =true
        datei = "window.JST = {};" + transformEco(datei, ecoPfad, fileName)
      } else {
        datei = transformEco(datei, ecoPfad, fileName)
      }
      break;
  }

  //Mit RegEx nach require und Pfad suchen  

  var regex1 = /^\s?(?:#=|\/\/=|\*=).(require(?:(?:_self)|(?:_tree))?)(?: (.*))?$/gm
  var match
  var reqBlock = ""
  var checkReqSelf = false


  //Switch über die verschiedenen require Arten, und wenn es sich um require handelt, dann die Funktion mit Pfad + Datei und rückgabe and Dateiinhalt Vorhängen.
  //Rekursion sich selbst aufrufende Funktion; Datei 2 um mit exec nicht die Datei aufzurufen, die dann geändert wird

  while ((match = regex1.exec(datei2)) !== null) {
    var require = match[0]
    var requireType = match[1]
    var requireFile = match[2]

    //Pfad zusammensetzen aus pfad und requireFile; falls requireFile nicht vorhanden wegen require_self, leeren string anfügen
    var pfadFolder = path.join(pfad, requireFile ? requireFile : "")
    //console.log(match1, match2)

    switch (requireType) {
      case "require":
        reqBlock = reqBlock + processFile(pfadFolder) + "\n"
        break;
      case "require_self":
        checkReqSelf = true
        reqBlock = reqBlock + datei
        break;
      case "require_tree":
        reqBlock = reqBlock + processFolder(pfadFolder) + "\n"
        break;
    }

  }
  if (checkReqSelf) {
    datei = reqBlock
  } else {
    datei = reqBlock + datei
  }

  return datei
  //return reqBlock
}

function processFolder(folder) {
  var tree = fs.readdirSync(folder, { encoding: "utf8" })
  var folderBlock = ""

  for (var i = 0; i < tree.length; i++) {
    var pfad = path.join(folder, tree[i])

    if (fs.lstatSync(pfad).isDirectory()) {
      folderBlock = folderBlock + processFolder(pfad) + "\n"
    } else {
      folderBlock = folderBlock + processFile(pfad) + "\n"
    }
  }

  return folderBlock
}

function transformLess(file, pfad) {
  return less.compile(file, pfad) + "\n"
}

function transformCoffee(file) {
  return coffee.compile(file) + "\n" 
}

function transformScss(file) {
  return sass.renderSync({ data: file }).css.toString("utf-8") + "\n"
}

//window.JST['templates/template']({ name: 'Peter' })
function transformEco(file, pfad, dateiName) {
  return "window.JST['" + pfad + "/" + dateiName + "'] = " + eco.precompile(file) + ";" + "\n"
}

//oben nicht required, da nur ienmal aufgerufen wird
var argv = require('minimist')(process.argv.slice(2));

var startPfad = path.dirname(argv._[0])

var output = processFile(argv._[0])

if (argv.u) {
  output = UglifyJS.minify(output).code
}

if (argv.c) {
  output = uglifycss.processString(output)
}

//var output = processFolder(process.argv[2])
//var output = transformLess(process.argv[2])

console.log(output)

// KISS DRY