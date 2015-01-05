describe( "Model Provider", function () {
    "use strict";

    var $rootScope, $httpBackend, provider, model;
    var expect = chai.expect;

    beforeEach( module( "syonet.model", function ( $provide, modelProvider ) {
        provider = modelProvider;

        $provide.decorator( "$http", function ( $delegate ) {
            return sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        $rootScope = $injector.get( "$rootScope" );
        $httpBackend = $injector.get( "$httpBackend" );
        model = $injector.get( "model" );

        // Ping request backend definition
        this.ping = $httpBackend.whenHEAD( "/" ).respond( 200 );

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

    describe( ".dbNamePrefix", function () {
        it( "should be the prefix of the model DB", function () {
            var promise;

            provider.dbNamePrefix = "model";
            promise = model( "foo" )._db.info();

            return expect( promise ).to.eventually.have.property( "db_name", "model.foo" );
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
            promise = model( "foo" ).get( "bar" );
            this.flush();

            return expect( promise ).to.eventually.have.property( "_id", "qux" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".base()", function () {
        it( "should be used as the base URL for requests", function () {
            provider.base( "http://foo/api" );
            expect( model( "foo" ).toURL() ).to.equal( "http://foo/api/foo" );
        });

        it( "should return the base URL for requests", function () {
            expect( provider.base() ).to.equal( "/" );
        });
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".timeout", function () {
        it( "should define the timeout for pinging the server", inject(function ( $http ) {
            provider.timeout = 123;
            model( "foo" ).list();

            expect( $http ).to.have.been.calledWithMatch({
                method: "HEAD",
                timeout: 123
            });

            this.flush();
        }));
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".pingDelay", function () {
        var $http, $timeout;
        beforeEach( inject(function ( _$http_, _$timeout_ ) {
            $http = _$http_;
            $timeout = _$timeout_;
        }));

        it( "should not retrigger ping request before ping delay has passed", function () {
            $http = $http.withArgs( sinon.match({
                method: "HEAD"
            }));

            $httpBackend.whenGET( "/foo" ).respond( [] );

            model( "foo" ).list();
            model( "foo" ).list();

            expect( $http ).to.have.callCount( 1 );
            $httpBackend.flush();
            $timeout.flush();

            model( "foo" ).list();
            expect( $http ).to.have.callCount( 2 );
            $httpBackend.flush();
        });
    });
});