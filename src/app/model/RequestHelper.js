define(function (require, exports, module) {
  var getJSON = Core.RequestHandler.getJSON,//define vars (definition has its value,generally using "=", while declaration only explain the exist of params)
    postJSON = Core.RequestHandler.postJSON,
    JSONP = Core.RequestHandler.JSONP;

  function request(action,data,callback,scope) { //this scope represent for "this,new Mdl, in UserModel.js
    var __STORE_ID;
    if(data){
      __STORE_ID = data.__STORE_ID;
      delete data.__STORE_ID;
    }
    getJSON({ //ajax
      action: action,  //url
      data: data,   //get, this is param, send to server
      complete: function (data) {  //returned data
        if (data.success) { //jquery object format, return object {Key1:value1, key2:value2}(JSON format)
          scope && scope.set && scope.set(data.data,__STORE_ID);
        }
        callback && callback(data.success);
      }
    });
  }
  function post(action,data,callback,scope,options) {
    options = options || {};
    postJSON({
      action: action,
      data: data,
      contentType: options.contentType||"application/json;charset=utf-8",
      complete: function (data) {
        if (data.success) {
          scope && scope.set && scope.set(data.data);
        }
        callback && callback(data.success);
      }
    });
  }

  return {
    getJSON: getJSON,
    postJSON: postJSON,
    JSONP: JSONP,
    request: request,
    post: post
  };
});
