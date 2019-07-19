const request = require('request');
const config = require('config');
const cheerio = require('cheerio');
const async = require('async');
const AWS = require('aws-sdk');
AWS.config.update({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com"
})

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

var requestMainPage = function (callback) {
    var option = {
        uri: 'http://www.wemakeprice.com/main/103900/103912',
        method: 'GET',
        qs: {
        }
    };

    request(option, function (err, response, body) {
        callback(err, response, body);
    });
};

var parseMainPage = function (response, body, callback) {
    var $ = cheerio.load(body);
    var items = $('ul.lst_shopping').children("li").map((index, element) => {
        var result = {};

        var href = $("span.type03 > a", element).attr('href').split('?')[0];
        if (href.startsWith('http')) {
            result.url = href;
        } else {
            result.url = 'http://www.wemakeprice.com' + href;
        }
        result.price = parseInt($("span.type03 > a > span.box_desc > span.txt_info > span.price > span.sale", element).text().replace(/,/g, ''));
        result.title = $("span.type03 > a > span.box_desc > strong.tit_desc", element).text();

        if (result.price < 88000) {
            return null;
        }
        if (result.price > 101000) {
            return null;
        }
        return result;
    }).get();

    callback(null, items);
};

var processItem = function(item, callback) {

    var option = {
        uri: item.url,
        method: 'GET',
        qs: {
        }
    };

    request(option, function (err, response, body) {
        console.log("Title:", item.title);
        console.log("Price:", item.price);
        console.log("URL:", item.url);
    
        if (err) {
            console.log(err);
        } else {
            var matches = body.match(/(var aCouponList = .*)/);
            if ( matches && matches.length > 1) {
                console.log(item.title, matches[1]);
                eval(matches[1]);
                console.log(aCouponList);
            } else {
                console.log("Not found!");
            }
        }
        callback(err, response, body);
    });
};

exports.handler = function (event, context, callback) {
    var authConfig = config.get('auth');

    request.defaults({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'ko,en-US;q=0.8,en;q=0.6'
        },
        jar: true,
        gzip: true,
        followAllRedirects: true,
        encoding: null
    });

    var detailPage = {
        uri: 'http://www.wemakeprice.com/main/103900/103912',
        method: 'GET',
        qs: {
        }
    };

    async.waterfall([
        requestMainPage,
        parseMainPage,
        function(items, callback) {
            async.eachLimit(items, 5, processItem, function(err) {
                callback(err);
            });
        }
    ], function (err) {
        if (err) {
            console.log(err);
        }
    })

    if (callback) {
        callback(null, 'Success');
    }
};
