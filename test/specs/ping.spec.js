describe( "$modelPing", function () {
    "use strict";

    var $http, $httpBackend, provider, ping;

    beforeEach( module( "syonet.model", function ( $provide, $modelPingProvider ) {
        provider = $modelPingProvider;
        $provide.decorator( "$http", function ( $delegate ) {
            return sinon.spy( $delegate );
        });
    }));

    beforeEach( inject(function ( $injector ) {
        // Initialize test helpers
        testHelpers( $injector );

        $http = $injector.get( "$http" );
        $httpBackend = $injector.get( "$httpBackend" );
        ping = $injector.get( "$modelPing" );
    }));

    afterEach(function () {
        $httpBackend.verifyNoOutstandingExpectation( false );
        $httpBackend.verifyNoOutstandingRequest( false );
    });

    it( "should reject when pinged", function () {
        var promise = ping( "/" );
        testHelpers.flush( true );

        return expect( promise ).to.be.rejected;
    });

    it( "should resolve when not pinged", function () {
        var promise = ping( "/" );

        testHelpers.ping.respond( 0 );
        testHelpers.flush( true );

        return expect( promise ).to.be.fulfilled;
    });

    it( "should timeout", function () {
        provider.timeout = 100;
        ping( "/" );

        testHelpers.flush();

        expect( $http ).to.have.been.calledWithMatch({
            method: "HEAD",
            timeout: 100
        });
    });

    it( "should not be retriggered before delay has passed", function () {
        ping( "/" );
        ping( "/" );

        expect( $http ).to.have.callCount( 1 );
        testHelpers.flush();
        testHelpers.timeout();

        ping( "/" );
        expect( $http ).to.have.callCount( 2 );
        testHelpers.flush();
    });

    it( "should be passed thru with force option", function () {
        ping( "/" );
        ping( "/", true );

        expect( $http ).to.have.callCount( 2 );
        testHelpers.flush();
    });

    it( "should execute request before delay if URLs are different", function () {
        $httpBackend.whenHEAD( "/foo" ).respond( 200 );

        ping( "/" );
        ping( "/foo" );

        expect( $http ).to.have.callCount( 2 );
        testHelpers.flush();
    });
});