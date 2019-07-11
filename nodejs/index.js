var request = require('request-promise');
var config = require('config');

exports.handler = function(event, context, callback) {
    var authConfig = config.get('auth');

    var mainPage = {
        uri: 'https://whooing.com/',
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
    var loginPage = {
        uri: 'https://whooing.com/auth/login',
        method: 'POST',
        form: {
            login: authConfig.id,
            password: authConfig.pw,
            submitting: '1',
            go_to: ''
        },
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate',
            'Accept-Language': 'ko,en-US;q=0.8,en;q=0.6',
            'Referer': 'https://whooing.com'
        },
        jar: true,
        gzip: true,
        followAllRedirects: true,
        encoding: null
    };
    var attendPage = {
        uri: 'https://whooing.com/',
        method: 'POST',
        form: {
            section_id: 's'
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
        return request(loginPage);
    }).then(function(html) {
        return request(attendPage);
    }).then(function(html){
        if (html.indexOf('top_user_logout') > -1) {
            console.log("Login success");
        } else {
            console.log(html.toString());
        }
    }).catch(function(error) {
        if (error) {
            throw error;
        }
    });

    if (callback) {
        callback(null, 'Success');
    }
};
