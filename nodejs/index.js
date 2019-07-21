const request = require('request');
const config = require('config');
const cheerio = require('cheerio');
const async = require('async');
const sha1 = require('sha1');
const AWS = require('aws-sdk');
AWS.config.update({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com"
});

//const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

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
        message: "",
        loggedIn: false,
    });
};

var requestListPage = function (result, callback) {
    var option = {
        uri: 'http://www.wemakeprice.com/main/103900/103912',
        method: 'GET',
        qs: {
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Parsing Item List");
        if (!err) {
            var $ = cheerio.load(body);
            result.data.items = $('ul.lst_shopping').children("li").map((index, element) => {
                var item = {};

                var href = $("span.type03 > a", element).attr('href').split('?')[0];
                if (href.startsWith('http')) {
                    item.url = href;
                } else {
                    item.url = 'http://www.wemakeprice.com' + href;
                }
                item.price = parseInt($("span.type03 > a > span.box_desc > span.txt_info > span.price > span.sale", element).text().replace(/,/g, ''), 10);
                item.title = $("span.type03 > a > span.box_desc > strong.tit_desc", element).text();

                if (item.price < 88000) {
                    return null;
                }
                if (item.price > 101000) {
                    return null;
                }
                return item;
            }).get();
        }

        callback(err, result);
    });
};

var processItem = function (item, callback) {
    var option = {
        uri: item.url,
        method: 'GET',
        qs: {
        }
    };

    req(option, function (err, response, body) {
        if (!err) {
            var matches = body.match(/(var aCouponList = .*)/);
            if (matches && matches.length > 1) {
                eval(matches[1]);

                item.couponList = aCouponList.map((value, index, array) => {
                    var timestamp = Date.now() / 1000;
                    if (value.publish_start_time < timestamp && timestamp <= value.publish_end_time && value.usable_time < timestamp && timestamp <= value.expire_time) {
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
                console.log("Pattern not found!");
            }
        }
        item.lowestPrice = item.couponList.reduce((prev, curr, index) => {
            var curr_price = item.price;
            for (var i = 0; i < 20; i++) {
                if (curr.min_payment_amount < (item.price * i)) {
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
            ":site": 'wemakeprice-giftcard'
        }
    };

    console.log("Making Report");
    docClient.query(queryParams, (err, res) => {
        if (!err) {
            if (res.Items.length > 0 && res.Items[0].data) {
                var saved = res.Items[0].data;
                result.data.items.forEach((value, index) => {
                    console.log(`Checking item ${value.title}`);
                    var found = saved.items.reduce((f, curr) => {
                        if (f) {
                            return f;
                        } else {
                            if (curr.url === value.url) {
                                if (value.lowestPrice !== curr.lowestPrice ) {
                                    console.log(`New lowest price ${value.title} => ${value.lowestPrice}`);
                                    result.message += `[가격 변동]\n품명: ${value.title}\nURL: ${value.url}\n가격: ${value.price}\n최저가: ${curr.lowestPrice} => ${value.lowestPrice}\n\n`;
                                }
                                return value;
                            }
                        }
                    }, null);
                    if (!found) {
                        console.log(`New item ${value.title}`);
                        result.message += `[신규 상품 등록]\n품명: ${value.title}\nURL: ${value.url}\n가격: ${value.price}\n최저가: ${value.lowestPrice}\n\n`;
                    }
                });
            }
        }
        callback(err, result);
    });
};

var saveReport = function (result, callback) {
    var putParams = {
        TableName: 'webdata',
        Item: {
            site: 'wemakeprice-giftcard',
            timestamp: Math.floor(Date.now() / 1000),
            ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
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

exports.handler = function (event, context, callback) {
    async.waterfall([
        start,
        requestListPage,
        function (result, callback) {
            async.eachLimit(result.data.items, 5, processItem, function (err) {
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
        callback(null, 'Success');
    }
};
