describe( "$modelEventEmitter", function () {
    "use strict";

    var $q, makeEmitter;

    beforeEach( module( "syonet.model" ) );
    beforeEach( inject(function ( _$q_, $modelEventEmitter ) {
        $q = _$q_;
        makeEmitter = $modelEventEmitter;
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
});