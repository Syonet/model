describe( "Model", function () {
    "use strict";

    var injector, $rootScope, $httpBackend;
    var expect = chai.expect;

    beforeEach( module( "syonet.model", function ( modelProvider ) {
        // Decrease request timeout
        modelProvider.timeout = 100;
    }));

    beforeEach( inject(function ( $injector ) {
        var model;
        injector = $injector;
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );

        // Ping request backend definition
        this.ping = $httpBackend.whenHEAD( "/" ).respond( 200 );

        this.__defineGetter__( "model", function () {
            model = model || $injector.get( "model" );
            return model;
        });

        this.flush = function () {
            $httpBackend.flush();
        };
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    afterEach(function () {
        return this.model( "foo" )._db.destroy();
    });

    it( "should be created with provided path", function () {
        var foo = this.model( "foo" );

        expect( foo._path ).to.eql({ name: "foo" });
    });

    it( "should cache documents without special keys", function () {
        var promise;
        var data = {
            _blah: 123,
            foo: "bar"
        };

        $httpBackend.expectGET( "/foo/bar" ).respond( 200, data );
        promise = this.model( "foo" ).get( "bar" );
        this.flush();

        return expect( promise ).to.eventually.not.have.property( "_blah" );
    });

    it( "should timeout requests", function ( done ) {
        var promise;

        this.ping.respond( 0 );
        $httpBackend.expectGET( "/foo" ).respond( 200, {} );
        promise = this.model( "foo" ).list();

        setTimeout(function () {
            $httpBackend.flush();
            expect( promise ).to.eventually.be.rejectedWith( sinon.match({
                status: 0
            })).then( done, done );
        }, 100 );
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".id()", function () {
        it( "should return the ID", function () {
            var foo = this.model( "foo" ).id( "bar" );
            expect( foo.id() ).to.equal( "bar" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".id( value )", function () {
        it( "should return new model instance", function () {
            var foo = this.model( "foo" );
            expect( foo.id( "bar" ) ).to.not.equal( foo );
        });

        it( "should keep same parent tree", function () {
            var baz = this.model( "foo" ).id( "bar" ).model( "baz" );
            var qux = baz.id( "qux" );

            expect( qux._parent ).to.equal( baz._parent );
        });

        it( "should set the ID into the path segment", function () {
            var foo = this.model( "foo" ).id( "bar" );
            expect( foo._path ).to.have.property( "id", "bar" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".model()", function () {
        it( "should require new model name", function () {
            var wrapper = function () {
                return this.model( "foo" ).model();
            };

            expect( wrapper ).to.throw;
        });

        it( "should create new model with nested path", function () {
            var bar = this.model( "foo" ).model( "bar" );

            expect( bar._parent._path ).to.eql({ name: "foo" });
            expect( bar._path ).to.eql({ name: "bar" });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".toURL()", function () {
        it( "should build URL for every parent model", function () {
            var element = this.model( "foo" ).id( "bar" ).model( "baz" ).id( "qux" );
            expect( element.toURL() ).to.equal( "/foo/bar/baz/qux" );
        });

        it( "should join IDs that are arrays with a comma", function () {
            var element = this.model( "foo" ).id([ "bar", "baz", "qux" ]);
            expect( element.toURL() ).to.equal( "/foo/bar,baz,qux" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".auth( username, password )", function () {
        it( "should use basic authentication", function () {
            var promise;

            $httpBackend.expectGET( "/foo/bar", function ( headers ) {
                return headers.Authorization === "Basic " + btoa( "foo:bar" );
            }).respond( 200, {
                foo: "bar"
            });

            this.model.auth( "foo", "bar" );
            promise = this.model( "foo" ).get( "bar" );

            this.flush();
            return promise;
        });

        it( "should allow usage of empty password", function () {
            var promise;

            $httpBackend.expectGET( "/foo/bar", function ( headers ) {
                return headers.Authorization === "Basic " + btoa( "foo:" );
            }).respond( 200, {
                foo: "bar"
            });

            this.model.auth( "foo" );
            promise = this.model( "foo" ).get( "bar" );

            this.flush();
            return promise;
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".rev()", function () {
        it( "should reject when invoked in a collection", function () {
            var foo = this.model( "foo" );
            var getRev = function () {
                return foo.rev();
            };

            return expect( getRev ).to.throw( Error, "Can't get revision of a collection!" );
        });

        it( "should resolve with null when no revision found", function () {
            var promise = this.model( "foo" ).id( "bar" ).rev();
            return expect( promise ).to.become( null );
        });

        it( "should return the current revision when found", function () {
            var rev;
            var foo = this.model( "foo" );

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

                promise = this.model( "foo" ).list();
                this.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
            });

            it( "should do GET request with parameters and return", function () {
                var promise;
                var data = [{
                    id: "foo",
                    foo: "bar"
                }];

                $httpBackend.expectGET( "/foo?bar=baz" ).respond( data );

                promise = this.model( "foo" ).list({
                    bar: "baz"
                });
                this.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
            });

            it( "should return cached array when receiving HTTP status 0", inject(function ( $q ) {
                var promise;
                var data = { foo: "bar" };
                var foo = this.model( "foo" );
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

                this.flush();
                return promise.then(function ( value ) {
                    expect( stub ).to.have.been.called;
                    expect( value ).to.eql([ data ]);
                });
            }));

            it( "should return cached array in the original order", function () {
                var promise;
                var foo = this.model( "foo" );
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
                this.flush();

                $httpBackend.expectGET( "/foo" ).respond( 0, null );
                promise = foo.list();
                this.flush();

                expect( promise ).to.eventually.have.deep.property( "[0].id", 5 );
                expect( promise ).to.eventually.have.deep.property( "[1].id", 3 );
                expect( promise ).to.eventually.have.deep.property( "[2].id", 2 );

                return promise;
            });

            it( "should wipe previous cached values on another request", function () {
                var promise;
                var foo = this.model( "foo" );
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
                $httpBackend.flush();

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
                var foo = this.model( "foo" );
                var data = [{
                    id: "foo"
                }];
                $httpBackend.expectGET( "/foo" ).respond( data );
                foo.list();
                this.flush();

                $httpBackend.expectGET( "/foo" ).respond( 500, {
                    err: 1
                });
                promise = foo.list();
                this.flush();

                return expect( promise ).to.be.rejected;
            });

            it( "should reject if offline and no cached value is present", function () {
                var promise;

                $httpBackend.expectGET( "/foo" ).respond( 0, null );
                promise = this.model( "foo" ).list();
                $httpBackend.flush();

                return expect( promise ).to.be.rejected;
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "on an element", function () {
            it( "should require collection to be supplied", function () {
                expect( this.model( "foo" ).id( "bar" ).list ).to.throw;
            });

            it( "should list elements from child collection", function () {
                var promise;
                var data = {
                    id: "foo",
                    foo: "bar"
                };

                $httpBackend.expectGET( "/foo/bar/baz" ).respond( 200, [ data ] );
                promise = this.model( "foo" ).id( "bar" ).list( "baz" );
                this.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", "bar" );
            });

            it( "should list elements from child collection with params", function () {
                var promise;
                var data = {
                    id: "foo",
                    foo: "bar"
                };

                $httpBackend.expectGET( "/foo/bar/baz?qux=quux" ).respond( 200, [ data ] );
                promise = this.model( "foo" ).id( "bar" ).list( "baz", {
                    qux: "quux"
                });
                this.flush();

                return expect( promise ).to.eventually.have.deep.property( "[0].foo", "bar" );
            });
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".get()", function () {
        describe( "on a collection", function () {
            it( "should require ID to be supplied", function () {
                expect( this.model( "foo" ).get ).to.throw;
            });
        });

        // -----------------------------------------------------------------------------------------

        describe( "on an element", function () {
            it( "should do GET request and return response", function () {
                var promise;
                var data = { foo: "bar" };

                $httpBackend.expectGET( "/foo/bar" ).respond( data );

                promise = this.model( "foo" ).get( "bar" );
                this.flush();

                return expect( promise ).to.eventually.have.property( "foo", data.foo );
            });

            it( "should return cached value when receiving HTTP status 0", inject(function ( $q ) {
                var promise;
                var data = { foo: "bar" };
                var foobar = this.model( "foo" ).id( "bar" );
                var stub = sinon.stub( foobar._db, "get" ).withArgs( "bar" );

                stub.returns( $q.when({
                    doc: data
                }));

                $httpBackend.expectGET( "/foo/bar" ).respond( 0, null );
                promise = foobar.get();

                // TODO find out why we can't use a timeout here
                this.flush( false );
                return promise.then(function ( value ) {
                    expect( stub ).to.have.been.called;
                    expect( value ).to.eql( data );
                });
            }));

            it( "should not use cached value if error happens and not offline", function () {
                var promise;
                var foobar = this.model( "foo" ).id( "bar" );
                var data = {
                    foo: "bar"
                };
                $httpBackend.expectGET( "/foo/bar" ).respond( data );
                foobar.get();
                this.flush();

                $httpBackend.expectGET( "/foo/bar" ).respond( 500, {
                    err: 1
                });
                promise = foobar.get();
                this.flush();

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
            promise = this.model( "foo" ).save( data );
            this.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
        });

        it( "should do POST request and return response for element", function () {
            var promise;
            var data = {
                foo: "bar"
            };

            $httpBackend.expectPOST( "/foo/bar" ).respond( data );
            promise = this.model( "foo" ).id( "bar" ).save( data );
            this.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
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
            promise = this.model( "foo" ).patch( data );
            this.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data[ 0 ].foo );
        });

        it( "should do PATCH request and return response for element", function () {
            var promise;
            var data = { foo: "bar" };

            $httpBackend.expectPATCH( "/foo/bar" ).respond( data );
            promise = this.model( "foo" ).id( "bar" ).patch( data );
            this.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".remove()", function () {
        it( "should do DELETE request and return response for collection", function () {
            var promise;
            $httpBackend.expectDELETE( "/foo" ).respond( 204 );

            promise = this.model( "foo" ).remove();
            this.flush();

            return expect( promise ).to.eventually.be.undefined;
        });

        it( "should do DELETE request and return response for element", function () {
            var promise;
            $httpBackend.expectDELETE( "/foo/bar" ).respond( 204 );

            promise = this.model( "foo" ).id( "bar" ).remove();
            this.flush();

            return expect( promise ).to.eventually.be.undefined;
        });
    });
});