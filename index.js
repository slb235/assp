#!/usr/bin/env node
//Asset Packager
var fs = require('mz/fs')
var path = require('path')
var coffee = require('coffee-script')
var sass = require('sass')
var less = require('less')
var eco = require('eco')
var UglifyJS = require('uglify-js')
var uglifycss = require('uglifycss')

var ecoEncounter = false
var startPfad

var endings = [".js", ".js.coffee", ".css", ".css.less", ".jst.eco", ".css.scss"]

function array_unique(array) {
  var a = array.concat()
  for(var i=0; i<a.length; ++i) {
      for(var j=i+1; j<a.length; ++j) {
          if(a[i] === a[j])
              a.splice(j--, 1)
      }
  }
  return a
}


// resolve correct filename to use. if it is found in whitelabel use that one,
// else use original one

async function whiteLabelResolveFile(file, whitelabel) {
  var wlfile = 'whitelabel/'+ whitelabel +'/merge/' + file

  if(await fs.exists(wlfile)) {
    return wlfile
  }
  for(ending of endings) {
    if(await fs.exists(wlfile + ending)) {
      return wlfile
    } 
  }
  return file
}

async function processFile(file, whitelabel) {

  file = await whiteLabelResolveFile(file, whitelabel)

  var pfad = path.dirname(file)
  var newEnding = ""
  //console.log(pfad)

  //Datei kann mit oder ohne Endung eingegeben werden

  if (await fs.exists(file)) {
    newEnding = ""
  } else {

    for (var i = 0; i < endings.length; i++) {
      if (await fs.exists(file + endings[i])) {
        newEnding = endings[i]
        break
      }
    }
  }

  var trueEnding = path.extname(file + newEnding)
  var fileName = path.basename(file, '.jst.eco')


  try {
    var datei = await fs.readFile(file + newEnding, { encoding: "utf8" })
    var datei2 = datei
  }
  catch (err) {
    console.log(file + " nicht vorhanden")
    process.exit(-1)
  }

  switch (trueEnding) {
    case ".less":
      datei = await transformLess(datei, file + newEnding)
      break;
    case ".coffee":
      datei = await transformCoffee(datei)
      break;
    case ".scss":
      datei = await transformScss(datei)
      break;
    case ".eco":
      var ecoPfad = path.relative(startPfad, pfad)
      datei = await transformEco(datei, ecoPfad, fileName)

      if (!ecoEncounter) {
        ecoEncounter =true
        datei = "window.JST = {};" + datei
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
        reqBlock = reqBlock + await processFile(pfadFolder, whitelabel) + "\n"
        break;
      case "require_self":
        checkReqSelf = true
        reqBlock = reqBlock + datei
        break;
      case "require_tree":
        reqBlock = reqBlock + await processFolder(pfadFolder, whitelabel) + "\n"
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

async function processFolder(folder, whitelabel) {
  var tree = await fs.readdir(folder, { encoding: "utf8" })

  var wl_directory = 'whitelabel/'+ whitelabel + '/merge/' + folder
  if(whitelabel && await fs.exists(wl_directory) && (await fs.lstat(wl_directory)).isDirectory()) {
    tree = array_unique(tree.concat(await fs.readdir(wl_directory, { encoding: "utf8" })))
  }

  var folderBlock = ""

  for (var i = 0; i < tree.length; i++) {
    var pfad = path.join(folder, tree[i])

    if (await fs.exists(pfad) && (await fs.lstat(pfad)).isDirectory()) {
      folderBlock = folderBlock + await processFolder(pfad, whitelabel) + "\n"
    } else {
      folderBlock = folderBlock + await processFile(pfad, whitelabel) + "\n"
    }
  }

  return folderBlock
}

async function transformLess(file, pfad) {
  return (await less.render(file, { filename: pfad })).css
}

async function transformCoffee(file) {
  return coffee.compile(file) + "\n" 
}

async function transformScss(file) {
  return sass.renderSync({ data: file }).css.toString("utf-8") + "\n"
}

//window.JST['templates/template']({ name: 'Peter' })
async function transformEco(file, pfad, dateiName) {
  // strip whitelabel
  pfad = pfad.substr(pfad.indexOf('actionbound/templates'))

  return "window.JST['" + pfad + "/" + dateiName + "'] = " + eco.precompile(file) + ";" + "\n"
}

if (require.main === module) {
  async function main() {
    //oben nicht required, da nur einmal aufgerufen wird, kann mit require() eingebunden werden
    var argv = require('minimist')(process.argv.slice(2))

    startPfad = path.dirname(argv._[0])

    var output = await processFile(argv._[0])

    if (argv.u) {
      output = UglifyJS.minify(output).code
    }

    if (argv.c) {
      output = uglifycss.processString(output)
    }


    if (argv.o) {
      fs.writeFileSync(argv.o, output, 'utf8')
    } else {
      console.log(output)
    }
  }
  main()
}
else {
  module.exports = {
    process: async function (file, whitelabel, callback) {
      startPfad = path.dirname(file)
      ecoEncounter = false
      callback(await processFile(file, whitelabel))
    }
  }
}


//var output = processFolder(process.argv[2])
//var output = transformLess(process.argv[2])



// KISS DRY
