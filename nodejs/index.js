const request = require('request');
const config = require('config');
const cheerio = require('cheerio');
const async = require('async');
const AWS = require('aws-sdk');

AWS.config.update({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com"
});

//const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

var now;

var req = request.defaults({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'ko,en-US;q=0.8,en;q=0.6'
    },
    jar: true,
    gzip: true,
    followAllRedirects: true,
    //encoding: null
});

var captchaId = '';
var saltValue = '';
var loginToken = '';

var start = function (callback) {
    callback(null, {
        data: {
            items: [],
        },
        naver_link: "https://front.wemakeprice.com/affiliate/bridge?channelId=1000020&prodNo=138595957",
        naver_bridge: "",
        message: "",
        loggedIn: false,
    });
};

var requestNaverShoppingSearch = function (result, callback) {
    var option = {
        //uri: 'http://www.wemakeprice.com/main/103900/103912',
        uri: 'https://search.shopping.naver.com/search/all.nhn?query=위메프&pagingSize=80',
        method: 'GET',
        json: true,
        qs: {
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        if (!err) {
            var $ = cheerio.load(body);

            result.naver_link = $('._itemSection').get().reduce(function(prev, curr) {
                if (prev) {
                    return prev;
                }

                var el = $('div.info_mall > p > a.btn_detail._btn_mall_detail', curr);
                if (el) {
                    var data = el.data();
                    if (data && data.mallName && data.mallName === '위메프') {
                        if ($('div.info > div.tit > a', curr).attr('href')) {
                            return $('div.info > div.tit > a', curr).attr('href');
                        } else {
                            return null;
                        }
                    }
                }

                return null;
            }, null);
        }

        //#_search_list > div.search_list.basis > ul
        callback(err, result);
    });
};

var requestNaverShoppingBridge = function (result, callback) {
    var option = {
        //uri: 'http://www.wemakeprice.com/main/103900/103912',
        uri: result.naver_link,
        method: 'GET',
        json: true,
        qs: {
        },
        header: {
            'Referer': 'https://search.shopping.naver.com/search/all.nhn?query=위메프&pagingSize=80'
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        callback(err, result);
    });
};

var requestNaverShoppingWemakeprice = function (result, callback) {
    var option = {
        //uri: 'http://www.wemakeprice.com/main/103900/103912',
        uri: result.naver_link.replace('adcrNoti', 'adcr'),
        method: 'GET',
        json: true,
        qs: {
        },
        header: {
            'Referer': result.naver_link
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        result.naver_bridge = result.response.request.uri.search;

        callback(err, result);
    });
};

