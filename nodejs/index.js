var request = require('request-promise');
var config = require('config');
var cheerio = require('cheerio');
const AWS = require('aws-sdk');

AWS.config.update({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com"
})

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = function(event, context, callback) {
    var authConfig = config.get('auth');

    var mainPage = {
        uri: 'http://www.wemakeprice.com/main/103900/103912',
        method: 'GET',
        qs: {
        },
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
    };

    var detailPage = {
        uri: 'http://www.wemakeprice.com/main/103900/103912',
        method: 'GET',
        qs: {
        },
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
    };

    request(mainPage).then(function(html){
        var $ = cheerio.load(html);
        $('ul.lst_shopping').children("li").each((index, element) => {
            var url = 'http://www.wemakeprice.com' + $("span.type03 > a", element).attr('href').split('?')[0]; 
            console.log($("span.type03 > a", element).attr('href'));
            console.log($("span.type03 > a > span.box_desc > strong.tit_desc", element).text());
            console.log("Navigating", url);
            request(url).then(function(html) {
                console.log("detail page");
                /(var aCouponList=.*)/.exec(html.toString());
                process.exit(1);
            });
            
            console.log("===========================================");
        });
    }).catch(function(error) {
        if (error) {
            throw error;
        }
    });

    if (callback) {
        callback(null, 'Success');
    }
};
