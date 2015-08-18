describe( "$modelPromise", function () {
    "use strict";

    var $q, $modelPromise, makeEmitter;

    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( _$q_, _$modelPromise_ ) {
        $q = _$q_;
        $modelPromise = _$modelPromise_;
        makeEmitter = $modelPromise.makeEmitter;
    }));

    it( "should return object with an event emitter interface", function () {
        var spy = sinon.spy();
        var obj = makeEmitter({});

        obj.on( "foo", spy );
        obj.emit( "foo", "bar" );

        // Event with listeners should call them
        expect( spy ).to.have.been.calledWith({
            type: "foo"
        }, "bar" );
    });

    it( "should return original object", function () {
        var obj = {};
        expect( makeEmitter( obj ) ).to.equal( obj );
    });

    it( "should allow chaining promises with event emitter interface", function () {
        var spy = sinon.spy();
        var obj = makeEmitter( $q.when() );

        obj.on( "foo", spy );

        obj.then( sinon.spy() ).emit( "foo" );
        expect( spy ).to.have.been.called;
    });

    it( "should allow adding one listener to various events", function () {
        var fn = function () {};
        var obj = makeEmitter({});

        obj.on( "foo bar", fn );
        expect( obj.$$events.foo ).to.have.length( 1 );
        expect( obj.$$events.bar ).to.have.length( 1 );
    });

    // ---------------------------------------------------------------------------------------------

    describe( ".race()", function () {
        var $timeout;
        beforeEach( inject(function ( $injector ) {
            testHelpers( $injector );
            $timeout = $injector.get( "$timeout" );
        }));

        it( "should convert values to promises", function () {
            var promise = $modelPromise.race([ "foo", "bar" ]);
            expect( promise ).to.eventually.eql( "foo" );

            testHelpers.digest();
        });

        it( "should resolve with first resolved promise", function () {
            var promise = $modelPromise.race([
                $timeout(function () { return "foo"; }, 300 ),
                $timeout(function () { return "bar"; }, 500 )
            ]);

            testHelpers.timeout();
            testHelpers.digest( true );

            return expect( promise ).to.eventually.eql( "foo" );
        });

        it( "should reject with first rejected promise", function () {
            var promise = $modelPromise.race([
                $timeout(function () { return "foo"; }, 300 ),
                $q.reject( "foobar" )
            ]);

            testHelpers.timeout();
            testHelpers.digest( true );

            return expect( promise ).to.be.rejectedWith( "foobar" );
        });
    });
});