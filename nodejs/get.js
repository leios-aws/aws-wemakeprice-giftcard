#!/usr/bin/env node
const AWS = require('aws-sdk');

AWS.config.update({
    region: 'ap-northeast-2',
    endpoint: "http://dynamodb.ap-northeast-2.amazonaws.com"
})

const dynamodb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();


var params = {
    TableName: 'giftcard',
    Key: {
        'site': 'wemakeprice',
        'type': '문화상품권'
    }
}

for (var i = 0; i < 1000; i++) {
    docClient.get(params).promise().then(res => {
        console.log(JSON.stringify(res));
    });
}
