!function () {
    "use strict";

    var proto = window.XMLHttpRequest.prototype;
    var setReqHeader = proto.setRequestHeader;
    proto.setRequestHeader = function ( header, value ) {
        if ( header === "__modelXHR__" ) {
            value( this );
        } else {
            return setReqHeader.apply( this, arguments );
        }
    };
}();