var Ipc = require('ipc');
var Path = require('fire-path');
var Fs = require('fire-fs');

var Package = {};
var _path2package = {};
var _panel2info = {};
var _widget2info = {};

Package.load = function ( path ) {
    if ( _path2package[path] )
        return;

    var packageJsonPath = Path.join( path, 'package.json' );
    var packageObj;
    try {
        packageObj = JSON.parse(Fs.readFileSync(packageJsonPath));
    }
    catch (err) {
        Editor.error( 'Failed to load package.json at %s, message: %s', path, err.message );
        return;
    }

    packageObj._path = path;

    // load main.js
    if ( packageObj.main ) {
        var main;
        var mainPath = Path.join( path, packageObj.main );
        try {
            main = require(mainPath);
            if ( main && main.load ) {
                main.load();
            }
        }
        catch (err) {
            Editor.failed( 'Failed to load %s from %s. %s.', packageObj.main, packageObj.name, err.stack );
            return;
        }

        // register main ipcs
        var ipcListener = new Editor.IpcListener();
        for ( var prop in main ) {
            if ( prop === 'load' || prop === 'unload' )
                continue;

            if ( typeof main[prop] === 'function' ) {
                ipcListener.on( prop, main[prop].bind(main) );
            }
        }
        packageObj._ipc = ipcListener;
    }

    // register menu
    if ( packageObj.menus && typeof packageObj.menus === 'object' ) {
        for ( var menuPath in packageObj.menus ) {
            var parentMenuPath = Path.dirname(menuPath);
            if ( parentMenuPath === '.' ) {
                Editor.error( 'Can not add menu %s at root.', menuPath );
                continue;
            }

            var template = Editor.JS.mixin( {
                label: Path.basename(menuPath),
            }, packageObj.menus[menuPath] );
            Editor.MainMenu.add( parentMenuPath, template );
        }
    }

    // register panel
    if ( packageObj.panels && typeof packageObj.panels === 'object' ) {
        for ( var panelName in packageObj.panels ) {
            var panelID = packageObj.name + '.' + panelName;
            if ( _panel2info[panelID] ) {
                Editor.error( 'Failed to load panel \'%s\' from \'%s\', already exists.', panelName, packageObj.name );
                continue;
            }

            // setup default properties
            var panelInfo = packageObj.panels[panelName];
            Editor.JS.addon(panelInfo, {
                type: 'dockable',
                title: panelID,
                popable: true,
                messages: [],
                path: path,
            });

            //
            _panel2info[panelID] = panelInfo;
        }
    }

    // register widget
    if ( packageObj.widgets && typeof packageObj.widgets === 'object' ) {
        for ( var widgetName in packageObj.widgets ) {
            if ( _widget2info[widgetName] ) {
                Editor.error( 'Failed to register widget \'%s\' from \'%s\', already exists.', widgetName, packageObj.name );
                continue;
            }
            _widget2info[widgetName] = {
                path: Path.join( path, packageObj.widgets[widgetName] ),
            };
        }
    }

    //
    _path2package[path] = packageObj;
    Editor.success('%s loaded', packageObj.name);
    Editor.sendToWindows('package:loaded', packageObj.name);
};

Package.unload = function ( path ) {
    var packageObj = _path2package[path];
    if ( !packageObj )
        return;

    // unregister panel
    if ( packageObj.panels && typeof packageObj.panels === 'object' ) {
        for ( var panelName in packageObj.panels ) {
            var panelID = packageObj.name + '.' + panelName;
            delete _panel2info[panelID];
        }
    }

    // unregister widget
    if ( packageObj.widgets && typeof packageObj.widgets === 'object' ) {
        for ( var widgetName in packageObj.widgets ) {
            delete _widget2info[widgetName];
        }
    }

    // unregister menu
    if ( packageObj.menus && typeof packageObj.menus === 'object' ) {
        for ( var menuPath in packageObj.menus ) {
            Editor.MainMenu.remove( menuPath );
        }
    }

    // unload main.js
    if ( packageObj.main ) {
        // unregister main ipcs
        packageObj._ipc.clear();

        // unload main
        var cache = require.cache;
        var mainPath = Path.join( path, packageObj.main );
        var module = cache[mainPath];
        try {
            if ( module ) {
                var main = module.exports;
                if ( main && main.unload ) {
                    main.unload();
                }
            }
        }
        catch (err) {
            Editor.failed( 'Failed to unload %s from %s. %s.', packageObj.main, packageObj.name, err.stack );
        }
        delete cache[mainPath];
    }

    //
    delete _path2package[path];
    Editor.success('%s unloaded', packageObj.name);
    Editor.sendToWindows('package:unloaded', packageObj.name);
};

Package.reload = function ( path ) {
    Package.unload(path);
    Package.load(path);
};

Package.panelInfo = function ( panelID ) {
    return _panel2info[panelID];
};

Package.widgetInfo = function ( widgetName ) {
    return _widget2info[widgetName];
};

// the path can be any files in this package
Package.packageInfo = function ( path ) {
    for ( var p in _path2package ) {
        if ( Path.contains( p, path )  ) {
            return _path2package[p];
        }
    }
    return null;
};

// ========================================
// Ipc
// ========================================

Ipc.on('package:query', function ( reply ) {
    var results = [];
    for ( var path in _path2package ) {
        results.push({
            path: path,
            builtin: false, // TODO:
            enabled: true, // TODO:
            info: _path2package[path],
        });
    }

    reply(results);
});

Ipc.on('package:reload', function ( name ) {
    var path = null;
    for ( var p in _path2package ) {
        var packageInfo = _path2package[p];
        if ( packageInfo.name === name ) {
            path = p;
            break;
        }
    }

    if ( !path ) {
        Editor.error('Failed to reload package %s, not found', name);
        return;
    }

    Package.reload(path);
});

module.exports = Package;
