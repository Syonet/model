describe( "Model", function () {
    "use strict";

    var $rootScope, $httpBackend, model;
    var expect = chai.expect;

    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( $injector ) {
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );
        model = $injector.get( "model" );

        this.digest = function () {
            setTimeout(function () {
                $rootScope.$apply();
            });
        };

        this.flush = function () {
            setTimeout(function () {
                $httpBackend.flush( null );
            });
        };
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    afterEach(function () {
        return model( "foo" )._db.destroy();
    });

    it( "should be created with provided path", function () {
        var foo = model( "foo" );

        expect( foo._path ).to.eql({ name: "foo" });
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

            expect( wrapper ).to.throw;
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
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".auth( username, password )", function () {
        it( "should use basic authentication", function () {
            var promise;

            $httpBackend.expectGET( "/foo/bar", function ( headers ) {
                return headers.Authentication === "Basic " + btoa( "foo:bar" );
            }).respond( 200, {
                foo: "bar"
            });

            model.auth( "foo", "bar" );
            promise = model( "foo" ).get( "bar" );

            this.flush();
            return promise;
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".rev()", function () {
        it( "should reject when invoked in a collection", function () {
            var promise = model( "foo" ).rev();
            this.digest();

            return expect( promise ).to.be.rejectedWith( "Can't get revision of a collection!" );
        });

        it( "should resolve with null when no revision found", function () {
            var promise = model( "foo" ).id( "bar" ).rev();
            this.digest();

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

            this.digest();
            return promise;
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".get()", function () {
        it( "should do GET request and return for collection", function () {
            var promise;
            var data = [{
                id: "foo",
                foo: "bar"
            }];

            $httpBackend.expectGET( "/foo" ).respond( data );

            promise = model( "foo" ).get();
            this.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
        });

        it( "should do GET request and return response for element", function () {
            var promise;
            var data = { foo: "bar" };

            $httpBackend.expectGET( "/foo/bar" ).respond( data );

            promise = model( "foo" ).get( "bar" );
            this.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
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
            this.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data.foo );
        });

        it( "should do POST request and return response for element", function () {
            var promise;
            var data = {
                foo: "bar"
            };

            $httpBackend.expectPOST( "/foo/bar" ).respond( data );
            promise = model( "foo" ).id( "bar" ).save( data );
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
            promise = model( "foo" ).patch( data );
            this.flush();

            return expect( promise ).to.eventually.have.deep.property( "[0].foo", data[ 0 ].foo );
        });

        it( "should do PATCH request and return response for element", function () {
            var promise;
            var data = { foo: "bar" };

            $httpBackend.expectPATCH( "/foo/bar" ).respond( data );
            promise = model( "foo" ).id( "bar" ).patch( data );
            this.flush();

            return expect( promise ).to.eventually.have.property( "foo", data.foo );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".remove()", function () {
        it( "should do DELETE request and return response for collection", function () {
            var promise;
            $httpBackend.expectDELETE( "/foo" ).respond( 204 );

            promise = model( "foo" ).remove();
            this.flush();

            return expect( promise ).to.eventually.be.undefined;
        });

        it( "should do DELETE request and return response for element", function () {
            var promise;
            $httpBackend.expectDELETE( "/foo/bar" ).respond( 204 );

            promise = model( "foo" ).id( "bar" ).remove();
            this.flush();

            return expect( promise ).to.eventually.be.undefined;
        });
    });
});