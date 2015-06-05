/*jshint node:true*/

module.exports = function(grunt) {
    'use strict';

    var localConfig;
    var async  = require('async');
    var fs     = require('fs');
    //var curl   = require('node-curl');
    var request = require('request');

    try {
        localConfig = require('./dev-config');
    } catch (e) {
        localConfig = {};
    }

    var MINJS = grunt.option('minjs');
    if (typeof MINJS === 'undefined') {
        MINJS = 1;
    } else {
        MINJS += 0;
    }

    function get_chrome(part) {
        return function(outer_cb) {
            var dir = 'cache/chrome/';
            var fn = dir + part;

            async.waterfall([
                function check_dir(cb) {
                    fs.exists(dir, function (exists) {
                        if (exists) {
                            grunt.verbose.writeln(dir + ' exists');
                            cb(null, {exists: true});
                        } else {
                            grunt.verbose.writeln(dir + ' doesn\'t exist');
                            cb(null, {exists: false});
                        }
                    });
                },
                function make_dir(status, cb) {
                    if (status.exists) {
                        grunt.verbose.writeln('skipping mkdir');
                        cb(null);
                    } else {
                        grunt.verbose.writeln('mking dir ' + dir);
                        fs.mkdir(dir, '0775', function() { cb(null); });
                        cb(null);
                    }
                },
                function check_file(cb) {
                    fs.exists(fn, function (exists) {
                        if (exists) {
                            grunt.verbose.writeln(fn + ' file exists');
                            cb(null, {exists: true});
                        } else {
                            grunt.verbose.writeln(fn + ' file doesn\'t exist');
                            cb(null, {exists: false});
                        }
                    });
                },
                function read_file(status, cb) {
                    if (status.exists) {
                        fs.readFile(fn, { encoding: 'utf8' }, function (readfile_err, data) {
                            if (readfile_err) {
                                throw readfile_err;
                            } else {
                                grunt.log.writeln('Applied cached chrome ' + part + ' from ' + fn);
                                cb(null, { data: data });
                            }
                        });
                    } else {
                        grunt.verbose.writeln('skipping file read');
                        cb(null, { needs_fetching: true });
                    }
                },
                function fetch_chrome_part(status, cb) {
                    if (status.needs_fetching) {
                        request({
                            url: localConfig.chrome.host + '/services/chrome/' + part + '?legacy=false',
                            strictSSL: false
                        }, function (err, response, body) {
                            if (err) {
                                throw err;
                            }

                            grunt.log.writeln('Applied fresh chrome ' + part + ' from ' + localConfig.chrome.host + '/services/chrome/' + part);
                            cb(null, {
                                needs_caching: true,
                                data: body
                            });
                        });
                    } else {
                        grunt.verbose.writeln(part + ' file read');
                        cb(null, {
                            needs_caching: false,
                            data: status.data
                        });
                    }
                },
                function cache_to_file(status, cb) {
                    if (status.needs_caching) {
                        fs.writeFile(fn, status.data, function (err) {
                            if (err) { throw err; }
                            cb(null, status.data);
                        });
                    } else {
                        cb(null, status.data);
                    }
                }
            ], function end(err, result) {
                outer_cb(null, result);
            });
        };
    }


    var string_replace_config = {
        'inject_chrome' : {
            files: {
                'dist/index.html' : 'dist/index.html'
            } // the replacement strings themselves get injected into this config by the 'get_chrome' task
        }
    };

    /*********************
     *  SYNC FILE COPIER *
     *********************/

    var sync_options = {
        main: {
            files: [
                {cwd: 'src/', src: ['**/*'], dest: 'dist/'}
            ]
        }
    };


    /********************************
     *  REQUIREJS OPTIMIZER (r.js)  *
     ********************************/

    var requirejs_options = {
        compile: {
            options: {

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L25
                baseUrl: './client/app',

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L37
                mainConfigFile: 'client/app/require.config.js',

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L109
                optimize: ['none', 'uglify2'][MINJS],

                uglify2: {
                    mangle: false
                },

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L218
                optimizeCss: 'none',

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L238
                inlineText: true,

                // don't include CSS in the packed file
                // https://github.com/guybedford/require-css#disabling-the-build
                buildCSS: false,

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L437
                name: 'loader',
                out: '<%= yeoman.dist %>/public/app/bundle.js',

                // bundle.js includes loader's dependencies, but NOT loader
                // itself.  very important. :)
                excludeShallow: ['loader', 'bundle'],

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L46
                paths: {
                    // these are the modules this app needs which are provided
                    // by the customer portal.  here, we're just telling the rjs
                    // optimizer not to incldue them in the built file.
                    'jquery'               : 'empty:',
                    'moment'               : 'empty:',
                    'data-eh'              : 'empty:',
                    'chrome_lib'           : 'empty:',
                    'analytics/main'       : 'empty:',
                    'analytics/attributes' : 'empty:',
                    'dismiss'              : 'empty:',
                    'base'                 : 'empty:',
                },

                // the text module is only needed at build time, so we can
                // exclude it from being included in bundle.js
                stubModules: ['text'],

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L519
                preserveLicenseComments: false,

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L130
                generateSourceMaps: true,

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L90
                wrapShim: true,

                // https://github.com/jrburke/r.js/blob/cf9abe82e138579b4e8e89e76aa19108645f25e3/build/example.build.js#L314
                skipModuleInsertion: false,

                findNestedDependencies: true,

            }
        }
    };

    // Load grunt tasks automatically, when needed
    require('jit-grunt')(grunt, {
        replace: 'grunt-text-replace',
        revision: 'grunt-git-revision'
    });

    // Time how long tasks take. Can help when optimizing build times
    require('time-grunt')(grunt);

    // Define the configuration for all the tasks
    grunt.initConfig({

        requirejs: requirejs_options,

        sync: sync_options,

        clean: {
            dist: {
                files: [{
                    dot: true,
                    src: [ 'dist/', ]
                }]
            },
            chrome: {
                files: [{
                    dot: true,
                    src: ['cache/chrome']
                }]
            }
        },

        revision: {
            options: {
                property: 'meta.git.revision',
                ref: 'HEAD',
                short: true
            }
        },

        zip: {
            'dist-public': {
                cwd: 'src',
                src: ['src/**/*'],
                dest: 'strata-swagger-ui-<%= meta.git.revision %>.zip'
            }
        },

        // Project settings
        pkg: grunt.file.readJSON('package.json'),

        'string-replace': string_replace_config,

    });

    grunt.registerTask('fakerevision', function (target) {
        grunt.config('meta.git.revision', Math.random().toString());
    });

    grunt.registerTask('build', function (target) {
        var tasks = [];

        tasks.push('clean:dist');
        tasks.push('sync');
        if (target === 'debug' || target === 'dev' || target === 'chromed') {
            tasks.push('chrome');
        }

        return grunt.task.run(tasks);
    });

    grunt.registerTask('get_chrome', function(target) {
        var done = this.async();
        // ['string-replace:inject_chrome']

        async.parallel([
            get_chrome('head'),
            get_chrome('header'),
            get_chrome('footer'),
        ], function(err, results) {
            // insert the result into the string-replace:inject_chrome task's config
            grunt.config.merge({
                'string-replace': {
                    inject_chrome: {
                        options: {
                            replacements: [{
                                pattern: '<!-- SPA_HEAD -->',
                                replacement: results[0]
                            }, {
                                pattern: '<!-- SPA_HEADER -->',
                                replacement: results[1]
                            }, {
                                pattern: '<!-- SPA_FOOTER -->',
                                replacement: results[2]
                            }]
                        }
                    }
                }
            });
            done();
        });

    });
    grunt.registerTask('chrome', ['get_chrome', 'string-replace:inject_chrome']);
    grunt.registerTask('package', ['revision', 'build', 'zip']);
    grunt.registerTask('lint', ['jshint']);
};
