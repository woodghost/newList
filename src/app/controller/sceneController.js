define(function (require, exports, module) {
  var Actions = require('../resources/Actions');
  var BasicModel = require('app/model/Model');
  var BasicView = require('app/view/View');
  var sceneView = require('app/view/sceneView');

  function sceneController(){
    this.models = {
      Basic: BasicModel
    }
    this.views = {
      Basic: BasicView,
      scene: sceneView
    }

    var CTRL = this,
      viewNames,
      curViewId = '',
      viewsceneQuery = {};

    viewNames = {
      'scene': 'scene'
    }
    Core.Router.subscribe('/scene/', onViewscene, unViewscene);

    //统计视图
    Core.Event.on('analyticsCurView', analyticsCurView);
    //forwardscene
    Core.Event.on('forwardscene', forwardscene);


    function unViewscene() {
      CTRL.views.scene.hide();
    }

    function onViewscene(req){
      curViewId = 'scene';
      viewsceneQuery = req.query;
      CTRL.views.scene.show();

      //追加统计
      analyticsCurView();
    }
    function forwardscene(arg){
      Core.Router.forward('/scene/' + (arg || ''));
    }

    function analyticsCurView(params, title) {
      if (!Core.Router.currentMatch(['/scene/'])) {
        return;
      }
      params = params ? ('&' + params) : '';
      title = title || viewNames[curViewId] || document.title;

      Core.Event.trigger('analytics', 'viewid=' + curViewId + params, title);
    }
  }
  return new sceneController;
});
