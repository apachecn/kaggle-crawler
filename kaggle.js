/*
npm install sync-request
npm install cheerio
npm install gen-epub@git+https://github.com/258ch/gen-epub
apt install imagemagick
apt install pngquant
*/

var request_ = require('sync-request')
var fs = require('fs')
var {URL} = require('url')
var cheerio = require('cheerio')
var genEpub = require('gen-epub')
var crypto = require('crypto');
var os = require('os')
var path = require('path')
var betterImg = require('./img-better.js')

function requestWithRetry(method, url, kwargs, n=5) {
    
    for(var i = 0; i < n; i++) {
        try {
            return request_(method, url, kwargs)
        } catch(ex) {
            if(i == n - 1) throw ex;
        }
    }
}

function processImg(html, pageUrl, imgs) {
    
    var $ = cheerio.load(html);
    
    var $imgs = $('img');

    for(var i = 0; i < $imgs.length; i++) {
        
        try {
            var $img = $imgs.eq(i);
            var url = $img.attr('src');
            if(!url.startsWith('http'))
                url = new URL(url, pageUrl).toString()
            
            var picname = crypto.createHash('md5').update(url).digest('hex') + ".jpg";
            console.log(`pic: ${url} => ${picname}`)
            
            if(!imgs.has(picname)) {
                var data = request('GET', url).getBody();
                data = betterImg(data)
                imgs.set(picname, data);
            }
            
            $img.attr('src', '../Images/' + picname);
        } catch(ex) {console.log(ex.toString())}
    }
    
    return $.html();

}

var request = requestWithRetry

function getCode(html) {
    var code = /source":(".+?")/.exec(html)[1]
    return '<pre>' + JSON.parse(code) + '</pre>'
}

function getContentUrl(html) {
    return /https?:\/\/www\.kaggleusercontent\.com\/kf\/\d+\/.+?\/__results__\.html/.exec(html)[0]
}

function getBody(html) {
    
    return cheerio.load(html)('body').html()
}

function getToc(id) {
    
    var url = `https://www.kaggle.com/kernels.json?sortBy=hotness&group=everyone&pageSize=10000&competitionId=${id}`
    var j = request('GET', url).body.toString()
    j = JSON.parse(j)
    return j
}

function compToId(name) {
    var url = `https://www.kaggle.com/c/${name}/kernels`
    var html = request('GET', url).body.toString()
    var id = /kaggle\/(\d+)/.exec(html)[1]
    return id
}

function safeMkDir(dir) {
    try {fs.mkdirSync(dir)}
    catch(ex) {}
}

function main() {
    
    var name = process.argv[2]
    console.log(`name: ${name}`)
    var id = compToId(name)
    console.log(`id: ${id}`)
    var toc = getToc(id)
    var articles = []
    var imgs = new Map()
    for(var it of toc) {
        
        var prefix = 'https://www.kaggle.com'
        var url = prefix + it.scriptUrl
        console.log(`url: ${url}`)
        var html = request('GET', url).body.toString()
        if(it.isNotebook){
            var realUrl = getContentUrl(html)
            var co =  request('GET', realUrl).body.toString()
            co = processImg(co, realUrl, imgs)
            co = getBody(co)
        } else {
            var co = getCode(html)
        }
        var from = `<p>From: <a href='${url}'>${url}</a></p>`
        var score = ''
        if(it.bestPublicScore)
            score = `<p>Score: ${it.bestPublicScore}</p>`
        var au = `<p>Author: <a href='${prefix + it.author.profileUrl}'>${it.author.displayName}</a></p>`
        co = `${from}\n${au}\n${score}\n${co}`
        articles.push({title: it.title, content: co})
    }
    
    articles.splice(0, 0, {title: `Kaggle Kernel - ${name}`, content: ''})
    genEpub(articles, imgs)
    
}

if(module == require.main) main()