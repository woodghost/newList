define(function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');

  var USER,
    Mdl = Core.Class.Model,
    lcStorage = Core.localStorage;

  function User() {

  }

  User.prototype.user = new Mdl({
    request: function (data,callback) {
      RequestHelper.request(Actions.user,data,callback,this);
    }
  });

  User.prototype.userList = new Mdl({
    request: function (data) {
      RequestHelper.JSONP({
        action: Actions.user+'?id='+data.id+'&callback=afterRequestUserList'
      });
    }
  });
  window.afterRequestUserList = function(data){
    USER.userList.set(data);
  }

  USER = new User;

  return USER;
});
