define(function (require, exports, module) {
  var RequestHelper = require('app/model/RequestHelper');
  var Actions = require('app/resources/Actions');
  var Basic = require('app/model/Model');
  var User = require('app/model/UserModel');

  var Mdl = Core.Class.Model,
    lcStorage = Core.localStorage,
    MODEL;

  function Product() {

  }
  Product.prototype.formatHelper = {
    normal: function(data){
      if(data){
        data.price = data.price || 0;
        data.discount_price = data.discount_price || 0;
        data.deja_price = data.deja_price || 0;
        data.discount_percent = data.discount_percent || 0;
        data._price = Core.Num.formatMoney(data.price / 100);
        data._deja_price = Core.Num.formatMoney(data.deja_price / 100);
        data._discount_price = Core.Num.formatMoney(data.discount_price / 100);
        data.description = data.description || '';

        data.liked = User.profile.isProductLiked(data.id);
      }
      return data;
    },
    order: function(data,brand){
      if(data){
        data.brand_name = brand || '';
        data.deja_price = data.deja_price || 0;
        data.total_price = data.unit_price*data.quantity;
        data.total_discount_price = data.deja_price*data.quantity;
        data._total_price = Core.Num.formatMoney(data.total_price / 100);
        data._total_discount_price = Core.Num.formatMoney(data.total_discount_price / 100);
        data.size = data.size || '';
        data.color = data.color || '';
      }
      return data;
    }
  }

  //editing cart product constructor
  Product.prototype.editingCartProduct = function(data){
    var product = JSON.parse(JSON.stringify(data)),
      sku = {},
      quantity = 1;
    this.data = data;
    this.getAttrs = function(){
      return {
        product_id: product.id,
        order_sku: sku,
        quantity: quantity
      }
    }
    this.setSize = function(v){
      sku.size = v;
    }
    this.getSize = function(){
      return sku.size;
    }
    this.setColor = function(v){
      sku.color = v;
    }
    this.getColor = function(){
      return sku.color;
    }
    this.setQuantity = function(v){
      quantity = v;
    }
    this.getQuantity = function(){
      return quantity;
    }
  }
  //editing order product constructor
  Product.prototype.editingOrderProduct = function(data){
    var product = JSON.parse(JSON.stringify(data)),
      selected = product.status==1000,
      updated = false;

    this.getAttrs = function(){
      return {
        order_item_id: product.id,
        quantity: product.quantity
      }
    }
    this.setSize = function(v){
      updated = true;
      product.size = v;
    }
    this.getSize = function(){
      return product.size;
    }
    this.setColor = function(v){
      updated = true;
      product.color = v;
    }
    this.getColor = function(){
      return product.color;
    }
    this.setQuantity = function(v){
      updated = true;
      product.quantity = v;
    }
    this.getQuantity = function(){
      return product.quantity;
    }
    this.sumPrice = function(){
      return product.quantity*product.unit_price;
    }
    this.sumDiscountPrice = function(){
      return product.quantity*(product.deja_price||0);
    }
    this.setSelected = function(v){
      selected = v;
    }
    this.getSelected = function(){
      return selected;
    }
    this.isUpdated = function(){
      return updated;
    }
  }

  //product info
  Product.prototype.product = new Mdl({
    request: function (data, callback) {
      RequestHelper.request(Actions.product, data, callback, this);
    }
  });

  function products(){
    return new Mdl({
      request: function (data, callback) {
        var _this = this;
        RequestHelper.request(Actions.product, data, function(success){
          var listData = _this.get();
          listData.data && listData.data.forEach(function(key,idx){
            MODEL.product.store(key.id,{ret: 0,data: [key]});
          });
          callback && callback(success);
        }, this);
      }
    });
  }

  // products similar
  Product.prototype.productSimilars = products();

  //product like
  Product.prototype.likeProduct = new Mdl({
    post: function (data, callback) {
      RequestHelper.post(Actions.likeProduct,data,callback,this);
    }
  });

  //scene detail products
  Product.prototype.sceneProducts = new Mdl({
    page: 0,
    page_size: 20,
    resetPage: function(){
      this.page = 0;
    },
    request: function (data,callback) {
      var _this = this;
      RequestHelper.getJSON({
        data: {page: _this.page, page_size: _this.page_size, scene_id: data.scene_id},
        action: Actions.sceneProducts,
        complete: function (data) {
          if (data.success) {
            _this.set(data.data);
            _this.page++;
          }
          callback && callback(data.success);
        }
      });
    }
  });
  //best deals
  Product.prototype.specialProducts = new Mdl({
    page: 0,
    page_size: 20,
    resetPage: function(){
      this.page = 0;
    },
    request: function (data,callback) {
      var _this = this;
      RequestHelper.getJSON({
        data: {page: _this.page, page_size: _this.page_size, price_max:2000,price_min:0,sort:1,status:0,tryon:0},
        action: Actions.specialProducts,
        complete: function (data) {
          if (data.success) {
            _this.set(data.data);
            _this.page++;
          }
          callback && callback(data.success);
        }
      });
    }
  });

  Product.prototype.mirrorProducts = products();

  //likedItem products
  Product.prototype.likedItemProducts = new Mdl({
    page: 0,
    page_size: 20,
    resetPage: function(){
      this.page = 0;
    },
    request: function (data,callback) {
      var _this = this;
      RequestHelper.getJSON({
        data: {page: _this.page, page_size: _this.page_size, like_id: data.like_id},
        action: Actions.likedItemProducts,
        complete: function (data) {
          if (data.success) {
            _this.set(data.data);
            _this.page++;
          }
          callback && callback(data.success);
        }
      });
    }
  });


  MODEL = new Product;

  return MODEL;
});
