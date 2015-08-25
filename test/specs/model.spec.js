describe( "model service", function () {
    "use strict";

    var injector, $rootScope, $httpBackend, $modelDB, provider, model;
    var expect = chai.expect;

    function shouldCustomizeRequestMethod ( method ) {
        it( "should allow customizing", function () {
            // Detects whether the passed method is collection-only
            var isCollection = [ "create", "list" ].indexOf( method ) > -1;
            provider.methods[ method ] = "FOO";

            $httpBackend.expect( "FOO", "/foo/1" + ( isCollection ? "/bar" : "" ) ).respond({
                id: 1
            });

            model( "foo" ).id( 1 )[ method ]( isCollection ? "bar" : {}, {} );
            testHelpers.flush();
        });
    }

    // ---------------------------------------------------------------------------------------------

    beforeEach( module( "syonet.model", function ( $provide, modelProvider ) {
        provider = modelProvider;

        $provide.decorator( "$modelRequest", function ( $delegate ) {
            return sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        this.timeout( 2300 );

        injector = $injector;
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );
        model = $injector.get( "model" );
        $modelDB = $injector.get( "$modelDB" );
    }));

    afterEach(function () {
        localStorage.clear();

        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );

        return $modelDB.clear().finally( testHelpers.asyncDigest() );
    });

    it( "should be created with provided path", function () {
        var foo = model( "foo" );

        expect( foo._path ).to.eql({ name: "foo" });
    });

    it( "should cache documents without special keys", function () {
        var promise;
        var data = {
            _blah: 123,
            foo: "bar"
        };

        $httpBackend.expectGET( "/foo/bar" ).respond( 200, data );
        promise = model( "foo" ).get( "bar" ).finally( testHelpers.asyncDigest() );
        testHelpers.flush();

        return expect( promise ).to.eventually.not.have.property( "_blah" );
    });

    it( "should clear DBs when base URL changes", function () {
        var promise;

        $httpBackend.expectGET( "/foo" ).respond( 200, [{
            id: "foo"
        }]);
        promise = model( "foo" ).list();
        testHelpers.flush();

        return promise.then(function () {
            return model.base( "/api" );
        }).then(function () {
            $httpBackend.expectHEAD( "/api" ).respond( 200 );
            $httpBackend.expectGET( "/api/foo" ).respond( 0, null );
            promise = model( "foo" ).list();
            testHelpers.flush( true );

            return expect( promise ).to.be.rejectedWith({
                status: 0,
                data: null
            });
        }).finally( testHelpers.asyncDigest() );
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".pluralizeCollections", function () {
        it( "should append 's' to collections", function () {
            provider.pluralizeCollections = true;
            expect( model( "foo" ).toURL() ).to.equal( "/foos" );
            expect( model( "foo" ).model( "bar" ).toURL() ).to.equal( "/foos/bars" );
            expect( model( "foo" ).id( 1 ).model( "bar" ).toURL() ).to.equal( "/foo/1/bars" );
        });

        it( "should not append 's' to items", function () {
            var foo = model( "foo" ).id( 1 );
            var bar = foo.model( "bar" ).id( 1 );

            provider.pluralizeCollections = true;
            expect( foo.toURL() ).to.equal( "/foo/1" );
            expect( bar.toURL() ).to.equal( "/foo/1/bar/1" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".base()", function () {
        it( "should be used as the base URL for requests", function () {
            model.base( "http://foo/api" );
            expect( model( "foo" ).toURL() ).to.equal( "http://foo/api/foo" );
        });

        it( "should return the base URL for requests", function () {
            expect( model.base() ).to.equal( "/" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".auth( username, password )", function () {
        it( "should use basic authentication", function () {
            $httpBackend.expectGET( "/foo", function ( headers ) {
                return headers.Authorization === "Basic " + btoa( "foo:bar" );
            }).respond( 200, [] );

            model.auth( "foo", "bar" );
            model( "foo" ).list();

            testHelpers.flush();
        });

        it( "should allow usage of empty password", function () {
            $httpBackend.expectGET( "/foo", function ( headers ) {
                return headers.Authorization === "Basic " + btoa( "foo:" );
            }).respond( 200, [] );

            model.auth( "foo" );
            model( "foo" ).list();

            testHelpers.flush();
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".id()", function () {
        it( "should return the ID", function () {
            var foo = model( "foo" ).id( "bar" );
            expect( foo.id() ).to.equal( "bar" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".id( value )", function () {
        it( "should return new model instance", function () {
            var foo = model( "foo" );
            expect( foo.id( "bar" ) ).to.not.equal( foo );
        });

        it( "should keep same parent tree", function () {
            var baz = model( "foo" ).id( "bar" ).model( "baz" );
            var qux = baz.id( "qux" );

            expect( qux._parent ).to.equal( baz._parent );
        });

        it( "should set the ID into the path segment", function () {
            var foo = model( "foo" ).id( "bar" );
            expect( foo._path ).to.have.property( "id", "bar" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".model()", function () {
        it( "should require new model name", function () {
            var wrapper = function () {
                return model( "foo" ).model();
            };

            expect( wrapper ).to.throw( Error, "Model name must be supplied" );
        });

        it( "should create new model with nested path", function () {
            var bar = model( "foo" ).model( "bar" );

            expect( bar._parent._path ).to.eql({ name: "foo" });
            expect( bar._path ).to.eql({ name: "bar", id: undefined });
        });

        it( "should create new model using another instance", function () {
            var foo = model( "foo" ).id( 123 );
            var bar = model( "bar" ).id( 456 );

            expect( foo.model( bar ).toURL() ).to.eql( "/foo/123/bar/456" );
        });

        it( "should pass new options", function () {
            var opts = {};
            var foo = model( "foo", {
                bar: "baz"
            });
            var bar = model( "bar", opts );

            expect( foo.model( "bar" ) ).to.not.have.property( "_options" );
            expect( foo.model( "bar", opts ) ).to.have.property( "_options", opts );
            expect( foo.model( bar ) ).to.have.property( "_options", opts );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".toURL()", function () {
        it( "should build URL for every parent model", function () {
            var element = model( "foo" ).id( "bar" ).model( "baz" ).id( "qux" );
            expect( element.toURL() ).to.equal( "/foo/bar/baz/qux" );
        });

        it( "should join IDs that are arrays with a comma", function () {
            var element = model( "foo" ).id([ "bar", "baz", "qux" ]);
            expect( element.toURL() ).to.equal( "/foo/bar,baz,qux" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".rev()", function () {
        it( "should reject when invoked in a collection", function () {
            var foo = model( "foo" );
            var getRev = function () {
                return foo.rev();
            };

            return expect( getRev ).to.throw( Error, "Can't get revision of a collection!" );
        });

        it( "should resolve with null when no revision found", function () {
            var promise = model( "foo" ).id( "bar" ).rev().finally( testHelpers.asyncDigest() );
            return expect( promise ).to.become( null );
        });

        it( "should return the current revision when found", function () {
            var rev;
            var foo = model( "foo" );

            return foo.db.put({
                foo: "bar"
            }, "bar" ).then(function ( doc ) {
                rev = doc.rev;
                return foo.id( "bar" ).rev();
            }).then(function ( rev2 ) {
                expect( rev ).to.equal( rev2 );
            }).finally( testHelpers.asyncDigest() );
        });

        it( "should pass through errors except unexistent revisions", function () {
            var promise;
            var err = new Error();
            var foobar = model( "foo" ).id( "bar" );

            inject(function ( $q ) {
                sinon.stub( foobar.db, "get", function () {
                    return $q.reject( err );
                });
            });

            promise = foobar.rev().finally( testHelpers.asyncDigest() ).finally(function () {
                foobar.db.get.restore();
            });
            return expect( promise ).to.be.rejectedWith( err );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".list()", function () {
        shouldCustomizeRequestMethod( "list" );

        it( "should do GET request", function () {
            var promise;
            var data = [{
                id: "foo",
                foo: "bar"
            }];

            $httpBackend.expectGET( "/foo" ).respond( data );

            promise = model( "foo" ).list().finally( testHelpers.asyncDigest() );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
        });

        it( "should do GET request with parameters", function () {
            var promise;
            var data = [{
                id: "foo",
                foo: "bar"
            }];

            $httpBackend.expectGET( "/foo?bar=baz" ).respond( data );

            promise = model( "foo" ).list({
                bar: "baz"
            }).finally( testHelpers.asyncDigest() );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
        });

        // -----------------------------------------------------------------------------------------

        describe( "if request is successful", function () {
            var $modelCache;

            beforeEach(function () {
                var $modelPromise = injector.get( "$modelPromise" );
                $modelCache = injector.get( "$modelCache" );

                // Cache getAll, which is used internally by .list(), to let the request finish
                // first
                sinon.stub( $modelCache, "getAll" ).returns( $modelPromise.defer().promise );
            });

            it( "should wipe previous cached values on another request without query", function () {
                var promise;
                var foo = model( "foo" );
                var data = [{
                    id: 5,
                    foo: "bar"
                }, {
                    id: 3,
                    foo: "baz"
                }, {
                    id: 2,
                    foo: "qux"
                }];

                // First request carries all elements
                $httpBackend.expectGET( "/foo" ).respond( data );
                promise = foo.list();
                testHelpers.flush();

                return promise.then(function () {
                    // Second request removes one of them
                    $httpBackend.expectGET( "/foo" ).respond( data.slice( 1 ) );
                    promise = foo.list();

                    testHelpers.flush( true );
                    return promise;
                }).then(function () {
                    $modelCache.getAll.restore();
                    return $modelCache.getAll( foo );
                }).then(function ( result ) {
                    expect( result ).to.have.length( 2 );
                    expect( result ).to.have.deep.property( "[0].id", 2 );
                    expect( result ).to.have.deep.property( "[1].id", 3 );
                }).finally( testHelpers.asyncDigest() );
            });

            it( "should extend previous cached values on another request with query", function () {
                var promise;
                var foo = model( "foo" );
                var data = [{
                    id: 5,
                    foo: "bar"
                }, {
                    id: 3,
                    foo: "baz"
                }];

                $httpBackend.expectGET( "/foo" ).respond( data );
                promise = foo.list();
                testHelpers.flush();

                return promise.then(function () {
                    $httpBackend.expectGET( "/foo?foo=qux" ).respond([{
                        id: 1,
                        foo: "qux"
                    }]);

                    promise = foo.list({
                        foo: "qux"
                    });

                    testHelpers.flush( true );
                    return promise;
                }).then(function () {
                    var promise = foo.db.allDocs();

                    // 4 rows because 1 is management data, other 3 are returned rows
                    return expect( promise ).to.eventually.have.property( "total_rows", 4 );
                }).finally( testHelpers.asyncDigest() );
            });

            it( "should compact DB", function () {
                var promise;
                var foo = model( "foo" );
                var spy = sinon.spy( $modelCache, "compact" );

                $httpBackend.expectGET( "/foo" ).respond( [] );
                promise = foo.list();
                testHelpers.flush();

                return promise.then(function () {
                    expect( spy ).to.have.been.called;
                }).finally( testHelpers.asyncDigest() );
            });
        });

        describe( "when offline", function () {
            it( "should return cached array", inject(function ( $q ) {
                var promise;
                var data = { foo: "bar" };
                var foo = model( "foo" );
                var stub = sinon.stub( foo.db, "allDocs" ).withArgs( sinon.match({
                    include_docs: true
                }));

                stub.returns( $q.when({
                    rows: [{
                        doc: data
                    }]
                }));

                $httpBackend.expectGET( "/foo" ).respond( 0, null );
                promise = foo.list();

                testHelpers.flush();
                return promise.then(function ( value ) {
                    expect( stub ).to.have.been.called;
                    expect( value ).to.eql([ data ]);
                });
            }));
        });

        // -----------------------------------------------------------------------------------------

        describe( "on an element", function () {
            it( "should require collection to be supplied", function () {
                var msg = "Can't invoke .list() in a element without specifying " +
                          "child collection name.";
                var listFn = function () {
                    return model( "foo" ).id( "bar" ).list();
                };
                expect( listFn ).to.throw( Error, msg );
            });

            it( "should list elements from child collection with params", function () {
                var promise;
                var data = {
                    id: "foo",
                    foo: "bar"
                };

                $httpBackend.expectGET( "/foo/bar/baz?qux=quux" ).respond( 200, [ data ] );
                promise = model( "foo" ).id( "bar" ).list( "baz", {
                    qux: "quux"
                }).finally( testHelpers.asyncDigest() );
                testHelpers.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", "bar" );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".get()", function () {
        shouldCustomizeRequestMethod( "get" );

        describe( "on a collection", function () {
            it( "should use ID only if it's passed", function () {
                $httpBackend.expectGET( "/foo/bar" ).respond( {} );
                model( "foo" ).get( "bar" );

                $httpBackend.expectGET( "/foo" ).respond( [] );
                model( "foo" ).get();

                testHelpers.flush();
            });
        });

        // -----------------------------------------------------------------------------------------

        it( "should do GET request and return response", function () {
            var promise;
            var data = { foo: "bar" };

            $httpBackend.expectGET( "/foo/bar" ).respond( data );

            promise = model( "foo" ).get( "bar" ).finally( testHelpers.asyncDigest() );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
        });

        // -----------------------------------------------------------------------------------------

        describe( "when offline", function () {
            it( "should return cached value when it exists", function () {
                var stub, promise;
                var data = { foo: "bar" };
                var foobar = model( "foo" ).id( "bar" );

                inject(function ( $modelCache, $q ) {
                    stub = sinon.stub( $modelCache, "getOne" ).returns( $q.when( data ) );
                });

                $httpBackend.expectGET( "/foo/bar" ).respond( 0, null );
                promise = foobar.get().finally( testHelpers.asyncDigest() );

                testHelpers.flush( true );
                return promise.then(function ( value ) {
                    expect( stub ).to.have.been.called;
                    expect( value ).to.eql( data );
                    stub.restore();
                });
            });

            it( "should reject if no cache is available", function () {
                var promise, stub;

                inject(function ( $modelCache, $q ) {
                    stub = sinon.stub( $modelCache, "getOne" ).returns( $q.reject() );
                });

                $httpBackend.expectGET( "/foo/bar" ).respond( 0, null );
                promise = model( "foo" ).id( "bar" ).get().finally( testHelpers.asyncDigest() );

                testHelpers.flush( true );
                stub.restore();

                return expect( promise ).to.be.rejected;
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".create()", function () {
        shouldCustomizeRequestMethod( "create" );

        describe( "when online", function () {
            describe( "on a collection", function () {
                it( "should do POST request and return response", function () {
                    var promise;
                    var data = [{
                        id: "foo",
                        foo: "bar"
                    }];

                    $httpBackend.expectPOST( "/foo" ).respond( data );
                    promise = model( "foo" ).create( data ).finally( testHelpers.asyncDigest() );
                    testHelpers.flush();

                    return expect( promise ).to.eventually.have.deep.property(
                        "[0].foo",
                        data[ 0 ].foo
                    );
                });

                it( "should remove precached element when failed", function () {
                    var allDocs;
                    var foo = model( "foo" );

                    $httpBackend.expectPOST( "/foo" ).respond( 500, {} );
                    foo.create( {} );
                    testHelpers.flush();

                    allDocs = foo.db.allDocs().finally( testHelpers.asyncDigest() );
                    return expect( allDocs ).to.eventually.have.property( "total_rows", 0 );
                });

                it( "should be rejected when request failed", function () {
                    var promise;
                    var foo = model( "foo" );

                    $httpBackend.expectPOST( "/foo" ).respond( 500, {} );
                    promise = foo.create( {} ).finally( testHelpers.asyncDigest() );
                    testHelpers.flush();

                    return expect( promise ).to.be.rejected;
                });
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "when offline", function () {
            it( "should store request", function () {
                var promise;
                var data = {
                    foo: "bar"
                };

                $httpBackend.expectPOST( "/foo" ).respond( 0, null );
                promise = model( "foo" ).create( data );
                testHelpers.flush();

                return promise.then(function () {
                    return $modelDB( "__updates" ).allDocs({
                        include_docs: true
                    });
                }).then(function ( docs ) {
                    var doc = docs.rows[ 0 ].doc;

                    expect( doc ).to.have.property( "model", "/foo" );
                    expect( doc ).to.have.property( "method", "POST" );
                    expect( doc ).to.have.property( "data" ).and.have.property( "foo", "bar" );
                    expect( doc ).to.have.property( "options" );
                }).finally( testHelpers.asyncDigest() );
            });

            it( "should return passed value", function () {
                var promise;
                var data = {};

                $httpBackend.expectPOST( "/foo" ).respond( 0 );
                promise = model( "foo" ).create( data ).finally( testHelpers.asyncDigest() );
                testHelpers.flush();

                return expect( promise ).to.eventually.equal( data );
            });

            it( "should include into the cache", function () {
                var promise;
                var foo = model( "foo" );

                $httpBackend.expectPOST( "/foo" ).respond( 0 );
                promise = foo.create({});
                testHelpers.flush();

                return promise.then(function () {
                    return expect( foo.db.allDocs() ).to.eventually.have.property(
                        "total_rows",
                        2
                    );
                }).finally( testHelpers.asyncDigest() );
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "on an element", function () {
            it( "should require subcollection name", function () {
                var fn = function () {
                    return model( "foo" ).id( "bar" ).create( null );
                };

                expect( fn ).to.throw( Error );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".update()", function () {
        shouldCustomizeRequestMethod( "update" );

        describe( "when online", function () {
            describe( "on an element", function () {
                it( "should do POST request and return response", function () {
                    var promise;
                    var data = {
                        foo: "bar"
                    };

                    $httpBackend.expectPUT( "/foo/bar" ).respond( data );
                    promise = model( "foo" ).id( "bar" ).update( data ).finally( testHelpers.asyncDigest() );
                    testHelpers.flush();

                    return expect( promise ).to.eventually.have.property( "foo", data.foo );
                });

                it( "should update cached value", function () {
                    var promise;
                    var foobar = model( "foo" ).id( "bar" );
                    var data = {
                        id: "bar",
                        foo: "bar"
                    };

                    $httpBackend.expectPUT( "/foo/bar" ).respond( data );
                    promise = foobar.update( data );
                    testHelpers.flush();

                    return promise.then(function () {
                        data.foo = "barbaz";

                        $httpBackend.expectPUT( "/foo/bar" ).respond( data );
                        promise = foobar.update( data );
                        testHelpers.flush( true );

                        return promise;
                    }).then(function () {
                        return expect( foobar.db.get( "bar" ) ).to.eventually.have.property(
                            "foo",
                            "barbaz"
                        );
                    }).finally( testHelpers.asyncDigest() );
                });
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "on a collection", function () {
            it( "should require array of data", function () {
                var fn = function () {
                    return model( "foo" ).update({});
                };

                expect( fn ).to.throw();
            });

            it( "should require all items in array to have an ID", function () {
                var fn = function () {
                    model( "foo" ).update([{
                        id: "foo"
                    }, {
                        foo: "bar"
                    }]);
                };

                expect( fn ).to.throw();
            });

            it( "should allow modifying ID fields via id option", function () {
                var promise;
                var foo = model( "foo" );

                // Use status 0, so we're allowed to not give a **ck about the HTTP response :)
                $httpBackend.expectPUT( "/foo" ).respond( 0 );
                promise = foo.update( [{
                    foo: "foo",
                    bar: "bar"
                }, {
                    foo: "foo1",
                    bar: "bar1"
                }], {
                    id: [ "foo", "bar" ]
                });

                testHelpers.flush();
                return promise.then(function () {
                    promise = [];
                    promise.push( foo.db.get( "foo,bar" ) );
                    promise.push( foo.db.get( "foo1,bar1" ) );
                    promise = injector.get( "$q" ).all( promise );

                    return promise;
                }).finally( testHelpers.asyncDigest() );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".patch()", function () {
        shouldCustomizeRequestMethod( "patch" );

        describe( "when online", function () {
            it( "should do PATCH request and return response", function () {
                var promise;
                var data = [{
                    id: "foo",
                    foo: "bar"
                }];

                $httpBackend.expectPATCH( "/foo" ).respond( data );
                promise = model( "foo" ).patch( data ).finally( testHelpers.asyncDigest() );
                testHelpers.flush();

                return expect( promise ).to.eventually.have.deep.property(
                    "[0].foo",
                    data[ 0 ].foo
                );
            });

            // -------------------------------------------------------------------------------------

            describe( "on an element", function () {
                it( "should update cache", function () {
                    var promise;
                    var foobar = model( "foo" ).id( "bar" );

                    $httpBackend.expectPATCH( "/foo/bar" ).respond({
                        id: "bar",
                        baz: "qux"
                    });
                    promise = foobar.patch({
                        baz: "qux"
                    });
                    testHelpers.flush();

                    return promise.then(function () {
                        return expect( foobar.db.get( "bar" ) ).to.eventually.have.property(
                            "baz",
                            "qux"
                        );
                    }).finally( testHelpers.asyncDigest() );
                });
            });

            // -------------------------------------------------------------------------------------

            describe( "on a collection", function () {
                it( "should require array of data", function () {
                    var fn = function () {
                        return model( "foo" ).patch({});
                    };

                    expect( fn ).to.throw();
                });

                it( "should require all items in array to have an ID", function () {
                    var fn = function () {
                        model( "foo" ).patch([{
                            id: "foo"
                        }, {
                            foo: "bar"
                        }]);
                    };

                    expect( fn ).to.throw();
                });

                it( "should allow modifying ID fields via id option", function () {
                    var promise;
                    var foo = model( "foo" );

                    // Use status 0, so we're allowed to not give a **ck about the HTTP response :)
                    $httpBackend.expectPATCH( "/foo" ).respond( 0 );
                    promise = foo.patch([{
                        foo: "foo",
                        bar: "bar"
                    }, {
                        foo: "foo1",
                        bar: "bar1"
                    }], {
                        id: [ "foo", "bar" ]
                    });

                    testHelpers.flush();
                    return promise.then(function () {
                        promise = [];
                        promise.push( foo.db.get( "foo,bar" ) );
                        promise.push( foo.db.get( "foo1,bar1" ) );
                        promise = injector.get( "$q" ).all( promise );

                        return promise;
                    }).finally( testHelpers.asyncDigest() );
                });
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "when offline", function () {
            it( "should store request", function () {
                var promise;
                var data = [{
                    id: "foo",
                    foo: "bar"
                }];

                $httpBackend.expectPATCH( "/foo" ).respond( 0, null );
                promise = model( "foo" ).patch( data );
                testHelpers.flush();

                return promise.then(function () {
                    return $modelDB( "__updates" ).allDocs({
                        include_docs: true
                    });
                }).then(function ( docs ) {
                    var doc = docs.rows[ 0 ].doc;

                    expect( doc ).to.have.property( "model", "/foo" );
                    expect( doc ).to.have.property( "method", "PATCH" );
                    expect( doc ).to.have.property( "data" ).and.eql( data );
                    expect( doc ).to.have.property( "options" );
                }).finally( testHelpers.asyncDigest() );
            });

            // -------------------------------------------------------------------------------------

            describe( "on an element", function () {
                it( "should extend current cache", function () {
                    var promise;
                    var foobar = model( "foo" ).id( "bar" );
                    var data = {
                        foo: "bar"
                    };

                    return foobar.db.put( data, "bar" ).then(function () {
                        $httpBackend.expectPATCH( "/foo/bar" ).respond( 0 );
                        promise = foobar.patch({
                            foo: "barbaz"
                        });
                        testHelpers.flush( true );

                        return promise;
                    }).then(function () {
                        promise = foobar.db.get( "bar" );
                        return expect( promise ).to.eventually.have.property( "foo", "barbaz" );
                    }).finally( testHelpers.asyncDigest() );
                });
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".remove()", function () {
        shouldCustomizeRequestMethod( "remove" );

        describe( "when online", function () {
            it( "should do DELETE request and return response", function () {
                var promise;
                $httpBackend.expectDELETE( "/foo" ).respond( 204 );

                promise = model( "foo" ).remove().finally( testHelpers.asyncDigest() );
                testHelpers.flush();

                return expect( promise ).to.eventually.be.null;
            });

            it( "should wipe previous cache", function () {
                var promise;
                var foobar = model( "foo" ).id( "bar" );

                $httpBackend.expectPUT( "/foo/bar" ).respond({
                    id: "bar",
                    foo: "bar"
                });
                promise = foobar.update({});
                testHelpers.flush();

                return promise.then(function () {
                    $httpBackend.expectDELETE( "/foo/bar" ).respond( 204 );
                    promise = foobar.remove();
                    testHelpers.flush( true );

                    return promise;
                }).then(function () {
                    return expect( foobar.db.get( "bar" ) ).to.be.rejected;
                }).finally( testHelpers.asyncDigest() );
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "when offline", function () {
            it( "should store request", function () {
                var promise;

                $httpBackend.expectDELETE( "/foo" ).respond( 0, null );
                promise = model( "foo" ).remove();
                testHelpers.flush();

                return promise.then(function () {
                    return $modelDB( "__updates" ).allDocs({
                        include_docs: true
                    });
                }).then(function ( docs ) {
                    var doc = docs.rows[ 0 ].doc;

                    expect( doc ).to.have.property( "model", "/foo" );
                    expect( doc ).to.have.property( "method", "DELETE" );
                    expect( doc ).to.have.property( "data", null );
                    expect( doc ).to.have.property( "options" );
                }).finally( testHelpers.asyncDigest() );
            });

            it( "should wipe previous cache", function () {
                var promise;
                var foo = model( "foo" );
                var data = [{
                    id: "bar"
                }, {
                    id: "baz"
                }];

                $httpBackend.expectPOST( "/foo" ).respond( data );
                promise = foo.create( data );
                testHelpers.flush();

                return promise.then(function () {
                    $httpBackend.expectDELETE( "/foo/bar" ).respond( 0 );
                    promise = foo.id( "bar" ).remove();
                    testHelpers.flush( true );

                    return promise;
                }).then(function () {
                    promise = foo.db.get( "bar" );
                    return expect( promise ).to.be.rejected;
                }).finally( testHelpers.asyncDigest() );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( "._request()", function () {
        var req;
        beforeEach( inject( function ( $modelRequest ) {
            req = $modelRequest;
        }));

        it( "should pass instance options to $modelRequest", function () {
            var foo = model( "foo", {
                bar: "baz"
            });

            $httpBackend.expectGET( "/foo" ).respond({});
            foo.list();
            testHelpers.flush();

            expect( req ).to.have.been.calledWithMatch( "/foo", "GET", undefined, {
                bar: "baz"
            });
        });
    });
});