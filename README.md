# Model
Angular.js RESTful API with fallback to PouchDB when offline.

[![Build Status](https://img.shields.io/travis/Syonet/model.svg?style=flat-square)](https://travis-ci.org/Syonet/model)
[![Code Climate](https://img.shields.io/codeclimate/github/Syonet/model.svg?style=flat-square)](https://codeclimate.com/github/Syonet/model)
[![Coverage](https://img.shields.io/coveralls/Syonet/model.svg?style=flat-square)](https://coveralls.io/r/Syonet/model)

## Installation
Install with Bower:

```shell
$ bower install syonet.model
```

## Usage
Inject `syonet.model` module into your app:

```javascript
angular.module( "app", [ "syonet.model" ] );
```

Then, inject the `model` service in any controller:

```javascript
angular.module( "app" ).controller( "MyController", function ( model ) {
    model( "foo" ).id( "bar" ).save({
        baz: "qux",
        creationDate: new Date()
    }).then(function ( document ) {
        // Document is now persisted!
        console.log( document );
    });
});
```

## `model` service API
### `[new] model( name )`
Returns a new Model instance for the `name` collection.

### `.id( [id] )`
Get the ID of the current element, or create a new element with the specified ID and return it.

### `.model( name )`
Create a new model for the specified `name` collection and return it.

### `.rev()`
Return a promise for the current revision of the element, or `null` if no revision is found.  
This method will throw an `Error` if invoked in a collection.

### `.toURL()`
Return the URL for the current model, including its base URL. If the ID is an array, they're joined with a comma `,`.  
Example:

```javascript
model( "foo" ).id( "bar" ).toURL(); // => /foo/bar
```

### `.list( [collection], [query] )`
Lists all elements from a collection, and reutrns a promise for it. Triggers a `GET` request and saves the result to the PouchDB cache.  
If this method is invoked in an element, then passing the `collection` argument is mandatory.  
The `query` argument is passed as query string parameters for the request.

If the request fails with HTTP code `0`, then the cached collection is returned in their previous order.

Example:

```javascript
model( "foo" ).list({ bar: "baz" }); // GET /foo?bar=baz
model( "foo" ).id( "bar" ).list( "baz" ); // GET /foo/bar/baz
```

### `.get( [id] )`
Get a element and returns a promise for it. Triggers a `GET` request and saves the result to the PouchDB cache.  
If this method is invoked in an collection, then passing the `id` argument is mandatory.  

If the request fails with HTTP code `0`, then the cached element is returned.

Example:

```javascript
model( "foo" ).get( "bar" ); // GET /foo/bar
model( "foo" ).id( "bar" ).get(); // GET /foo/bar
```

### `.save( data )`
Save an element or collection and return a promise for it. Triggers a `POST` request and saves the result to the PouchDB cache.

If the request fails with HTTP code `0`, then this request will be stored to be triggered when the user/server is back online.

Example:

```javascript
model( "foo" ).id( "bar" ).save({
    foo: "bar"
});
// POST /foo/bar
// { foo: "bar" }

// Batch save
model( "foo" ).save([{
    id: 1,
    foo: "bar"
}, {
    id: 2,
    foo: "baz"
]);
// POST /foo
// [...]
```

### `.patch( data )`
Patch an element or collection and return a promise for it. Triggers a `PATCH` request and saves the result to the PouchDB cache.

If the request fails with HTTP code `0`, then this request will be stored to be triggered when the user/server is back online.

Example:

```javascript
model( "foo" ).id( "bar" ).patch({
    foo: "bar"
});
// PATCH /foo/bar
// { foo: "bar" }

// Batch save
model( "foo" ).patch([{
    id: 1,
    foo: "bar"
}, {
    id: 2,
    foo: "baz"
]);
// PATCH /foo
// [...]
```

### `.remove()`
Remove an element or collection and returns a promise for it. Triggers a `DELETE` request and wipes the
corresponding elements from the PouchDB cache.

If the request fails with HTTP code `0`, then this request will be stored to be triggered when the user/server is back online.

Example:

```javascript
model( "foo" ).remove(); // => DELETE /foo
model( "foo" ).id( "bar" ).remove(); // => DELETE /foo/bar
```

## License
MIT
