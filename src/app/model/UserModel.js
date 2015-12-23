define(function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');

  var Mdl = Core.Class.Model,
    lcStorage = Core.localStorage;

  function User() {

  }

  //profile
  User.prototype.profile = new Mdl({
    isExist: function (id, name) {
      return this.data && this.data[name] && ((this.data[name].indexOf(id) != -1) || (this.data[name].indexOf(id + '') != -1));
    },
    addId: function (id, name) {
      if (this.data && this.data[name]) {
        this.removeId(id, name);
        this.data[name].push(id);
      }
    },
    removeId: function (id, name) {
      if (this.data && this.data[name] && ((this.data[name].indexOf(id) != -1) || (this.data[name].indexOf(id + '') != -1))) {
        this.data[name].splice(this.data[name].indexOf(id), 1);
        this.data[name].splice(this.data[name].indexOf(id + ''), 1);
      }
    },
    isCreationLiked: function (id) {
      return this.isExist(id, 'creation_likes');
    },
    isProductLiked: function (id) {
      return this.isExist(id, 'product_likes');
    },
    isFollowed: function (id) {
      return this.isExist(id, 'followers');
    },
    addCreationLiked: function (id) {
      this.addId(id, 'creation_likes');
    },
    addProductLiked: function (id) {
      this.addId(id, 'product_likes');
    },
    addFollowed: function (id) {
      this.addId(id, 'followers');
    },
    removeCreationLiked: function (id) {
      this.removeId(id, 'creation_likes');
    },
    removeProductLiked: function (id) {
      this.removeId(id, 'product_likes');
    },
    removeFollowed: function (id) {
      this.removeId(id, 'followers');
    },
    isMe: function (id) {
      return this.data && this.data.user_info && this.data.user_info.id == id;
    },
    request: function (data, callback) {
      RequestHelper.request(Actions.profile,data,callback,this);
    }
  });

  //follow
  User.prototype.follow = new Mdl({
    post: function (data, callback) {
      RequestHelper.post(Actions.follow,data,callback,this);
    }
  });

  User.prototype.userStyle = new Mdl({
    request: function (data, callback) {
      RequestHelper.request(Actions.userStyle,data,callback,this);
    }
  });


  User.prototype.userInfo = new Mdl({
    request: function (data, callback) {
      RequestHelper.request(Actions.userInfo,data,callback,this);
    }
  });


  return new User;
});
