describe( "$modelRequest", function () {
    "use strict";

    var $http, $httpBackend, $modelDB, $modelTemp, req, provider;

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
        $modelTemp = $injector.get( "$modelTemp" );
        $modelDB = $injector.get( "$modelDB" );
        req = $injector.get( "$modelRequest" );
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );

        localStorage.clear();
        return $modelDB.clear();
    });

    it( "should return successful HTTP response", function () {
        var promise;

        $httpBackend.expectGET( "/foo" ).respond( "foo" );
        promise = req( "/foo", "GET" );
        testHelpers.flush( true );

        return expect( promise ).to.eventually.equal( "foo" );
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

    it( "should use basic authentication", function () {
        $httpBackend.expectGET( "/", function ( headers ) {
            return headers.Authorization === "Basic " + btoa( "foo:bar" );
        }).respond( 200, [] );

        req( "/", "GET", null, {
            auth: {
                username: "foo",
                password: "bar"
            }
        });

        testHelpers.flush();
    });

    it( "should replace temporary IDs in data", function () {
        var promise;
        var tempID = $modelTemp.next();
        var data = {
            _id: tempID
        };

        $httpBackend.expectPOST( "/foo", data ).respond({
            id: 1
        });

        promise = req( "/foo", "POST", data );
        testHelpers.flush();

        return promise.then(function () {
            $httpBackend.expectPOST( "/foo", {
                idParent: "1"
            }).respond({
                id: 2
            });

            promise = req( "/foo", "POST", {
                idParent: tempID
            });

            setTimeout(function () {
                testHelpers.digest();
                testHelpers.flush( true );
            });

            return promise;
        });
    });

    it( "should replace temporary IDs in URL", function () {
        var promise;
        var tempID = $modelTemp.next();
        var data = {
            _id: tempID
        };

        $httpBackend.expectPOST( "/foo" ).respond({
            id: 1
        });

        promise = req( "/foo", "POST", data );
        testHelpers.flush();

        return promise.then(function () {
            $httpBackend.expectGET( "/foo/1/bar" ).respond({});

            promise = req( "/foo/" + tempID + "/bar" , "GET" );

            setTimeout(function () {
                testHelpers.digest();
                testHelpers.flush( true );
            });

            return promise;
        });
    });

    it( "should allow bypassing the HTTP request", function () {
        var promise = req( "/foo", "GET", null, {
            bypass: true
        });

        testHelpers.digest( true );
        return expect( promise ).to.be.rejectedWith({
            status: 0,
            data: null
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( "pings", function () {
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

        it( "should not be retriggered before delay has passed", function () {
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

        it( "should be sent to base URL if available", function () {
            $httpBackend.expectHEAD( "/api" ).respond( 200 );
            $httpBackend.expectGET( "/" ).respond( 200 );

            req( "/", "GET", null, {
                baseUrl: "/api"
            });

            testHelpers.flush();
        });

        it( "should be passed thru with force option", function () {
            $http = $http.withArgs( sinon.match({
                method: "HEAD"
            }));

            $httpBackend.whenGET( "/foo" ).respond( [] );

            req( "/foo", "GET" );
            req( "/foo", "GET", null, {
                force: true
            });

            expect( $http ).to.have.callCount( 2 );
            testHelpers.flush();
        });
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

    describe( ".idFieldHeader", function () {
        it( "should be used to determine the ID fields in the response headers", function () {
            var promise;

            provider.idFieldHeader = "X-Id";

            $httpBackend.expectGET( "/foo/bar" ).respond( 200, {
                baz: "qux"
            }, {
                "X-Id": "baz"
            });
            promise = req( "/foo/bar", "GET" );
            expect( promise ).to.eventually.have.property( "_id", "qux" );

            testHelpers.flush();
        });
    });

});