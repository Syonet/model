describe( "model", function () {
    "use strict";

    var injector, $rootScope, $httpBackend, pouchDB, model;
    var expect = chai.expect;

    beforeEach( module( "syonet.model" ) );

    beforeEach( inject(function ( $injector ) {
        testHelpers( $injector );

        injector = $injector;
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );
        model = $injector.get( "model" );
        pouchDB = $injector.get( "pouchDB" );
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    afterEach(function () {
        return model( "foo" )._db.destroy();
    });

    afterEach(function () {
        return pouchDB( "modelDB.__updates" ).destroy();
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
        promise = model( "foo" ).get( "bar" );
        testHelpers.flush();

        return expect( promise ).to.eventually.not.have.property( "_blah" );
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
            expect( bar._path ).to.eql({ name: "bar" });
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
            var promise = model( "foo" ).id( "bar" ).rev();
            return expect( promise ).to.become( null );
        });

        it( "should return the current revision when found", function () {
            var rev;
            var foo = model( "foo" );

            var promise = foo._db.put({
                foo: "bar"
            }, "bar" ).then(function ( doc ) {
                rev = doc.rev;
                return foo.id( "bar" ).rev();
            }).then(function ( rev2 ) {
                expect( rev ).to.equal( rev2 );
            });

            return promise;
        });

        it( "should pass through errors except unexistent revisions", function () {
            var err = new Error();
            var foobar = model( "foo" ).id( "bar" );

            inject(function ( $q ) {
                sinon.stub( foobar._db, "get", function () {
                    return $q.reject( err );
                });
            });

            testHelpers.digest( true );
            return expect( foobar.rev() ).to.be.rejectedWith( err );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".list()", function () {
        describe( "on a collection", function () {
            it( "should do GET request and return", function () {
                var promise;
                var data = [{
                    id: "foo",
                    foo: "bar"
                }];

                $httpBackend.expectGET( "/foo" ).respond( data );

                promise = model( "foo" ).list();
                testHelpers.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
            });

            it( "should do GET request with parameters and return", function () {
                var promise;
                var data = [{
                    id: "foo",
                    foo: "bar"
                }];

                $httpBackend.expectGET( "/foo?bar=baz" ).respond( data );

                promise = model( "foo" ).list({
                    bar: "baz"
                });
                testHelpers.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
            });

            it( "should return cached array when receiving HTTP status 0", inject(function ( $q ) {
                var promise;
                var data = { foo: "bar" };
                var foo = model( "foo" );
                var stub = sinon.stub( foo._db, "query" ).withArgs( sinon.match.func, sinon.match({
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

            it( "should return cached array in the original order", function () {
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

                $httpBackend.expectGET( "/foo" ).respond( data );
                foo.list();
                testHelpers.flush();

                $httpBackend.expectGET( "/foo" ).respond( 0, null );
                promise = foo.list();
                testHelpers.flush();

                expect( promise ).to.eventually.have.deep.property( "[0].id", 5 );
                expect( promise ).to.eventually.have.deep.property( "[1].id", 3 );
                expect( promise ).to.eventually.have.deep.property( "[2].id", 2 );

                return promise;
            });

            it( "should wipe previous cached values on another request", function () {
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

                    setTimeout( $httpBackend.flush );
                    return promise;
                }).then(function () {
                    // Third request will fail, so the cache should be equal to the response of the
                    // second request
                    $httpBackend.expectGET( "/foo" ).respond( 0, null );
                    promise = foo.list();
                    setTimeout( $httpBackend.flush );

                    expect( promise ).to.eventually.have.deep.property( "[0].id", 3 );
                    expect( promise ).to.eventually.have.deep.property( "[1].id", 2 );

                    return promise;
                });
            });

            it( "should not use cached value if error happens and not offline", function () {
                var promise;
                var foo = model( "foo" );
                var data = [{
                    id: "foo"
                }];
                $httpBackend.expectGET( "/foo" ).respond( data );
                foo.list();
                testHelpers.flush();

                $httpBackend.expectGET( "/foo" ).respond( 500, {
                    err: 1
                });
                promise = foo.list();
                testHelpers.flush();

                return expect( promise ).to.be.rejected;
            });

            it( "should reject if offline and no cached value is present", function () {
                var promise;

                $httpBackend.expectGET( "/foo" ).respond( 0, null );
                promise = model( "foo" ).list();
                $httpBackend.flush();

                return expect( promise ).to.be.rejected;
            });
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

            it( "should list elements from child collection", function () {
                var promise;
                var data = {
                    id: "foo",
                    foo: "bar"
                };

                $httpBackend.expectGET( "/foo/bar/baz" ).respond( 200, [ data ] );
                promise = model( "foo" ).id( "bar" ).list( "baz" );
                testHelpers.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", "bar" );
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
                });
                testHelpers.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", "bar" );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".get()", function () {
        describe( "on a collection", function () {
            it( "should require ID to be supplied", function () {
                var msg = "Can't invoke .get() in a collection " +
                          "without specifying child element ID.";

                var getFn = function () {
                    return model( "foo" ).get();
                };

                expect( getFn ).to.throw( Error, msg );
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "on an element", function () {
            it( "should do GET request and return response", function () {
                var promise;
                var data = { foo: "bar" };

                $httpBackend.expectGET( "/foo/bar" ).respond( data );

                promise = model( "foo" ).get( "bar" );
                testHelpers.flush();

                return expect( promise ).to.eventually.have.property( "foo", data.foo );
            });

            it( "should return cached value when receiving HTTP status 0", inject(function ( $q ) {
                var promise;
                var data = { foo: "bar" };
                var foobar = model( "foo" ).id( "bar" );
                var stub = sinon.stub( foobar._db, "get" ).withArgs( "bar" );

                stub.returns( $q.when({
                    doc: data
                }));

                $httpBackend.expectGET( "/foo/bar" ).respond( 0, null );
                promise = foobar.get();

                testHelpers.flush();
                return promise.then(function ( value ) {
                    expect( stub ).to.have.been.called;
                    expect( value ).to.eql( data );
                });
            }));

            it( "should not use cached value if error happens and not offline", function () {
                var promise;
                var foobar = model( "foo" ).id( "bar" );
                var data = {
                    foo: "bar"
                };
                $httpBackend.expectGET( "/foo/bar" ).respond( data );
                foobar.get();
                testHelpers.flush();

                $httpBackend.expectGET( "/foo/bar" ).respond( 500, {
                    err: 1
                });
                promise = foobar.get();
                testHelpers.flush();

                return expect( promise ).to.be.rejected;
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".save()", function () {
        it( "should do POST request and return response for collection", function () {
            var promise;
            var data = [{
                id: "foo",
                foo: "bar"
            }];

            $httpBackend.expectPOST( "/foo" ).respond( data );
            promise = model( "foo" ).save( data );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
        });

        it( "should do POST request and return response for element", function () {
            var promise;
            var data = {
                foo: "bar"
            };

            $httpBackend.expectPOST( "/foo/bar" ).respond( data );
            promise = model( "foo" ).id( "bar" ).save( data );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
        });

        it( "should store request and return current data when offline", function () {
            var promise;
            var data = {
                foo: "bar"
            };

            $httpBackend.expectPOST( "/foo" ).respond( 0, null );
            promise = model( "foo" ).save( data );
            testHelpers.flush();

            expect( promise ).to.eventually.equal( data );

            return pouchDB( "modelDB.__updates" ).allDocs({
                include_docs: true
            }).then(function ( docs ) {
                var row = docs.rows[ 0 ];

                expect( docs.rows[ 0 ].doc ).to.eql({
                    _id: row.id,
                    _rev: row.value.rev,
                    model: "/foo",
                    method: "POST",
                    data: data
                });
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".patch()", function () {
        it( "should do PATCH request and return response for collection", function () {
            var promise;
            var data = [{
                id: "foo",
                foo: "bar"
            }];

            $httpBackend.expectPATCH( "/foo" ).respond( data );
            promise = model( "foo" ).patch( data );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data[ 0 ].foo );
        });

        it( "should do PATCH request and return response for element", function () {
            var promise;
            var data = { foo: "bar" };

            $httpBackend.expectPATCH( "/foo/bar" ).respond( data );
            promise = model( "foo" ).id( "bar" ).patch( data );
            testHelpers.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
        });

        it( "should store request and return current data when offline", function () {
            var promise;
            var data = [{
                foo: "bar"
            }];

            $httpBackend.expectPATCH( "/foo" ).respond( 0, null );
            promise = model( "foo" ).patch( data );
            $httpBackend.flush();

            expect( promise ).to.eventually.equal( data );

            return pouchDB( "modelDB.__updates" ).allDocs({
                include_docs: true
            }).then(function ( docs ) {
                var row = docs.rows[ 0 ];

                expect( docs.rows[ 0 ].doc ).to.eql({
                    _id: row.id,
                    _rev: row.value.rev,
                    model: "/foo",
                    method: "PATCH",
                    data: data
                });
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".remove()", function () {
        it( "should do DELETE request and return response for collection", function () {
            var promise;
            $httpBackend.expectDELETE( "/foo" ).respond( 204 );

            promise = model( "foo" ).remove();
            testHelpers.flush();

            return expect( promise ).to.eventually.be.undefined;
        });

        it( "should do DELETE request and return response for element", function () {
            var promise;
            $httpBackend.expectDELETE( "/foo/bar" ).respond( 204 );

            promise = model( "foo" ).id( "bar" ).remove();
            testHelpers.flush();

            return expect( promise ).to.eventually.be.undefined;
        });

        it( "should store request and return null when offline", function () {
            var promise;

            $httpBackend.expectDELETE( "/foo" ).respond( 0, null );
            promise = model( "foo" ).remove();
            testHelpers.flush();

            expect( promise ).to.eventually.equal( null );

            return pouchDB( "modelDB.__updates" ).allDocs({
                include_docs: true
            }).then(function ( docs ) {
                var row = docs.rows[ 0 ];

                expect( docs.rows[ 0 ].doc ).to.eql({
                    _id: row.id,
                    _rev: row.value.rev,
                    model: "/foo",
                    method: "DELETE"
                });
            });
        });
    });
});