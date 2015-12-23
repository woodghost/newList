define(function (require, exports, module) {
  var thisPage = window.location.href
    //注意，保留search 是为了避免微信自动追加的应用检测状态值
    //.replace(window.location.search,'')
    .replace(window.location.hash, '');
  var thisPath = thisPage.substring(0, thisPage.lastIndexOf('/') + 1);

  ///*official
  var Actions = {
    login: Core.localHost + '/account/login_third?pf={PF}&success={SURL}&fail={FURL}',
    profile: Core.localHost + '/account/h5_info?tags=followers,product_likes,creation_likes,user_info',
    follow: Core.localHost + '/follow/sync',

    homeBanner: Core.localHost +'/config/banner',

    eventlist: Core.localHost + '/event/list/',
    eventinfo: Core.localHost + '/event/infos/',

    vote: Core.localHost + '/vote/get_random_single?limit=20',
    doVote: Core.localHost + '/vote/single_vote',

    getBFC: Core.localHost + '/j4u/get_bfc',
    updateBFC: Core.localHost + '/j4u/update_bfc',
    faceResult: Core.localHost + '/face/result',

    fashionista: Core.localHost + '/fashionista/get_list',
    ambassador: Core.localHost + '/fashionista/get_ambassador_detail',

    creation: Core.localHost + '/creation/h5_get_multi',
    likeCreation: Core.localHost + '/creation/h5_like',
    delCreation: Core.localHost + '/creation/h5_delete',

    product: Core.localHost + '/products/get_product_display_info',
    likeProduct: Core.localHost + '/favorite/sync',
    specialProducts: Core.localHost + '/products/get_special',

    checkout: Core.localHost + '/order/direct_checkout',
    checkoutFromCart: Core.localHost + '/cart/checkout',
    updateDeliverInfo: Core.localHost + '/order/update_deliver_info',
    promotionCode: Core.localHost + '/order/apply_code',

    placeOrder: Core.localHost + '/order/place_order',
    rePlaceOrder: Core.localHost + '/order/try_again_place_order',
    orderHistory: Core.localHost + '/order/get_order_history',
    orderDetail: Core.localHost + '/order/get_order_detail_info',
    reOrderPlaceOrder: Core.localHost + '/order/reorder_place_order',

    cartInfo: Core.localHost + '/cart/get_cart_info',
    addToCart: Core.localHost + '/cart/add_item',
    deleteCartItem: Core.localHost + '/cart/delete_item',
    updateCartItem: Core.localHost + '/cart/update_item',

    addressBook: Core.localHost + '/order/address/get',
    addAddress: Core.localHost + '/order/address/add',
    updateAddress: Core.localHost + '/order/address/update',
    delAddress: Core.localHost + '/order/address/delete',

    sceneCategory: Core.localHost +'/config/get',
    sceneDetail: Core.localHost + '/style/get_fp_scenedetail',
    sceneProducts: Core.localHost + '/style/get_fp_product',

    myStyle: Core.localHost + '',
    likedItemProducts: Core.localHost + '',

    userProfile: '',
    userStyle: '',



    dejame: 'http://deja.me/u/XPKab9',
    main: thisPath,
    analytics: thisPath + 'analytics.html',
    dejaAppAndroid: 'http://deja.me/u/XPKab9',
    dejaAppIos: 'http://deja.me/u/fzb1KO',
    dejaDwonloadBridge: 'http://m.deja.me/bridge/',
    dejaShareLogo: thisPath + 'resources/images/deja_icon_ios_228.png',
    dejaUserAvatar: thisPath + 'resources/images/pic_avatar_setting_default_2x.png',
    dejafashionSchema: 'dejafashion://'
  }
  //*/

  ///_DEBUG_*Todo: debug actions
  var Actions = {
    login: Core.localHost + '/account/login_third?success={SURL}&fail={FURL}&pf={PF}',
    profile: 'data/profile.json',
    follow: 'data/follow.json',

    homeBanner: 'data/homebanner.json',

    eventlist: 'data/eventlist.json',
    eventinfo: 'data/eventinfo.json',

    vote: 'data/vote.json',
    doVote: 'data/vote.json',

    getBFC: 'data/getbfc.json',
    updateBFC: 'data/updatebfc.json',
    faceResult: 'data/faceresult.json',

    fashionista: 'data/fashionista.json',
    ambassador: 'data/ambassador.json',

    creation: 'data/creation.json',
    likeCreation: 'data/likecreation.json',
    delCreation: 'data/delcreation.json',

    product: 'data/product.json',
    likeProduct: 'data/likeproduct.json',
    specialProducts: 'data/specialproduct.json',

    checkout: 'data/checkout.json',
    checkoutFromCart: 'data/checkoutfromcart.json',
    updateDeliverInfo: 'data/updatedeliverinfo.json',
    promotionCode: 'data/promotioncode.json',

    placeOrder: thisPath+'placeorder.html',
    rePlaceOrder: thisPath+'placeorder.html',
    orderHistory: 'data/orderhistory.json',
    orderDetail: 'data/orderdetail.json',
    reOrderPlaceOrder: 'data/reorderplaceorder.json',

    cartInfo: 'data/cart.json',
    addToCart: 'data/addtocart.json',
    deleteCartItem: 'data/deletecartitem.json',
    updateCartItem: 'data/updatecartitem.json',

    addressBook: 'data/addressbook.json',
    addAddress: 'data/addaddress.json',
    updateAddress: 'data/updateaddress.json',
    delAddress: 'data/deladdress.json',

    sceneCategory: 'data/scenecategory.json',
    sceneDetail: 'data/scenedetail.json',
    sceneProducts: 'data/sceneproducts.json',

    myStyle: 'data/mystyle.json',
    likedItemProducts: 'data/sceneproducts.json',

    userInfo: 'data/user.json',//User info:http://api.dejafashion.com/account/infos?ids=10401&invoker_uid=10070
    userStyle: 'data/userstyle.json',//User detail:http://api.dejafashion.com/account/detail?id=10401


    dejame: 'http://deja.me/u/XPKab9',
    main: thisPath,
    analytics: thisPath + 'analytics.html',
    dejaAppAndroid: 'http://deja.me/u/XPKab9',
    dejaAppIos: 'http://deja.me/u/fzb1KO',
    dejaDwonloadBridge: 'http://m.deja.me/bridge/',
    dejaShareLogo: thisPath + 'resources/images/deja_icon_ios_228.png',
    dejaUserAvatar: thisPath + 'resources/images/pic_avatar_setting_default_2x.png',
    dejafashionSchema: 'dejafashion://'
  }
  //*/
  return Actions;
});

