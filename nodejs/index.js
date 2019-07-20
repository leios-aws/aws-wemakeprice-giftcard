const request = require('request');
const config = require('config');
const cheerio = require('cheerio');
const async = require('async');
const sha1 = require('sha1');
const AWS = require('aws-sdk');
AWS.config.update({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com"
})

const dynamodb = new AWS.DynamoDB();
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
            items: []
        },
        message: ""
    });
}

var requestCaptcha = function (result, callback) {
    var option = {
        uri: 'https://front.wemakeprice.com/api/user/login/getCaptchaId.json',
        method: 'GET',
        json: true,
        qs: {
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Parsing Captcha");
        captchaId = body && body.data && body.data.captchaId;
        if (captchaId) {
            callback(err, result);
        } else {
            callback("captchaId not found!", result);
        }
    });
};

var requestSalt = function (result, callback) {
    var option = {
        uri: 'https://front.wemakeprice.com/api/user/login/salt.json',
        method: 'GET',
        json: true,
        qs: {
            _: Date.now()
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Parsing Salt");
        saltValue = body && body.data && body.data.salt;
        if (saltValue) {
            callback(err, result);
        } else {
            callback("saltValue not found!", result);
        }
    });
};

var requestLoginPage = function (result, callback) {
    var authConfig = config.get('auth');

    var lowerCasePW = authConfig.pw.toLowerCase();
    var loginSalts = saltValue.substr(1, 1) + saltValue.substr(4, 1) + saltValue.substr(8, 1) + saltValue.substr(12, 1);
    var encryptValue = sha1(loginSalts + sha1(lowerCasePW)) + loginSalts;

    var option = {
        uri: 'https://front.wemakeprice.com/api/edge/login.json',
        method: 'POST',
        json: true,
        body: {
            captcha: "",
            captchaId: captchaId,
            selectionYn: "N",
            userId: authConfig.id,
            userPassword: encryptValue
        },
        headers: {
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Content-Type': 'application/json'
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Parsing Login Result");
        loginToken = body && body.data && body.data.loginToken;
        if (loginToken) {
            callback(err, result);
        } else {
            callback("loginToken not found!", result);
        }
    });
};

var requestMainPage = function (result, callback) {
    var option = {
        uri: 'https://front.wemakeprice.com/main',
        method: 'GET',
        qs: {
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Checking Login Result");
        if (!err && body.indexOf("_logOutBtn") < 0) {
            callback("Login Fail!", result);
        } else {
            callback(err, result);
        }
    });
};

var requestCouponPage = function (result, callback) {
    var option = {
        uri: 'https://front.wemakeprice.com/mypage/coupon',
        method: 'GET',
        qs: {
        }
    };

    req(option, function (err, response, body) {
        result.response = response;
        result.body = body;

        console.log("Parsing Coupon Count");
        if (!err) {
            var $ = cheerio.load(body);
            result.data.couponCount = $('div.my_detail_box.on > dl > dd:nth-child(6) > a > em').text();
            console.log("Coupon Count:", result.data.couponCount);
        }

        callback(err, result);
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
                item.price = parseInt($("span.type03 > a > span.box_desc > span.txt_info > span.price > span.sale", element).text().replace(/,/g, ''));
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
                item.couponList = aCouponList;
            } else {
                console.log("Pattern not found!");
            }
        }
        callback(err);
    });
};

var makeReport = function (result, callback) {
    var params = {
        TableName: 'web-data',
        Key: {
            'site': 'wemakeprice',
            'type': '상품권'
        }
    }

    docClient.get(params, (err, res) => {
        if (!err) {
            console.log(JSON.stringify(res));
            var saved = res.Item.data;

            if (saved.couponCount !== result.data.couponCount) {
                result.message += `계정 쿠폰 갯수 변경: ${result.data.couponCount}\n`;
            }
        }
        callback(err, result);
    });
};

var saveReport = function (result, callback) {
    var params = {
        TableName: 'web-data',
        Item: {
            site: 'wemakeprice',
            type: "상품권",
            data: result.data
        }
    }

    docClient.put(params, (err, res) => {
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
    var authConfig = config.get('auth');

    async.waterfall([
        start,
        requestCaptcha,
        requestSalt,
        requestLoginPage,
        requestMainPage,
        requestListPage,
        function (result, callback) {
            async.eachLimit(result.data.items, 5, processItem, function (err) {
                callback(err, result);
            });
        },
        requestCouponPage,
        makeReport,
        saveReport,
        notifyReport,
    ], function (err, result) {
        if (err) {
            console.log(err);
        }
    })

    if (callback) {
        callback(null, 'Success');
    }
};
