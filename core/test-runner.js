// NOTE: This is test runner for editor-framework, it covers the test cases for developing editor-framework
// It is different than github.com/fireball-packages/tester, which is for package developers to test their pacakges.

var Ipc = require('ipc');
var Globby = require('globby');
var Path = require('fire-path');
var Fs = require('fire-fs');
var Chalk = require('chalk');

var Mocha = require('mocha');
var Chai = require('chai');
var Base = Mocha.reporters.Base;

//
global.assert = Chai.assert;
global.expect = Chai.expect;

var Test = {};
Test.liveRun = function ( path ) {
    var SpawnSync = require('child_process').spawnSync;
    var App = require('app');
    var exePath = App.getPath('exe');

    if ( Fs.isDirSync(path) ) {
        var indexFile = Path.join(path, 'index.js');
        var files;

        if ( Fs.existsSync(indexFile) ) {
            var cache = require.cache;
            if ( cache[indexFile] ) {
                delete cache[indexFile];
            }

            files = require(indexFile);
            files.forEach(function ( file ) {
                Test.liveRun( file );
            });
        }
        else {
            Globby ( Path.join(path, '**/*.js'), function ( err, files ) {
                files.forEach(function (file) {
                    Test.liveRun( file );
                });
            });
        }
    }
    else {
        console.log( Chalk.magenta( 'Start test (' + path + ')') );
        SpawnSync(exePath, ['./', '--test', path], {stdio: 'inherit'});
    }
};

Test.run = function ( path ) {
    var stats = Fs.statSync(path);
    if ( !stats.isFile() ) {
        console.error('The path %s you provide is not a file', path);
        process.exit(0);
        return;
    }

    var mocha = new Mocha({
        ui: 'bdd',
        reporter: Spec,
    });
    mocha.addFile(path);

    mocha.run(function(failures){
        process.exit(failures);
    });
};


function Spec(runner) {
    Base.call(this, runner);

    var self = this,
        stats = this.stats,
        indents = 0,
        n = 0,
        cursor = Base.cursor,
        color = Base.color;

    function indent() {
        return Array(indents).join('  ');
    }

    runner.on('start', function(){
    });

    runner.on('suite', function(suite){
        ++indents;
        console.log(color('suite', '%s%s'), indent(), suite.title);
    });

    runner.on('suite end', function(suite){
        --indents;
        if (1 == indents) console.log();
    });

    runner.on('pending', function(test){
        var fmt = indent() + color('pending', '  - %s');
        console.log(fmt, test.title);
    });

    runner.on('pass', function(test){
        var fmt;
        if ('fast' == test.speed) {
            fmt = indent() +
                color('checkmark', '  ' + Base.symbols.ok) +
                color('pass', ' %s');
            cursor.CR();
            console.log(fmt, test.title);
        } else {
            fmt = indent() +
                color('checkmark', '  ' + Base.symbols.ok) +
                color('pass', ' %s') +
                color(test.speed, ' (%dms)');
            cursor.CR();
            console.log(fmt, test.title, test.duration);
        }
    });

    runner.on('fail', function(test, err){
        // cursor.CR();
        // console.log(indent() + color('fail', '  %d) %s'), ++n, test.title);
    });

    runner.on('end', self.epilogue.bind(self));
}
Spec.prototype = Base.prototype;

module.exports = Test;