var requestListPage = function (result, callback) {
    var option = {
        //uri: 'http://www.wemakeprice.com/main/103900/103912',
        uri: 'http://www.wemakeprice.com/main/get_deal_more/103900/103912',
        method: 'GET',
        json: true,
        qs: {
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Parsing Item List");
        if (!err) {
            var $ = cheerio.load(body.html);
            result.data.items = $('li').map((index, element) => {
                var item = {};

                var href = $("span.type03 > a", element).attr('href').split('?')[0];
                if (href.startsWith('http')) {
                    item.url = href;
                } else {
                    if (href.endsWith('/103900/')) {
                        item.url = 'http://www.wemakeprice.com' + href.replace(/\/103900\//g, '');
                    } else {
                        item.url = 'http://www.wemakeprice.com' + href;
                    }
                }
                item.bridge = result.naver_bridge;
                item.price = parseInt($("span.type03 > a > span.box_desc > span.txt_info > span.price > span.sale", element).text().replace(/,/g, ''), 10);
                item.title = $("span.type03 > a > span.box_desc > strong.tit_desc", element).text();

                if (item.price < 88000) {
                    return null;
                }
                if (item.price > 101000) {
                    return null;
                }
                // 판매 종료
                if (body.html.indexOf('btn_buy_end') > -1) {
                    return null;
                }
                // 매진
                if (body.html.indexOf('btn_soldout2') > -1) {
                    return null;
                }
                return item;
            }).get();
        }

        callback(err, result);
    });
};

var parseItem = function (item, callback) {
    var option = {
        uri: item.url + item.bridge,
        method: 'GET',
        qs: {
        }
    };

    req(option, function (err, response, body) {
        if (!err) {
            var matches = body.match(/(var aCouponList = .*)/);
            item.couponList = [];
            if (matches && matches.length > 1) {
                console.log(item.url, matches[1]);
                eval(matches[1]);

                item.couponList = aCouponList.map((value, index, array) => {
                    if (value.publish_start_time < now && now <= value.publish_end_time && value.usable_time < now && now <= value.expire_time) {
                        return {
                            coupon_value: value.coupon_value,
                            max_discount_price: value.max_discount_price,
                            min_payment_amount: value.min_payment_amount,
                            //publish_start_time: value.publish_start_time,
                            //publish_end_time: value.publish_end_time,
                            //usable_time: value.usable_time,
                            //expire_time: value.expire_time,
                        };
                    } else {
                        return null;
                    }
                });
            } else {
                console.log(item.url, "Pattern not found!");
            }
        }
        item.lowestPrice = item.couponList.reduce((prev, curr) => {
            var curr_price = item.price;
            for (var i = 0; i < 20; i++) {
                if (curr.min_payment_amount <= (item.price * i)) {
                    curr_price = Math.floor(((item.price * i) - curr.coupon_value) / i);
                    break;
                }
            }
            if (prev > curr_price) {
                return curr_price;
            } else {
                return prev;
            }
        }, item.price);
        callback(err);
    });
};

var traceProducts = [
    "컬쳐랜드",
    "해피머니 온라인상품권",
    "도서문화상품권",
    "롯데",
    "신세계",
];

var lowestPrices;
var statistics;

var getProductId = function (item) {
    for (var i = 0; i < traceProducts.length; i++) {
        if (item.title.indexOf(traceProducts[i]) > -1) {
            return traceProducts[i];
        }
    }
    return null;
};

var getStatistics = function (item, callback) {
    var productId = getProductId(item);
    var lowPrices = {
        _lowest_item: item,
        _latest_data: {price: item.price, ts: 0},
        _007d_price: item.price,
        _030d_price: item.price,
        _365d_price: item.price,
    };

    if (!productId) {
        callback(lowPrices);
        return;
    }

    if (statistics[productId] && statistics[productId].lowPrices) {
        if (item.lowestPrice < statistics[productId].lowPrices._lowest_item.lowestPrice) {
            statistics[productId].lowPrices._lowest_item = item;
        }
        callback(statistics[productId].lowPrices);
        return;
    }

    var getParams = {
        TableName: 'webdata',
        Key: {
            site: productId,
            timestamp: 0,
        }
    };

    console.log(`Get Statistics for ${productId}`);
    docClient.get(getParams, (err, res) => {
        var data = [];
        if (!err) {
            //console.log(JSON.stringify(res));
            if (res && res.Item && res.Item.data) {
                data = res.Item.data;
            }
        }

        statistics[productId] = {};

        lowPrices = data.reduce((prev, curr) => {
            // 7일 이내 데이터이면
            if (now < curr.ts + 7 * 24 * 60 * 60) {
                if (curr.price < prev._007d_price) {
                    prev._007d_price = curr.price;
                }
            }
            // 30일 이내 데이터이면
            if (now < curr.ts + 30 * 24 * 60 * 60) {
                if (curr.price < prev._030d_price) {
                    prev._030d_price = curr.price;
                }
            }
            // 1년 이내 데이터이면
            if (now < curr.ts + 365 * 24 * 60 * 60) {
                if (curr.price < prev._365d_price) {
                    prev._365d_price = curr.price;
                }
            }

            if (prev._latest_data.ts < curr.ts) {
                prev._latest_data = curr;
            }
            return prev;
        }, lowPrices);
        statistics[productId].lowPrices = lowPrices;
        callback(lowPrices);
    });
};

var updateStatistics = function (productId, lowestPrice, callback) {
    var getParams = {
        TableName: 'webdata',
        Key: {
            site: productId,
            timestamp: 0,
        }
    };

    console.log(`Get Statistics for ${productId}`);
    docClient.get(getParams, (err, res) => {
        var data = [];
        if (!err) {
            //console.log(JSON.stringify(res));
            if (res && res.Item && res.Item.data) {
                data = res.Item.data;
            }
        }

        data.push({ ts: now, price: lowestPrice });

        var unique_data = [];

        for (var i = 0; i < data.length; i++) {
            var found = false;
            for (var j = 0; j < unique_data.length; j++) {
                if (unique_data[j].ts == data[i].ts) {
                    found = true;
                    unique_data[j].price = data[i].price;
                }
            }
            if (!found) {
                unique_data.push(data[i]);
            }
        }

        unique_data = unique_data.map((d) => {
            // 1년 이내 데이터이면
            if (now < d.ts + 365 * 24 * 60 * 60) {
                return d;
            }
        });

        var putParams = {
            TableName: 'webdata',
            Item: {
                site: productId,
                timestamp: 0,
                ttl: now + 30 * 24 * 60 * 60,
                data: unique_data
            }
        };

        console.log("Updating Statistics");
        docClient.put(putParams, (err, res) => {
            if (!err) {
                console.log(err);
            }
            console.log("Statistics updated");
            if (callback) {
                callback(null);
            }
        });
    });
};

var processItem = function (result, saved, item, callback) {
    console.log(`신규 상품 확인 ${item.title} : ${item.url}, ${item.lowestPrice}`);

    var found = saved.items.reduce((f, curr) => {
        if (f) {
            return f;
        } else {
            if (curr.url === item.url) {
                return curr;
            }
        }
    }, null);

    getStatistics(item, (lowPrices) => {
        //console.log(lowPrices);
        if (!found) {
            console.log(`New item ${item.title}`);
            result.message += `[신규 상품 등록]\n`;
            result.message += `품명: ${item.title}\n`;
            result.message += `가격: ${item.price}\n`;
            result.message += `최저가: ${item.lowestPrice}\n주최저가: ${lowPrices._007d_price}\n월최저가: ${lowPrices._030d_price}\n년최저가: ${lowPrices._365d_price}\n`;
            result.message += `URL: ${item.url}\n`
            result.message += `\n`;
        } else {
            console.log(`통계 최저가: ${lowPrices._latest_data.price}, 최저가 변동: ${found.lowestPrice} => ${item.lowestPrice}`);
            if (item.lowestPrice !== found.lowestPrice) {
                console.log(`New lowest price ${item.title} => ${item.lowestPrice}`);
                result.message += `[가격 변동]\n`;
                result.message += `품명: ${item.title}\n`;
                result.message += `가격: ${item.price}\n`
                result.message += `최저가: ${found.lowestPrice} => ${item.lowestPrice}\n`
                result.message += `주최저가: ${lowPrices._007d_price}\n월최저가: ${lowPrices._030d_price}\n년최저가: ${lowPrices._365d_price}\n`;
                result.message += `URL: ${item.url}\n`;
                result.message += `\n`;
            }
        }
        callback(null);
    });
};

var makeReport = function (result, callback) {
    var queryParams = {
        TableName: 'webdata',
        KeyConditionExpression: "#site = :site",
        ScanIndexForward: false,
        Limit: 1,
        ExpressionAttributeNames: {
            "#site": "site"
        },
        ExpressionAttributeValues: {
            ":site": 'wemakeprice-collect'
        }
    };

    console.log("Making Report");
    docClient.query(queryParams, (err, res) => {
        if (!err) {
            var saved = { items: [] };
            if (res.Items.length > 0 && res.Items[0].data) {
                saved = res.Items[0].data;
            }
            async.series([
                function (callback) {
                    async.each(saved.items, (item, callback) => {
                        console.log(`기존 상품 확인: ${item.title} : ${item.url} ${item.lowestPrice}`);
                        var found = result.data.items.reduce((f, curr) => {
                            if (f) {
                                return f;
                            } else {
                                if (curr.url === item.url) {
                                    return curr;
                                }
                            }
                        }, null);

                        if (!found) {
                            console.log(`Soldout item ${item.title}`);
                            result.message += `[판매 중지]\n`;
                            result.message += `품명: ${item.title}\n`;
                            result.message += `가격: ${item.price}\n`;
                            result.message += `최저가: ${item.lowestPrice}\n`;
                            result.message += `URL: ${item.url}\n`;
                            result.message += `\n`;
                        }
                        callback(null);
                    }, function (err) {
                        callback(err);
                    });
                },
                function (callback) {
                    async.eachSeries(result.data.items, (item, callback) => {
                        processItem(result, saved, item, callback);
                    }, function (err) {
                        callback(err);
                    });
                },
            ], function (err) {
                if (!err) {
                    for (var productId in statistics) {
                        if (statistics[productId].lowPrices._lowest_item.lowestPrice !== statistics[productId].lowPrices._latest_data.price) {
                            console.log(`Update statistics ${productId} ${statistics[productId].lowPrices._latest_data.price} => ${statistics[productId].lowPrices._lowest_item.lowestPrice}`);
                            updateStatistics(productId, statistics[productId].lowPrices._lowest_item.lowestPrice);
                        }
                    }
                }
                callback(err, result);
            });
        } else {
            callback(err, result);
        }
    });
};

var saveReport = function (result, callback) {
    var putParams = {
        TableName: 'webdata',
        Item: {
            site: 'wemakeprice-collect',
            timestamp: now,
            ttl: now + 30 * 24 * 60 * 60,
            data: result.data
        }
    };

    console.log("Saving Report");
    docClient.put(putParams, (err, res) => {
        if (!err) {
            console.log(JSON.stringify(res));
        }
        callback(err, result);
    });
};

var notifyReport = function (result, callback) {
    console.log("Notify Report");
    if (result.message.length > 0) {
        var telegramConfig = config.get('telegram');
        var option = {
            uri: `https://api.telegram.org/${telegramConfig.bot_id}:${telegramConfig.token}/sendMessage`,
            method: 'POST',
            json: true,
            body: {
                'chat_id': telegramConfig.chat_id,
                'text': result.message
            }
        };

        req(option, function (err, response, body) {
            if (!err && (body && !body.ok)) {
                console.log(body);
                callback("Send Message Fail", result);
            } else {
                callback(err, result);
            }
        });
    } else {
        callback(null, result);
    }
};


// http://www.11st.co.kr/category/DisplayCategory.tmall?method=getDisplayCategory3Depth&dispCtgrNo=1017940#fromPricetoPrice%%90000%%100000%%undefined$$sortCd%%L$$pageNum%%1
// http://www.11st.co.kr/category/DisplayCategory.tmall?method=getSearchFilterAjax&filterSearch=Y&pageLoadType=ajax&selectedFilterYn=Y&version=1.2&prdImgQuality=&prdImgScale=&sellerNos=&dispCtgrType=&pageNo=1&benefits=&brandCd=&brandNm=&attributes=&verticalType=ALL&fromPrice=90000&toPrice=100000&reSearchYN=N&method=getDisplayCategory2Depth&dispCtgrLevel=3&dispCtgrNo=1017940&lCtgrNo=117025&mCtgrNo=1017936&sCtgrNo=1017940&dCtgrNo=0&isAddDispCtgr=false&attrYearNavi=&sortCd=L&pageSize=40&viewType=L&totalCount=34&pageNum=1&researchFlag=false&kwd=&excptKwd=&minPrice=90000&maxPrice=100000&stPrice=&kwd2=&prevKwd2=&kwdExcept=&clearAll=&kwdInCondition=&exceptKwdInCondition=&myPrdViewYN=Y&previousKwd=&previousExcptKwd=&isPremiumItem=&xzone=&partnerSellerNos=&partnerFilterYN=&dealPrdYN=N&brdParam=&catalogYN=N&ajaxYn=Y&engineRequestUrl=

exports.handler = function (event, context, callback) {
    now = Math.floor(Date.now() / 1000);
    lowestPrices = {};
    statistics = {};

    async.waterfall([
        start,
        requestNaverShoppingSearch,
        requestNaverShoppingBridge,
        requestNaverShoppingWemakeprice,
        requestListPage,
        function (result, callback) {
            async.eachLimit(result.data.items, 5, parseItem, function (err) {
                callback(err, result);
            });
        },
        makeReport,
        saveReport,
        notifyReport,
    ], function (err, result) {
        if (err) {
            console.log(err);
        }
    });

    if (callback) {
        callback(null);
    }
};
