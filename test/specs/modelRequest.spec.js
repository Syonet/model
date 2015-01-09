describe( "$modelRequest", function () {
    "use strict";

    var $http, $httpBackend, req, provider;

    beforeEach( module( "syonet.model", function ( $provide, $modelRequestProvider ) {
        provider = $modelRequestProvider;

        $provide.decorator( "$http", function ( $delegate ) {
            return sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        // Initialize test helpers
        testHelpers( $injector );

        $http = $injector.get( "$http" );
        $httpBackend = $injector.get( "$httpBackend" );
        req = $injector.get( "$modelRequest" );
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    it( "should return successful HTTP response", function () {
        var promise;

        $httpBackend.expectGET( "/foo" ).respond( "foo" );
        promise = req( "/foo", "GET" );
        testHelpers.flush( true );

        return expect( promise ).to.eventually.have.property( "data", "foo" );
    });

    it( "should return errored response", function () {
        var promise;

        $httpBackend.expectGET( "/foo" ).respond( 404, "foo" );
        promise = req( "/foo", "GET" );
        testHelpers.flush( true );

        return expect( promise ).to.eventually.be.rejectedWith({
            status: 404,
            data: "foo"
        });
    });

    it( "should timeout requests", function ( done ) {
        var promise;

        provider.timeout = 100;
        testHelpers.ping.respond( 0 );
        $httpBackend.expectGET( "/foo" ).respond( 200, {} );
        promise = req( "/foo", "GET" );

        setTimeout(function () {
            testHelpers.flush( true );

            expect( promise ).to.eventually.be.rejectedWith( sinon.match({
                status: 0
            })).then( done, done );
        }, 100 );
    });

    it( "should not retrigger ping request before ping delay has passed", function () {
        $http = $http.withArgs( sinon.match({
            method: "HEAD"
        }));

        $httpBackend.whenGET( "/foo" ).respond( [] );

        req( "/foo", "GET" );
        req( "/foo", "GET" );

        expect( $http ).to.have.callCount( 1 );
        testHelpers.flush();
        testHelpers.timeout();

        req( "/foo", "GET" );
        expect( $http ).to.have.callCount( 2 );
        testHelpers.flush();
    });

    it( "should pass request data as query string for safe methods", function () {
        $httpBackend.expectGET( "/?foo=bar" ).respond( "foobar" );
        req( "/", "GET", {
            foo: "bar"
        });

        testHelpers.flush();
    });

    it( "should pass request data as body for unsafe methods", function () {
        var data = {
            foo: "bar"
        };

        $httpBackend.expectPOST( "/", data ).respond( "foobar" );
        req( "/", "POST", data );

        testHelpers.flush();
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".timeout", function () {
        it( "should define the timeout for pinging the server", function () {
            provider.timeout = 123;

            $httpBackend.expectGET( "/" ).respond( 200 );
            req( "/", "GET" );

            expect( $http ).to.have.been.calledWithMatch({
                method: "HEAD",
                timeout: 123
            });

            testHelpers.flush();
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".isSafe( method )", function () {
        it( "should return true for GET/HEAD method", function () {
            expect( req.isSafe( "GET" ) ).to.be.ok;
            expect( req.isSafe( "HEAD" ) ).to.be.ok;
        });

        it( "should return false for other methods", function () {
            expect( req.isSafe( "POST" ) ).to.not.be.ok;
            expect( req.isSafe( "PUT" ) ).to.not.be.ok;
            expect( req.isSafe( "PATCH" ) ).to.not.be.ok;
            expect( req.isSafe( "DELETE" ) ).to.not.be.ok;
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".auth( username, password )", function () {
        it( "should use basic authentication", function () {
            $httpBackend.expectGET( "/", function ( headers ) {
                return headers.Authorization === "Basic " + btoa( "foo:bar" );
            }).respond( 200 );

            req.auth( "foo", "bar" );
            req( "/", "GET" );

            testHelpers.flush();
        });

        it( "should allow usage of empty password", function () {
            $httpBackend.expectGET( "/", function ( headers ) {
                return headers.Authorization === "Basic " + btoa( "foo:" );
            }).respond( 200 );

            req.auth( "foo" );
            req( "/", "GET" );

            testHelpers.flush();
        });
    });
});