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
    Item: {
        site: 'wemakeprice',
        type: '문화상품권',
        items: [
            {
                url: 'http://www.wemakeprice.com/deal/adeal/4515796/103900/'
            }
        ]
    }
}
docClient.put(params).promise().then(res => {
    console.log(res);
});
